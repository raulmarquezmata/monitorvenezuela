"""Bolsa de Valores de Caracas: cotizaciones de renta variable e índices (IBC, Financiero, Industrial).

Usa el mismo endpoint AJAX que alimenta la web de la BVC (datos con 15 min de retraso).
- run()              → resumen del día + índices (corre cada 30 min en horario de mercado)
- run(full=True)     → además, histórico OHLC por símbolo y datos del emisor (corre al cierre)
"""
from __future__ import annotations

import datetime as dt
import re
import time

from .common import Run, fetch, iso, save_obs, select, upsert, ve_number

AJAX = "https://www.bolsadecaracas.com/wp-admin/admin-ajax.php"
HDR = {"Content-Type": "application/x-www-form-urlencoded", "Referer": "https://www.bolsadecaracas.com/",
       "X-Requested-With": "XMLHttpRequest"}
MONTHS = {"JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6, "JUL": 7, "AUG": 8, "SEP": 9,
          "OCT": 10, "NOV": 11, "DEC": 12, "ENE": 1, "ABR": 4, "AGO": 8, "DIC": 12}
INDEX_MAP = {"IBC": "ibc", "FIN": "ibc_financiero", "IND": "ibc_industrial"}


def post(action: str, extra: dict | None = None, action_in_url: bool = True):
    url = f"{AJAX}?action={action}" if action_in_url else AJAX
    data = {"action": action, **(extra or {})}
    return fetch(url, method="POST", data=data, headers=HDR, timeout=45).json()


def jsnum(s) -> float | None:
    """Números del resumen vienen estilo JS ('221.25', '.06'); los del histórico, estilo VE ('1.234,56')."""
    if s is None or s == "":
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return ve_number(s)


def parse_date(s: str) -> dt.date | None:
    s = str(s).strip()
    m = re.match(r"(\d{1,2})-([A-Za-z]{3})-(\d{2,4})", s)
    if m:
        d, mon, y = m.groups()
        y = int(y) + (2000 if len(y) == 2 else 0)
        return dt.date(y, MONTHS[mon.upper()], int(d))
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s)
    if m:
        d, mo, y = map(int, m.groups())
        return dt.date(y, mo, d)
    m = re.match(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return dt.date(*map(int, m.groups()))
    return None


def parse_indices(data: dict) -> tuple[str | None, dict[str, list]]:
    """Devuelve (fecha de la sesión, {serie: [(fecha, valor)]})."""
    out: dict[str, list] = {}
    session = None
    for key, code in INDEX_MAP.items():
        pts = []
        for row in data.get(f"CUR_{key}_ANUAL", []) or []:
            d = parse_date(row.get("HORA", ""))
            v = jsnum(row.get("PRECIO"))
            if d and v:
                pts.append((d, v))
        intraday = []
        for row in data.get(f"CUR_{key}", []) or []:
            d = parse_date(row.get("HORA", ""))
            v = jsnum(row.get("PRECIO"))
            if d and v:
                intraday.append((row.get("HORA"), d, v))
        if intraday:
            intraday.sort(key=lambda x: (x[1], x[0][-8:]))
            _, d_last, v_last = intraday[-1]
            pts.append((d_last, v_last))  # cierre/último del día en curso
            if key == "IBC":
                session = iso(d_last)
        out[code] = pts
    return session, out


def to_usd(series_from: str, series_to: str, since: str, fx_code: str = "usd_bcv") -> int:
    """Convierte una serie en Bs a US$ con el tipo de cambio vigente en cada fecha."""
    get = lambda c: {r["date"]: r["value"] for r in select("observations", {
        "select": "date,value", "series_code": f"eq.{c}", "date": f"gte.{since}", "order": "date"})}
    fx, src = get(fx_code), get(series_from)
    if not fx or not src:
        return 0
    fx_dates = sorted(fx)
    pts, j = [], 0
    for d in sorted(src):
        while j + 1 < len(fx_dates) and fx_dates[j + 1] <= d:
            j += 1
        if fx_dates[j] <= d:
            pts.append((d, src[d] / fx[fx_dates[j]]))
    return save_obs(series_to, pts, "Cálculo propio")


def parse_resumen(rows: list[dict], session: str | None, market: str):
    """Cotizaciones del día (solo símbolos con volumen > 0), metadatos y monto total."""
    quotes, metas, monto = [], [], 0.0
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    for q in rows:
        sym = (q.get("COD_SIMB") or "").strip()
        if not sym:
            continue
        metas.append({"symbol": sym, "name": q.get("DESC_SIMB"), "market": market})
        vol = jsnum(q.get("VOLUMEN")) or 0
        amt = jsnum(q.get("MONTO_EFECTIVO")) or 0
        monto += amt
        if session and vol > 0:
            quotes.append({"date": session, "symbol": sym, "name": q.get("DESC_SIMB"), "market": market,
                           "close": jsnum(q.get("PRECIO")), "var_abs": jsnum(q.get("VAR_ABS")),
                           "var_pct": jsnum(q.get("VAR_REL")), "volume": vol, "amount": amt, "updated_at": now})
    return quotes, metas, monto


def history_for(symbol: str) -> tuple[dict | None, list[dict]]:
    data = post("getHistoricoSimbolo", {"simbolo": symbol})
    enc = (data.get("cur_hist_encab") or [{}])[0]
    meta = None
    if enc:
        meta = {"symbol": symbol, "name": enc.get("DESC_SIMB"), "company": enc.get("DESC_EMP"),
                "isin": enc.get("COD_ISIN"), "currency": enc.get("MONEDA"),
                "shares_outstanding": ve_number(enc.get("ACC_CIRC")) if isinstance(enc.get("ACC_CIRC"), str) else enc.get("ACC_CIRC"),
                "sector": enc.get("TIPO_INDI_SECTOR") or enc.get("TIPO_INDI"), "market": "RV",
                "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    rows = []
    for h in data.get("cur_hist_mov_emisora", []) or []:
        d = parse_date(h.get("FEC", ""))
        if not d:
            continue
        rows.append({"date": iso(d), "symbol": symbol, "name": enc.get("DESC_SIMB") if enc else None, "market": "RV",
                     "open": ve_number(h.get("PRECIO_APERT")), "close": ve_number(h.get("PRECIO_CIE")),
                     "high": ve_number(h.get("PRECIO_MAX")), "low": ve_number(h.get("PRECIO_MIN")),
                     "var_abs": ve_number(h.get("VAR_ABS")), "var_pct": ve_number(h.get("VAR_REL")),
                     "volume": ve_number(h.get("TOT_ACC_NEGOC")), "amount": ve_number(h.get("TOT_MONTO_NEGOC")),
                     "trades": int(ve_number(h.get("TOT_OP_NEGOC")) or 0) or None})
    return meta, rows


def run(full: bool = False):
    with Run("bvc_full" if full else "bvc") as r:
        # Índices y fecha de sesión
        session = None
        try:
            session, idx = parse_indices(post("chartsData", {"indice": "", "variacion": ""}, action_in_url=False))
            for code, pts in idx.items():
                r.rows += save_obs(code, pts, "BVC")
        except Exception as e:  # noqa: BLE001
            r.note(f"Índices: {e}")

        # Resumen del día: renta variable y renta fija
        symbols = []
        if session is None:
            r.note("Sin fecha de sesión (IBC intradía vacío): no se guardan cotizaciones del resumen.")
        for market, action, in_url, monto_code in (("RV", "resumenMercadoRentaVariable", False, "bvc_monto"),
                                                   ("RF", "resumenMercadoRentaFija", True, "bvc_monto_rf")):
            try:
                rows = post(action, action_in_url=in_url) or []
                quotes, metas, monto = parse_resumen(rows, session, market)
                if market == "RV":
                    symbols = [m["symbol"] for m in metas]
                upsert("bvc_symbols", metas, "symbol")
                r.rows += upsert("bvc_quotes", quotes, "date,symbol")
                if session and monto:
                    r.rows += save_obs(monto_code, [(session, monto)], "BVC")
            except Exception as e:  # noqa: BLE001
                r.note(f"Resumen {market}: {e}")

        # Histórico por símbolo (cierre del día / primera carga)
        if full:
            if not symbols:
                symbols = [s["symbol"] for s in select("bvc_symbols", {"select": "symbol", "market": "eq.RV"})]
            metas, n_err = [], 0
            for sym in symbols:
                try:
                    meta, rows = history_for(sym)
                    if meta:
                        metas.append(meta)
                    r.rows += upsert("bvc_quotes", rows, "date,symbol")
                except Exception as e:  # noqa: BLE001
                    n_err += 1
                    r.log.warning("Histórico %s: %s", sym, e)
                time.sleep(1)
            upsert("bvc_symbols", metas, "symbol")
            if n_err:
                r.note(f"Histórico: {n_err} símbolos con error")

        since = iso(dt.date.today() - dt.timedelta(days=4000 if full else 15))
        r.rows += to_usd("ibc", "ibc_usd", since)
        r.rows += to_usd("ibc", "ibc_usd_paralelo", since, "usd_paralelo")
