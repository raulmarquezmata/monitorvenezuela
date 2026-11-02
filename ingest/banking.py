"""Banca: cartera de créditos y captaciones del sistema y por banco.

Fuente: tablas de instituciones financieras de Finanzas Digital (datos de SUDEBAN / balances
de publicación), con el total del sistema y el ranking de cada banco para el mes actual, el
anterior y el mismo mes del año previo. Cada corrida suma meses nuevos: la serie crece sola.
"""
from __future__ import annotations

import datetime as dt
import re

from bs4 import BeautifulSoup

from .common import Run, fetch, save_obs, upsert, ve_number

BASE = "https://finanzasdigital.com/estadisticas/ve/financieras/instituciones/tabla/{metric}"
METRICS = {"creditos": "cartera_credito", "captaciones": "depositos_totales"}
# otras tablas que puede publicar Finanzas Digital para todo el sistema (si alguna no existe, se omite)
EXTRA = ["activos", "patrimonio", "resultados", "utilidades", "inversiones", "disponibilidades", "cartera-de-creditos-bruta",
         "depositos-a-la-vista", "depositos-en-moneda-extranjera"]
MON = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "sep": 9, "set": 9,
       "oct": 10, "nov": 11, "dic": 12}


def eom(y: int, m: int) -> str:
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - dt.timedelta(days=1)).isoformat()


def period_of(text: str) -> str | None:
    m = re.search(r"([a-záé]{3})[a-z]*[\s\-./]*'?(\d{2,4})", text.lower())
    if not m or m.group(1)[:3] not in MON:
        return None
    y = int(m.group(2))
    y += 2000 if y < 100 else 0
    return eom(y, MON[m.group(1)[:3]])


def parse(html: str) -> tuple[list[str], list[dict]]:
    """Devuelve (periodos, filas[{bank, values{periodo: valor}, share{periodo: %}}])."""
    soup = BeautifulSoup(html, "html.parser")
    for table in soup.find_all("table"):
        periods = []
        for th in table.find_all(["th", "td"])[:40]:
            p = period_of(th.get_text(" ", strip=True))
            if p and p not in periods:
                periods.append(p)
        if not periods:
            continue
        rows = []
        for tr in table.find_all("tr"):
            cells = [c.get_text(" ", strip=True) for c in tr.find_all(["td", "th"])]
            name = next((c for c in cells if c and ve_number(c) is None and not period_of(c)), None)
            nums = [ve_number(c) for c in cells if ve_number(c) is not None]
            if not name or len(nums) < len(periods):
                continue
            if len(nums) % len(periods) == 1 and float(nums[0]).is_integer() and nums[0] < 100:
                nums = nums[1:]  # posición en el ranking
            k = len(nums) // len(periods)
            vals, share = {}, {}
            for i, p in enumerate(periods):
                grp = nums[i * k:(i + 1) * k]
                vals[p] = max(grp, key=abs)
                pct = [x for x in grp if x != vals[p] and 0 <= x <= 100 and not float(x).is_integer()]
                if pct:
                    share[p] = pct[-1]
            rows.append({"bank": re.sub(r"\s+", " ", name).strip(), "values": vals, "share": share})
        if rows:
            return periods, rows
    return [], []


def run():
    with Run("banking") as r:
        for metric, code in METRICS.items():
            try:
                periods, rows = parse(fetch(BASE.format(metric=metric), timeout=60).text)
            except Exception as e:  # noqa: BLE001
                r.note(f"{metric}: {e}")
                continue
            if not rows:
                r.note(f"{metric}: tabla no reconocida")
                continue
            total = next((x for x in rows if re.sub(r"\s", "", x["bank"]).upper().startswith("TOTAL")), None)
            if total:
                r.rows += save_obs(code, sorted(total["values"].items()), "SUDEBAN (vía Finanzas Digital)")
            ranking = [{"period": p, "bank": x["bank"], "metric": metric, "value": x["values"][p], "share": x["share"].get(p)}
                       for x in rows if x is not total for p in x["values"]]
            r.rows += upsert("bank_ranking", ranking, "period,bank,metric")
        found = []
        for metric in EXTRA:  # tablas adicionales para todo el universo de bancos
            try:
                periods, rows = parse(fetch(BASE.format(metric=metric), timeout=60, retries=1).text)
            except Exception:  # noqa: BLE001
                continue
            if not rows:
                continue
            found.append(metric)
            total = next((x for x in rows if re.sub(r"\s", "", x["bank"]).upper().startswith("TOTAL")), None)
            key = metric.replace("-", "_")
            r.rows += upsert("bank_ranking", [{"period": p, "bank": x["bank"], "metric": key, "value": x["values"][p], "share": x["share"].get(p)}
                                              for x in rows for p in x["values"]], "period,bank,metric")
        r.log.info("Tablas adicionales encontradas: %s", ", ".join(found) or "ninguna")
        from .manual import bank_derived
        r.rows += bank_derived()
