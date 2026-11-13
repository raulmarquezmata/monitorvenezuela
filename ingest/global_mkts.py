"""Mercados internacionales: bolsas, volatilidad, dólar, oro, bitcoin, tasas del Tesoro y mapa del S&P 500.

- Índices y precios: Yahoo Finance (cierre diario; en horario de mercado, el último precio del día).
- Tasas del Tesoro (2, 5, 10, 20 y 30 años): curva diaria del Departamento del Tesoro de EE.UU.;
  si no responde, FRED; y para 5, 10 y 30 años, Yahoo Finance.
- Mapa del S&P 500: composición y peso de cada empresa según el fondo SPY (State Street), y rendimiento
  de cada acción (día, semana, mes, año) con Yahoo Finance. Se guarda como JSON en Supabase Storage.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
import json
import time

from .common import Run, ensure_bucket, fetch, save_obs, select, storage_upload

YF = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
SPARK = "https://query1.finance.yahoo.com/v7/finance/spark"
INDICES = {  # serie -> símbolo de Yahoo
    "sp500": "^GSPC", "nasdaq": "^IXIC", "dow_jones": "^DJI", "vix": "^VIX", "dxy": "DX-Y.NYB",
    "oro_diario": "GC=F", "bitcoin": "BTC-USD", "eem": "EEM",
    "bovespa": "^BVSP", "merval": "^MERV", "ipc_mexico": "^MXX", "ipsa_chile": "^IPSA",
}
RATES = {"ust_2a": ("2 Yr", "DGS2", None), "ust_5a": ("5 Yr", "DGS5", "^FVX"), "ust_10a": ("10 Yr", "DGS10", "^TNX"),
         "ust_20a": ("20 Yr", "DGS20", None), "ust_30a": ("30 Yr", "DGS30", "^TYX")}
TREASURY = ("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{y}/all"
            "?type=daily_treasury_yield_curve&field_tdr_date_value={y}&page&_format=csv")
SPY_HOLDINGS = "https://www.ssga.com/us/en/intermediary/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx"
SECTOR_ES = {"Information Technology": "Tecnología", "Financials": "Financiero", "Health Care": "Salud", "Consumer Discretionary": "Consumo discrecional",
             "Communication Services": "Comunicaciones", "Industrials": "Industrial", "Consumer Staples": "Consumo básico", "Energy": "Energía",
             "Utilities": "Servicios públicos", "Real Estate": "Inmobiliario", "Materials": "Materiales", "Other": "Otros"}
BUCKET = "reportes"


def closes(sym: str, rng: str = "1mo") -> list[tuple[str, float]]:
    j = fetch(YF.format(sym=sym), params={"range": rng, "interval": "1d"}, timeout=30, retries=2).json()
    res = j["chart"]["result"][0]
    q = res["indicators"]["quote"][0]["close"]
    out = [(dt.datetime.utcfromtimestamp(t).date().isoformat(), c) for t, c in zip(res.get("timestamp") or [], q) if c]
    # último precio del día (en horario de mercado el cierre todavía no existe)
    m = res.get("meta") or {}
    if m.get("regularMarketPrice") and m.get("regularMarketTime"):
        d = dt.datetime.utcfromtimestamp(m["regularMarketTime"]).date().isoformat()
        out = [p for p in out if p[0] != d] + [(d, m["regularMarketPrice"])]
    return out


def indices(r: Run) -> None:
    for code, sym in INDICES.items():
        try:
            have = select("observations", {"select": "date", "series_code": f"eq.{code}", "limit": 1})
            r.rows += save_obs(code, closes(sym, "5d" if have else "10y"), f"Yahoo Finance ({sym})")
        except Exception as e:  # noqa: BLE001
            r.note(f"{code}: {str(e)[:80]}")


def rates(r: Run) -> None:
    got: dict[str, list] = {k: [] for k in RATES}
    years = [dt.date.today().year]
    if not select("observations", {"select": "date", "series_code": "eq.ust_10a", "limit": 1}):
        years = list(range(dt.date.today().year - 9, dt.date.today().year + 1))
    try:
        for y in years:
            txt = fetch(TREASURY.format(y=y), timeout=40, retries=2).text
            for row in csv.DictReader(io.StringIO(txt)):
                d = dt.datetime.strptime(row["Date"], "%m/%d/%Y").date().isoformat()
                for code, (col, _, _) in RATES.items():
                    if row.get(col):
                        got[code].append((d, float(row[col])))
    except Exception as e:  # noqa: BLE001
        r.log.info("Tesoro: %s", e)
    for code, (_, fred, yf) in RATES.items():
        src = "Departamento del Tesoro de EE.UU."
        if not got[code]:
            try:
                from .fx import fred_series
                got[code] = fred_series(fred)[-800:]
                src = "FRED"
            except Exception:  # noqa: BLE001
                if yf:
                    try:
                        got[code] = closes(yf, "5d")
                        src = f"Yahoo Finance ({yf})"
                    except Exception as e:  # noqa: BLE001
                        r.note(f"{code}: {str(e)[:80]}")
        if got[code]:
            r.rows += save_obs(code, got[code], src)


def spy_holdings() -> list[dict]:
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(fetch(SPY_HOLDINGS, timeout=60, retries=2).content), read_only=True, data_only=True)
    ws = wb.active
    rows, head = [], None
    for row in ws.iter_rows(values_only=True):
        cells = [str(c).strip() if c is not None else "" for c in row]
        if head is None:
            if "Ticker" in cells and "Weight" in cells:
                head = cells
            continue
        rec = dict(zip(head, cells))
        t = rec.get("Ticker", "")
        if not t or t in ("-", "CASH_USD") or not rec.get("Weight"):
            continue
        try:
            w = float(rec["Weight"])
        except ValueError:
            continue
        rows.append({"t": t.replace(".", "-"), "n": rec.get("Name", "").title(), "s": rec.get("Sector", ""), "w": w})
    return rows


WIKI_SP500 = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"


def industries() -> dict[str, tuple[str, str]]:
    """Sector e industria (GICS) de cada empresa del S&P 500, desde la lista pública de Wikipedia."""
    from bs4 import BeautifulSoup
    html = fetch(WIKI_SP500, timeout=40, retries=2).text
    tbl = BeautifulSoup(html, "html.parser").find("table", {"id": "constituents"})
    out = {}
    for tr in tbl.find_all("tr")[1:]:
        td = [c.get_text(strip=True) for c in tr.find_all(["td", "th"])]
        if len(td) >= 4:
            out[td[0].replace(".", "-")] = (td[2], td[3])
    return out


def spark(symbols: list[str]) -> dict[str, list[float]]:
    """Cierres diarios del último año para hasta 20 símbolos por consulta."""
    out = {}
    j = fetch(SPARK, params={"symbols": ",".join(symbols), "range": "1y", "interval": "1d"}, timeout=40, retries=2).json()
    for x in (j.get("spark") or {}).get("result") or []:
        try:
            resp = x["response"][0]
            ts, cl = resp["timestamp"], resp["indicators"]["quote"][0]["close"]
            out[x["symbol"]] = [(dt.datetime.utcfromtimestamp(t).date().isoformat(), c) for t, c in zip(ts, cl) if c]
            price = (resp.get("meta") or {}).get("regularMarketPrice")
            if price and out[x["symbol"]]:
                out[x["symbol"]][-1] = (out[x["symbol"]][-1][0], price)
        except Exception:  # noqa: BLE001
            continue
    return out


def ret(pts: list[tuple[str, float]], since: str | None = None, back: int | None = None) -> float | None:
    if len(pts) < 2:
        return None
    last = pts[-1][1]
    if back is not None:
        base = pts[-1 - back][1] if len(pts) > back else None
    else:
        prior = [v for d, v in pts if d < since]
        base = prior[-1] if prior else None
    return round((last / base - 1) * 100, 2) if base else None


def sp500_map(r: Run, budget: float = 150.0) -> None:
    """Rendimientos de cada empresa del S&P 500 → reportes/mercado/sp500.json (lo lee la página)."""
    now = dt.datetime.now(dt.timezone.utc)
    us_hours = now.weekday() < 5 and 13 <= now.hour <= 21
    prev = None
    try:
        prev = json.loads(fetch(f"{__import__('os').environ.get('SUPABASE_URL', '').rstrip('/')}/storage/v1/object/public/{BUCKET}/mercado/sp500.json", timeout=20, retries=1).text)
    except Exception:  # noqa: BLE001
        pass
    incomplete = bool(prev) and (len({x.get("s") for x in prev["rows"]}) < 5 or any(not x.get("i") for x in prev["rows"]))
    if prev and not us_hours and prev.get("updated", "")[:10] == now.date().isoformat() and not incomplete:
        return  # fuera de horario y ya actualizado hoy (salvo que le falten sectores o industrias)
    comp = None
    if prev and prev.get("holdings_date") and (now.date() - dt.date.fromisoformat(prev["holdings_date"])).days < 7:
        comp = [{k: x.get(k) for k in ("t", "n", "s", "w", "i")} for x in prev["rows"]]
    if not comp:
        try:
            comp = spy_holdings()
        except Exception as e:  # noqa: BLE001
            r.note(f"Composición del S&P 500 (SPY): {str(e)[:80]}")
            if not prev:
                return
            comp = [{k: x.get(k) for k in ("t", "n", "s", "w", "i")} for x in prev["rows"]]
        try:
            ind = industries()
            for c in comp:
                sec, sub = ind.get(c["t"], (None, None))
                c["s"] = sec or c.get("s") or "Other"
                c["i"] = sub or c.get("i") or c["s"]
        except Exception as e:  # noqa: BLE001
            r.note(f"Industrias (Wikipedia): {str(e)[:80]}")
            for c in comp:
                c["s"] = c.get("s") or "Other"
                c["i"] = c.get("i") or c["s"]
        holdings_date = now.date().isoformat()
    else:
        holdings_date = prev["holdings_date"]
        if any(not c.get("i") or not c.get("s") or c.get("i") == c.get("s") for c in comp):  # sin sector o industria: se completan ya
            try:
                ind = industries()
                for c in comp:
                    sec, sub = ind.get(c["t"], (None, None))
                    c["s"] = sec or c.get("s") or "Other"
                    c["i"] = sub or c.get("i") or c["s"]
            except Exception as e:  # noqa: BLE001
                r.note(f"Industrias (Wikipedia): {str(e)[:80]}")
    t0, data = time.time(), {}
    syms = [c["t"] for c in comp]
    for i in range(0, len(syms), 20):
        if time.time() - t0 > budget:
            break
        try:
            data.update(spark(syms[i:i + 20]))
        except Exception as e:  # noqa: BLE001
            r.log.info("spark %s: %s", i, e)
        time.sleep(0.3)
    y0 = f"{now.year}-01-01"
    rows = []
    old = {x["t"]: x for x in (prev or {}).get("rows", [])}
    for c in comp:
        pts = data.get(c["t"])
        if pts:
            rows.append({**c, "se": SECTOR_ES.get(c["s"], c["s"]), "p": round(pts[-1][1], 2), "d": ret(pts, back=1),
                         "wk": ret(pts, back=5), "m": ret(pts, back=21), "y": ret(pts, since=y0),
                         "sp": [round(v, 2) for _, v in pts[-22:]]})  # último mes, para la minigráfica
        elif c["t"] in old:
            rows.append(old[c["t"]])
    if len(rows) < 100:
        r.note(f"Mapa S&P 500: solo {len(rows)} empresas con precio")
        return
    ensure_bucket(BUCKET)
    payload = {"updated": now.isoformat(), "holdings_date": holdings_date, "rows": rows}
    storage_upload(BUCKET, "mercado/sp500.json", json.dumps(payload, ensure_ascii=False).encode(), content_type="application/json", max_age=60)
    r.rows += len(rows)


def run():
    with Run("global") as r:
        indices(r)
        rates(r)
        try:
            sp500_map(r)
        except Exception as e:  # noqa: BLE001
            r.note(f"Mapa S&P 500: {str(e)[:120]}")
