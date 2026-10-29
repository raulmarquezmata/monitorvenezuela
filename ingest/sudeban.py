"""Detector de publicaciones de SUDEBAN.

SUDEBAN publicaba balances mensuales como .zip con este patrón y dejó de hacerlo en 2023.
El robot revisa si aparecen meses nuevos y, si los hay, los registra en `source_files`
(se ven en "Estado de datos") y deja una nota para activar la carga automática de banca.
"""
from __future__ import annotations

import datetime as dt

from .common import Run, http, today_caracas, upsert

BASE = "https://sudeban.gob.ve/wp-content/uploads/INF_ESTADISTICAS/{y}/{code}-{y}-{m:02d}.zip"
CODES = ["BP", "ER", "BM"]  # balance de publicación, estado de resultados, boletín mensual


def exists(url: str) -> bool:
    try:
        r = http.head(url, timeout=25, allow_redirects=True)
        if r.status_code == 405:
            r = http.get(url, timeout=25, stream=True)
        return r.status_code == 200 and "html" not in r.headers.get("content-type", "")
    except Exception:  # noqa: BLE001
        return False


def run():
    with Run("sudeban") as r:
        today, found = today_caracas(), []
        y, m = today.year, today.month
        for _ in range(18):  # últimos 18 meses
            m -= 1
            if m == 0:
                y, m = y - 1, 12
            for code in CODES:
                url = BASE.format(y=y, m=m, code=code)
                if exists(url):
                    found.append({"url": url, "page": "SUDEBAN", "filename": url.rsplit("/", 1)[-1],
                                  "last_seen": dt.datetime.now(dt.timezone.utc).isoformat()})
        r.rows = upsert("source_files", found, "url")
        if found:
            r.note(f"¡SUDEBAN publicó {len(found)} archivos recientes! Se puede activar la banca automática.")
