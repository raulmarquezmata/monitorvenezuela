"""Punto de entrada de los robots.

  python -m ingest.run frequent          # tipo de cambio, BVC, noticias, alertas (cada 30 min)
  python -m ingest.run daily             # BCV, inflación, prensa, banca, OPEP, SUNAVAL, EIA, OFAC, eventos
  python -m ingest.run weekly            # comercio exterior, agro, materias primas, SUDEBAN
  python -m ingest.run files             # archivos del repositorio: CSV manuales, bonos, línea de tiempo
  python -m ingest.run backfill          # carga histórica inicial completa
  python -m ingest.run fx bvc news ...   # robots sueltos
"""
from __future__ import annotations

import signal
import sys

from . import (agro, alerts, bancos_muestra, banking, census, embi, emisores, futures, bcv_stats, bonds, bvc, catalog, commodities, events, fx, inflation,
               informes, manual, news, ofac, oil, opec, press, reportes, sudeban, sunaval, trade)
from .common import DRY_RUN, log

JOBS = {
    "catalog": catalog.run, "fx": fx.run, "fx_hist": fx.run_history, "bvc": bvc.run, "bvc_full": lambda: bvc.run(full=True), "news": news.run,
    "bcv_stats": bcv_stats.run, "inflation": inflation.run, "press": press.run, "banking": banking.run,
    "opec": opec.run, "sunaval": sunaval.run, "oil": oil.run, "ofac": ofac.run, "events": events.run,
    "manual": manual.run, "bonds": bonds.run, "trade": trade.run, "agro": agro.run, "commodities": commodities.run,
    "sudeban": sudeban.run, "bancos_muestra": bancos_muestra.run, "census": census.run, "trade_mensual": trade.run_monthly, "agro_usda": agro.run_usda, "futuros": futures.run, "ipc": fx.run_cpi, "embi": embi.run, "opec_local": lambda: opec.run(local_only=True), "alerts": alerts.run, "emisores": emisores.run, "reportes": reportes.run, "informes": informes.run, "alerts_daily": lambda: alerts.run(daily=True),
}
GROUPS = {
    "frequent": ["catalog", "fx", "bvc", "news", "futuros", "alerts"],
    "telegram": ["fx", "alerts"],  # corrida corta para el buenos días y el cierre
    # publicaciones oficiales: cada 2 horas en días hábiles, para cargarlas y avisar apenas salgan
    "oficial": ["bcv_stats", "inflation", "press", "banking", "opec", "sunaval", "embi", "oil", "emisores", "informes", "alerts"],
    "daily": ["catalog", "fx", "bvc_full", "reportes", "emisores", "informes", "bcv_stats", "inflation", "press", "banking", "opec", "sunaval", "oil", "embi", "trade_mensual", "ipc", "agro_usda",
              "ofac", "events", "alerts_daily"],
    "weekly": ["catalog", "fx_hist", "trade", "agro", "agro_usda", "commodities", "sudeban"],
    "files": ["catalog", "manual", "bonds", "events", "bancos_muestra", "opec_local", "sunaval", "emisores", "informes", "alerts"],
    "acciones": ["reportes", "emisores"],  # manual: informes PDF por acción + noticias y asambleas
}


def backfill():
    catalog.run()
    fx.run(backfill=True)
    fx.run_history()
    bvc.run(full=True)
    bcv_stats.run(backfill=True)
    inflation.run(backfill=True)
    press.run(backfill=True)
    banking.run()
    opec.run(backfill=True)
    sunaval.run(backfill=True)
    oil.run(backfill=True)
    trade.run_monthly()
    futures.run()
    embi.run(backfill=True)
    commodities.run()
    ofac.run()
    manual.run()
    bonds.run()
    bancos_muestra.run()
    news.run()
    trade.run(backfill=True)
    agro.run()
    agro.run_usda()
    sudeban.run()
    events.run()
    reportes.run()
    emisores.run()
    informes.run()
    alerts.run()  # primera corrida: registra sin enviar


# minutos máximos por robot según el grupo (las corridas cada 20 minutos no pueden pasar de ~20 en total)
LIMITS = {"frequent": 5, "telegram": 4, "oficial": 15, "files": 30, "acciones": 40, "daily": 45, "weekly": 60}


class JobTimeout(Exception):
    pass


def _timeout(signum, frame):  # noqa: ARG001
    raise JobTimeout()


def main(argv: list[str]):
    if DRY_RUN:
        log.warning("DRY_RUN activo (sin SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY): no se escribe nada.")
    for a in argv or ["frequent"]:
        if a == "backfill":
            backfill()
            continue
        for job in GROUPS.get(a, [a]):
            if job not in JOBS:
                log.error("Robot desconocido: %s", job)
                continue
            limit = max(1, int(LIMITS.get(a, 45) * 60))
            # cada robot tiene un tiempo máximo: si una fuente se cuelga, se corta ese robot y el resto
            # (sobre todo las alertas de Telegram, que van al final) sigue corriendo
            signal.signal(signal.SIGALRM, _timeout)
            signal.alarm(limit)
            try:
                JOBS[job]()
            except JobTimeout:
                log.error("%s: superó %d minutos y se cortó", job, limit // 60)
            except Exception as e:  # noqa: BLE001
                log.error("%s: %s", job, e)
            finally:
                signal.alarm(0)


if __name__ == "__main__":
    main(sys.argv[1:])
