"""EE.UU.: inflación (IPC), empleo (nómina no agrícola y desempleo) y la Fed.

- IPC general y subyacente, nómina no agrícola y desempleo: API pública del BLS (sin clave). Tasa objetivo de la
  Fed (techo del rango): API de la Fed de Nueva York. Se guardan ya transformados (variación interanual y
  mensual del IPC; empleos creados en el mes, en miles).
- Probabilidades de la Fed: futuros de fondos federales a 30 días (CME, vía Yahoo Finance), con el método de
  CME FedWatch: el futuro del mes de la reunión promedia la tasa de antes y la de después según los días;
  la diferencia con la tasa de partida ÷ 0,25 da la probabilidad de un movimiento de 25 pb.
  Se publican: probabilidad de subida y de baja en la próxima reunión y tasa esperada tras ella (series diarias,
  con historia desde que el contrato de la reunión cotiza en Yahoo), y la tabla de las próximas reuniones
  en reportes/mercado/fed.json (la lee la página Internacional).
Corre con los robots frecuentes; el IPC y el empleo salen a las 8:30 a. m. de Nueva York y entran en minutos.
"""
from __future__ import annotations

import calendar
import datetime as dt
import json

from .common import Run, ensure_bucket, fetch, save_obs, storage_upload

YF = "https://query1.finance.yahoo.com/v8/finance/chart/{sym}"
MONTH_CODE = "FGHJKMNQUVXZ"
# reuniones del FOMC (segundo día = día de la decisión). Fuente: federalreserve.gov/monetarypolicy/fomccalendars.htm
FOMC = ["2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
        "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-11-17"]
BUCKET = "reportes"


def yoy(pts: list[tuple[str, float]], lag: int = 12) -> list[tuple[str, float]]:
    return [(pts[i][0], (pts[i][1] / pts[i - lag][1] - 1) * 100) for i in range(lag, len(pts))]


BLS = "https://api.bls.gov/publicAPI/v1/timeseries/data/"
# BLS (sin clave: 25 consultas al día, 10 años por consulta). FRED bloquea las IP de GitHub, por eso no se usa aquí.
BLS_IDS = {"CUSR0000SA0": "ipc", "CUSR0000SA0L1E": "sub", "CES0000000001": "nfp", "LNS14000000": "des"}
NYFED = "https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json"


def bls(y0: int, y1: int) -> dict[str, list[tuple[str, float]]]:
    j = fetch(BLS, method="POST", json={"seriesid": list(BLS_IDS), "startyear": str(y0), "endyear": str(y1)},
              timeout=40, retries=2).json()
    if j.get("status") != "REQUEST_SUCCEEDED":
        raise RuntimeError(f"BLS: {' '.join(j.get('message') or [])[:120]}")
    out = {}
    for s in (j.get("Results") or {}).get("series") or []:
        pts = []
        for d in s.get("data") or []:
            per = d.get("period") or ""
            if per.startswith("M") and per != "M13":
                try:
                    pts.append((f"{d['year']}-{per[1:]}-01", float(d["value"])))
                except (KeyError, ValueError):
                    pass
        out[BLS_IDS.get(s.get("seriesID"), "")] = sorted(pts)
    return out


def due(last: str | None, now: dt.datetime) -> bool:
    """¿Toca consultar el BLS? Solo si falta el dato del mes pasado, y sin gastar el cupo diario:
    el día de publicación (agenda) desde las 13:30 UTC en cada corrida de la primera media hora, y si no,
    una vez al día (16 UTC) por si la fecha cambió."""
    if not last:
        return True
    y, m = month_add(now.year, now.month, -1)
    if last >= f"{y}-{m:02d}-01":
        return False
    try:
        from pathlib import Path
        ag = json.loads((Path(__file__).resolve().parent.parent / "config" / "agenda.json").read_text())
        hoy = any(e.get("fecha") == now.date().isoformat() and e.get("tipo") == "eeuu" for e in ag.get("fechas", []))
    except Exception:  # noqa: BLE001
        hoy = False
    if hoy and (now.hour, now.minute) >= (13, 30):
        return now.minute < 30
    return now.hour == 16 and now.minute < 30


def macro(r: Run) -> None:
    from .common import select
    now = dt.datetime.now(dt.timezone.utc)
    last = select("observations", {"select": "date", "series_code": "eq.eeuu_ipc_interanual", "order": "date.desc", "limit": 1})
    last = last[0]["date"] if last else None
    if due(last, now):
        # 20 años de historia la primera vez (2 consultas); luego, 2 años (lo que pide el interanual)
        spans = [(now.year - 19, now.year - 10), (now.year - 9, now.year)] if not last else [(now.year - 2, now.year)]
        data: dict[str, list] = {}
        for y0, y1 in spans:
            for k, v in bls(y0, y1).items():
                data[k] = sorted(set(data.get(k, []) + v))
        keep = (lambda pts: pts) if not last else (lambda pts: pts[-14:])
        if data.get("ipc"):
            r.rows += save_obs("eeuu_ipc_interanual", keep(yoy(data["ipc"])), "BLS")
            r.rows += save_obs("eeuu_ipc_mensual", keep(yoy(data["ipc"], 1)), "BLS")
        if data.get("sub"):
            r.rows += save_obs("eeuu_ipc_subyacente", keep(yoy(data["sub"])), "BLS")
        if data.get("nfp"):
            n = data["nfp"]
            r.rows += save_obs("eeuu_nomina_no_agricola", keep([(n[i][0], n[i][1] - n[i - 1][1]) for i in range(1, len(n))]), "BLS")
        if data.get("des"):
            r.rows += save_obs("eeuu_desempleo", keep(data["des"]), "BLS")
    # tasa objetivo de la Fed (techo del rango), de la Fed de Nueva York: una vez al día, o tras cada FOMC
    tl = select("observations", {"select": "date", "series_code": "eq.fed_tasa_objetivo", "order": "date.desc", "limit": 1})
    tl = tl[0]["date"] if tl else None
    fomc_hoy = now.date().isoformat() in FOMC and now.hour >= 19
    if not tl or (now.hour == 16 and now.minute < 30) or (fomc_hoy and tl < now.date().isoformat()):
        start = "2016-03-01" if not tl else (now.date() - dt.timedelta(days=10)).isoformat()
        j = fetch(NYFED, params={"startDate": start, "endDate": now.date().isoformat()}, timeout=40, retries=2).json()
        pts = sorted({(x["effectiveDate"], float(x["targetRateTo"])) for x in j.get("refRates") or [] if x.get("targetRateTo") is not None})
        r.rows += save_obs("fed_tasa_objetivo", pts, "Reserva Federal de Nueva York")


def zq(year: int, month: int) -> list[tuple[str, float]]:
    """Cierres diarios (fecha, tasa implícita %) del futuro de fondos federales de ese mes."""
    sym = f"ZQ{MONTH_CODE[month - 1]}{year % 100:02d}.CBT"
    j = fetch(YF.format(sym=sym), params={"range": "2y", "interval": "1d"}, timeout=30, retries=2).json()
    res = ((j.get("chart") or {}).get("result") or [None])[0]
    if not res:
        return []
    cl = ((res.get("indicators") or {}).get("quote") or [{}])[0].get("close") or []
    out = [(dt.datetime.utcfromtimestamp(t).date().isoformat(), round(100 - c, 4)) for t, c in zip(res.get("timestamp") or [], cl) if c]
    m = res.get("meta") or {}
    if m.get("regularMarketPrice") and m.get("regularMarketTime"):
        d = dt.datetime.utcfromtimestamp(m["regularMarketTime"]).date().isoformat()
        out = [p for p in out if p[0] != d] + [(d, round(100 - m["regularMarketPrice"], 4))]
    return out


def month_add(y: int, m: int, k: int) -> tuple[int, int]:
    m += k
    while m > 12:
        y, m = y + 1, m - 12
    while m < 1:
        y, m = y - 1, m + 12
    return y, m


def fedwatch(day: str, meetings: list[str], rates: dict[tuple[int, int], dict[str, float]], start: float) -> list[dict]:
    """Probabilidades para cada reunión futura vista desde `day`, encadenando las tasas como FedWatch."""
    out, prev = [], start
    for mt in meetings:
        d = dt.date.fromisoformat(mt)
        n = calendar.monthrange(d.year, d.month)[1]
        avg = (rates.get((d.year, d.month)) or {}).get(day)
        if avg is None:
            break
        nxt = rates.get(month_add(d.year, d.month, 1)) or {}
        # si el mes siguiente no tiene reunión, su futuro es directamente la tasa posterior (más limpio)
        y2, m2 = month_add(d.year, d.month, 1)
        if day in nxt and not any(x.startswith(f"{y2}-{m2:02d}") for x in meetings):
            post = nxt[day]
        else:
            frac = d.day / n
            post = (avg - frac * prev) / (1 - frac) if frac < 1 else avg
        delta = post - prev
        p = min(1.0, abs(delta) / 0.25)
        out.append({"date": mt, "rate": round(post, 3), "delta_bp": round(delta * 100, 1),
                    "hike": round(p * 100, 1) if delta > 0 else 0.0, "cut": round(p * 100, 1) if delta < 0 else 0.0})
        prev = post
    return out


def fed_probs(r: Run) -> None:
    today = dt.date.today()
    future = [m for m in FOMC if m > today.isoformat()]
    if not future:
        r.note("Agregar las fechas del FOMC del año siguiente en ingest/eeuu.py")
        return
    months = set()
    for mt in future[:6]:
        d = dt.date.fromisoformat(mt)
        months |= {(d.year, d.month), month_add(d.year, d.month, 1), month_add(d.year, d.month, -1)}
    rates = {}
    for y, m in sorted(months):
        try:
            rates[(y, m)] = dict(zq(y, m))
        except Exception as e:  # noqa: BLE001
            r.log.info("ZQ %s-%s: %s", y, m, e)
    # tasa de partida: la del mes anterior a la próxima reunión (sin reunión en medio), o la tasa efectiva
    first = dt.date.fromisoformat(future[0])
    before = rates.get(month_add(first.year, first.month, -1)) or {}
    days = sorted(before)
    last_meeting = max(m for m in FOMC if m <= today.isoformat())
    hike, cut, exp = [], [], []
    table = []
    for day in days:
        if day <= last_meeting:
            continue  # antes de la última reunión, la «próxima» era otra (sus contratos ya vencieron)
        res = fedwatch(day, future, rates, before[day])
        if not res:
            continue
        hike.append((day, res[0]["hike"]))
        cut.append((day, res[0]["cut"]))
        exp.append((day, res[0]["rate"]))
        table = res
    if not table:
        r.note("Futuros de fondos federales sin datos")
        return
    r.rows += save_obs("fed_prob_subida", hike, "CME (futuros de fondos federales vía Yahoo) · método FedWatch")
    r.rows += save_obs("fed_prob_baja", cut, "CME (futuros de fondos federales vía Yahoo) · método FedWatch")
    r.rows += save_obs("fed_tasa_esperada", exp, "CME (futuros de fondos federales vía Yahoo) · método FedWatch")
    ensure_bucket(BUCKET)
    payload = {"updated": dt.datetime.now(dt.timezone.utc).isoformat(), "start": round(before[days[-1]], 3), "meetings": table}
    storage_upload(BUCKET, "mercado/fed.json", json.dumps(payload).encode(), content_type="application/json", max_age=60)


def run(force: bool = False):
    with Run("eeuu") as r:
        now = dt.datetime.now(dt.timezone.utc)
        # datos de EE.UU.: en horario de Nueva York (12–22 UTC), días hábiles
        if not force and (now.weekday() > 4 or not (12 <= now.hour < 22)):
            r.log.info("Fuera del horario de Nueva York")
            return
        try:
            macro(r)
        except Exception as e:  # noqa: BLE001
            r.note(f"BLS/Fed NY: {str(e)[:120]}")
        try:
            fed_probs(r)
        except Exception as e:  # noqa: BLE001
            r.note(f"Probabilidades de la Fed: {str(e)[:120]}")
