"""Riesgo país de Venezuela: diferencial del EMBI (JPMorgan), en puntos básicos.

1) Banco Central de Reserva del Perú (BCRP): publica a diario el EMBIG por país (dato de JPMorgan).
   El robot busca él solo cuál código de serie del BCRP corresponde a Venezuela.
2) Respaldo: cifras que publica la prensa (Finanzas Digital, Bloomberg Línea…) con la fecha de la nota.
3) Historia 2025-2026 sembrada en data/manual/embi_venezuela.csv (cifras citadas por la prensa).
"""
from __future__ import annotations

import datetime as dt
import re

from .common import Run, fetch, save_obs, select

API = "https://estadisticas.bcrp.gob.pe/estadisticas/series/api/{code}/json/{start}/{end}"
CANDIDATES = [f"PD{n:05d}XD" for n in range(4700, 4732)] + [f"PD{n:05d}XD" for n in range(38570, 38600)]
MES = {"Ene": 1, "Feb": 2, "Mar": 3, "Abr": 4, "May": 5, "Jun": 6, "Jul": 7, "Ago": 8, "Set": 9, "Sep": 9, "Oct": 10, "Nov": 11, "Dic": 12}


def bcrp(code: str, start: str, end: str) -> tuple[str, list]:
    j = fetch(API.format(code=code, start=start, end=end), timeout=20, retries=1).json()
    name = " ".join(s.get("name", "") for s in j.get("config", {}).get("series", []))
    pts = []
    for p in j.get("periods", []):
        m = re.match(r"(\d{2})\.(\w{3})\.(\d{2})", p.get("name", ""))
        v = (p.get("values") or [None])[0]
        if m and v not in (None, "n.d.", "") and m.group(2) in MES:
            try:
                pts.append((dt.date(2000 + int(m.group(3)), MES[m.group(2)], int(m.group(1))).isoformat(), float(v)))
            except ValueError:
                pass
    return name, pts


def from_press() -> list:
    from .press import google_posts, wp_posts
    posts = wp_posts("www.finanzasdigital.com", "riesgo país Venezuela", 2) + wp_posts("www.bancaynegocios.com", "riesgo país", 2)
    posts += google_posts("riesgo país Venezuela puntos EMBI") + google_posts("riesgo país Venezuela puntos básicos")
    out = {}
    for p in posts:
        t = f"{p['title']} {p.get('excerpt', '')}"
        if not re.search(r"riesgo pa[ií]s|embi", t, re.I) or not re.search(r"venezuel", t, re.I):
            continue
        m = re.search(r"(?:riesgo pa[ií]s|embi)[^.]{0,90}?(\d{1,2}\.\d{3})\s*(?:puntos|pbs|pb\b)", t, re.I)
        if m:
            v = float(m.group(1).replace(".", ""))
            if 300 <= v <= 40000:
                out.setdefault(p["date"], v)
    return sorted(out.items())


def run(backfill: bool = False):
    with Run("embi") as r:
        try:
            _run(r, backfill)
        except Exception as e:  # noqa: BLE001
            r.note(f"EMBI: {str(e)[:200]}")


def _run(r, backfill: bool):
    if True:
        end = dt.date.today().isoformat()
        start = "2015-01-01" if backfill or not select("observations", {"select": "date", "series_code": "eq.embi_venezuela", "source": "like.JPMorgan vía BCRP*", "limit": 1}) else (dt.date.today() - dt.timedelta(days=40)).isoformat()
        got, fails = False, 0
        for code in CANDIDATES:
            try:
                name, pts = bcrp(code, "2026-01-01", end)
            except Exception:  # noqa: BLE001
                fails += 1
                if fails >= 4:
                    break
                continue
            if "venezuela" in name.lower() and ("embi" in name.lower() or "diferencial" in name.lower() or "spread" in name.lower()):
                try:
                    _, pts = bcrp(code, start, end)
                except Exception:  # noqa: BLE001  (rango largo: se piden los últimos 2 años)
                    _, pts = bcrp(code, (dt.date.today() - dt.timedelta(days=730)).isoformat(), end)
                r.rows += save_obs("embi_venezuela", pts, f"JPMorgan vía BCRP ({code})")
                got = True
                break
        if not got:
            r.log.info("BCRP sin la serie de Venezuela: solo prensa")
        # la prensa completa lo más reciente (el BCRP puede ir atrasado o haber dejado de publicar Venezuela)
        last = select("observations", {"select": "date", "series_code": "eq.embi_venezuela", "order": "date.desc", "limit": 1})
        cut = last[0]["date"] if last else "2000-01-01"
        press = [p for p in from_press() if p[0] > cut]
        r.rows += save_obs("embi_venezuela", press, "JPMorgan EMBI (vía prensa)")
        if not got and not press and cut < (dt.date.today() - dt.timedelta(days=20)).isoformat():
            r.note(f"Sin dato nuevo del EMBI desde {cut}: ni el BCRP ni la prensa lo publicaron")
