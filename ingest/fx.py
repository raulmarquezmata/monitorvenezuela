"""Tipo de cambio.

- Oficial (USD y EUR): portal del BCV, guardado por FECHA VALOR. Respaldo: DolarApi.
- Paralelo: Binance P2P (USDT/VES), mediana de los mejores anuncios de compra y de venta.
  Respaldo si Binance no responde: Yadio vía DolarApi (queda marcado en la fuente).
- Histórico (backfill): oficial diario desde la reconversión de oct-2021 (Frankfurter, proveedor
  BCV) + DolarApi; paralelo histórico de DolarApi (Yadio) donde no hay Binance.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import re
import statistics

from bs4 import BeautifulSoup

from .common import Run, fetch, http, iso, save_obs, select, today_caracas, ve_number

BCV_HOME = "https://www.bcv.org.ve/"
DOLARAPI = "https://ve.dolarapi.com/v1"
BINANCE = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search"
FRANKFURTER = "https://api.frankfurter.dev/v2/rates.csv"
BCV_IDS = {"dolar": "usd_bcv", "euro": "eur_bcv"}
RECONVERSION = "2021-10-01"


def parse_bcv_home(html: str) -> tuple[str | None, dict[str, float]]:
    soup = BeautifulSoup(html, "html.parser")
    rates = {}
    for div_id, code in BCV_IDS.items():
        div = soup.find(id=div_id)
        strong = div.find("strong") if div else None
        v = ve_number(strong.get_text()) if strong else None
        if v:
            rates[code] = v
    fecha = None
    m = re.search(r'Fecha\s*Valor.*?content="(\d{4}-\d{2}-\d{2})', html, re.S | re.I)
    if not m:
        m = re.search(r'date-display-single[^>]*content="(\d{4}-\d{2}-\d{2})', html)
    if m:
        fecha = m.group(1)
    return fecha, rates


# ------------------------------------------------------------------ Binance P2P
def binance_side(trade_type: str, rows: int = 20) -> list[float]:
    body = {"fiat": "VES", "asset": "USDT", "tradeType": trade_type, "page": 1, "rows": rows,
            "countries": [], "proMerchantAds": False, "shieldMerchantAds": False, "filterType": "all",
            "periods": [], "additionalKycVerifyFilter": 0, "publisherType": None, "payTypes": [],
            "classifies": ["mass", "profession", "fiat_trade"]}
    r = fetch(BINANCE, method="POST", json=body, timeout=30,
              headers={"Content-Type": "application/json", "Origin": "https://p2p.binance.com"})
    data = r.json().get("data") or []
    return [float(d["adv"]["price"]) for d in data if d.get("adv", {}).get("price")]


def binance_rate() -> tuple[float, float, float]:
    """(promedio, mediana compra, mediana venta) en Bs por USDT."""
    buy, sell = binance_side("BUY"), binance_side("SELL")
    if len(buy) < 3 or len(sell) < 3:
        raise RuntimeError(f"Binance devolvió pocos anuncios (compra {len(buy)}, venta {len(sell)})")
    b, s = statistics.median(buy), statistics.median(sell)
    return (b + s) / 2, b, s


# ------------------------------------------------------------------ histórico oficial
def frankfurter_history(since: str = RECONVERSION) -> dict[str, list]:
    """Oficial BCV diario desde la reconversión. Frankfurter cotiza moneda extranjera por 1 Bs → se invierte."""
    out = {"usd_bcv": [], "eur_bcv": []}
    txt = fetch(FRANKFURTER, params={"base": "VES", "providers": "bcv", "from": since}, timeout=120).text
    for row in csv.DictReader(io.StringIO(txt)):
        q, rate = (row.get("quote") or "").upper(), float(row.get("rate") or 0)
        code = {"USD": "usd_bcv", "EUR": "eur_bcv"}.get(q)
        if code and rate > 0:
            out[code].append((row["date"][:10], 1 / rate))
    return out


def gap_from_db(days: int = 400) -> int:
    """Brecha = paralelo / oficial vigente − 1 (el oficial de la misma fecha o el último anterior)."""
    since = iso(today_caracas() - dt.timedelta(days=days))
    q = lambda c: {r["date"]: r["value"] for r in select("observations", {
        "select": "date,value", "series_code": f"eq.{c}", "date": f"gte.{since}", "order": "date"})}
    of, pa = q("usd_bcv"), q("usd_paralelo")
    if not of or not pa:
        return 0
    of_dates = sorted(of)
    pts, j = [], 0
    for d in sorted(pa):
        while j + 1 < len(of_dates) and of_dates[j + 1] <= d:
            j += 1
        if of_dates[j] <= d:
            pts.append((d, (pa[d] / of[of_dates[j]] - 1) * 100))
    return save_obs("brecha_cambiaria", pts, "Cálculo propio")


def run(backfill: bool = False):
    with Run("fx") as r:
        today = iso(today_caracas())
        # 1) Oficial: portal BCV
        bcv_ok = False
        try:
            fecha, rates = parse_bcv_home(fetch(BCV_HOME, insecure_fallback=True, timeout=30).text)
            if rates and fecha:
                for code, v in rates.items():
                    r.rows += save_obs(code, [(fecha, v)], "BCV")
                bcv_ok = True
            else:
                r.note("BCV: no se encontraron tasas o fecha valor en el portal.")
        except Exception as e:  # noqa: BLE001
            r.note(f"BCV inaccesible: {e}")
        if not bcv_ok:
            try:
                j = fetch(f"{DOLARAPI}/dolares/oficial").json()
                v = j.get("promedio") or j.get("venta")
                if v:
                    r.rows += save_obs("usd_bcv", [((j.get("fechaActualizacion") or today)[:10], float(v))], "BCV vía DolarApi")
            except Exception as e:  # noqa: BLE001
                r.note(f"DolarApi oficial: {e}")

        # 2) Paralelo: Binance P2P (respaldo Yadio)
        try:
            avg, buy, sell = binance_rate()
            r.rows += save_obs("usd_paralelo", [(today, avg)], "Binance P2P")
            r.log.info("Binance P2P: compra %.2f · venta %.2f · promedio %.2f", buy, sell, avg)
        except Exception as e:  # noqa: BLE001
            r.note(f"Binance P2P no respondió ({e}); se usa Yadio como respaldo")
            try:
                j = fetch(f"{DOLARAPI}/dolares/paralelo").json()
                v = j.get("promedio") or j.get("venta")
                if v:
                    r.rows += save_obs("usd_paralelo", [(today, float(v))], "Yadio (respaldo)")
            except Exception as e2:  # noqa: BLE001
                r.note(f"Yadio: {e2}")

        # 3) Histórico
        if backfill:
            try:
                for code, pts in frankfurter_history().items():
                    r.rows += save_obs(code, pts, "BCV (vía Frankfurter)")
            except Exception as e:  # noqa: BLE001
                r.note(f"Histórico oficial Frankfurter: {e}")
            for kind, code, src in (("oficial", "usd_bcv", "BCV (vía DolarApi)"), ("paralelo", "usd_paralelo", "Yadio (histórico)")):
                try:
                    hist = fetch(f"{DOLARAPI}/historicos/dolares/{kind}", timeout=90).json()
                    pts = [(h["fecha"], h.get("promedio") or h.get("venta")) for h in hist if h.get("fecha")]
                    if kind == "paralelo":  # no pisar los datos de Binance ya guardados
                        have = {x["date"] for x in select("observations", {"select": "date", "series_code": "eq.usd_paralelo", "source": "eq.Binance P2P"})}
                        pts = [p for p in pts if p[0] not in have]
                    r.rows += save_obs(code, pts, src)
                except Exception as e:  # noqa: BLE001
                    r.note(f"Histórico {kind}: {e}")

        r.rows += gap_from_db(2000 if backfill else 30)


_ = http  # sesión compartida (cabeceras de navegador)
