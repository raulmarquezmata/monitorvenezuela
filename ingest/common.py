"""Utilidades compartidas por los robots de ingesta.

Escribe en Supabase vía PostgREST con la service_role key (nunca expuesta al navegador).
Variables de entorno: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
Con DRY_RUN=1 no escribe nada: imprime lo que habría guardado (útil para probar).
"""
from __future__ import annotations

import datetime as dt
import json
import logging
import math
import os
import re
import time
import traceback
import warnings
from typing import Any, Iterable

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
log = logging.getLogger("ingest")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
DRY_RUN = os.environ.get("DRY_RUN") == "1" or not (SUPABASE_URL and SUPABASE_KEY)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36 MonitorVenezuela/1.0")

http = requests.Session()
http.headers.update({"User-Agent": UA, "Accept-Language": "es-VE,es;q=0.9,en;q=0.8"})


# ---------------------------------------------------------------- HTTP
def fetch(url: str, *, method: str = "GET", retries: int = 3, timeout: int = 40,
          insecure_fallback: bool = False, **kw) -> requests.Response:
    """GET/POST con reintentos. `insecure_fallback` solo para bcv.org.ve, que publica su
    certificado sin la cadena intermedia completa (problema conocido del sitio)."""
    last: Exception | None = None
    for attempt in range(retries):
        try:
            r = http.request(method, url, timeout=timeout, **kw)
            r.raise_for_status()
            return r
        except requests.exceptions.SSLError as e:
            last = e
            if insecure_fallback:
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore")
                    try:
                        r = http.request(method, url, timeout=timeout, verify=False, **kw)
                        r.raise_for_status()
                        return r
                    except Exception as e2:  # noqa: BLE001
                        last = e2
        except Exception as e:  # noqa: BLE001
            last = e
            if attempt == retries - 1:
                alt = browser_fetch(method, url, timeout, **kw)
                if alt is not None:
                    return alt
        time.sleep(2 ** attempt)
    raise RuntimeError(f"No se pudo obtener {url}: {last}")


def browser_fetch(method: str, url: str, timeout: int, **kw):
    """Último intento suplantando un navegador (curl_cffi): varios medios y SUNAVAL bloquean
    las IP de GitHub Actions con Cloudflare. Devuelve None si tampoco funciona."""
    try:
        from curl_cffi import requests as creq  # type: ignore
    except Exception:  # noqa: BLE001
        return None
    kw.pop("verify", None)
    for imp in ("chrome", "safari"):
        try:
            r = creq.request(method, url, timeout=timeout, impersonate=imp, verify=False, **kw)
            if r.status_code < 400 and r.content:
                return r
        except Exception:  # noqa: BLE001
            continue
    return None


# ---------------------------------------------------------------- Números
def ve_number(s: Any) -> float | None:
    """'1.234,56' -> 1234.56 · '39,1813' -> 39.1813 · '221.25' -> 221.25 · '.06' -> 0.06"""
    if s is None:
        return None
    if isinstance(s, (int, float)):
        return None if (isinstance(s, float) and math.isnan(s)) else float(s)
    t = str(s).strip().replace("\xa0", "").replace(" ", "").replace("Bs.", "").replace("%", "")
    if t in ("", "-", "---", "N/D", "n/d", "nan"):
        return None
    if "," in t:
        t = t.replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return None


def iso(d: dt.date | dt.datetime | str) -> str:
    if isinstance(d, (dt.date, dt.datetime)):
        return d.isoformat()[:10]
    return str(d)[:10]


def today_caracas() -> dt.date:
    return (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=4)).date()


# ---------------------------------------------------------------- Supabase
def _headers(prefer: str) -> dict:
    return {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json", "Prefer": prefer}


def upsert(table: str, rows: Iterable[dict], on_conflict: str | None = None,
           chunk: int = 500) -> int:
    rows = [r for r in rows if r]
    if not rows:
        return 0
    if DRY_RUN:
        log.info("[DRY_RUN] %s: %d filas · ej. %s", table, len(rows),
                 json.dumps(rows[:2], ensure_ascii=False, default=str)[:400])
        return len(rows)
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url += f"?on_conflict={on_conflict}"
    n = 0
    for i in range(0, len(rows), chunk):
        part = rows[i:i + chunk]
        r = requests.post(url, headers=_headers("resolution=merge-duplicates,return=minimal"),
                          data=json.dumps(part, default=str), timeout=60)
        if r.status_code >= 300:
            raise RuntimeError(f"Supabase {table} {r.status_code}: {r.text[:500]}")
        n += len(part)
    return n


def select(table: str, params: dict | None = None) -> list[dict]:
    """Lee todas las filas (pagina de 1000 en 1000, límite por defecto de PostgREST)."""
    if DRY_RUN:
        return []
    if params and "limit" in params:
        r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=_headers("count=none"), params=params, timeout=60)
        r.raise_for_status()
        return r.json()
    out, page = [], 1000
    while True:
        p = dict(params or {}, limit=page, offset=len(out))
        r = requests.get(f"{SUPABASE_URL}/rest/v1/{table}", headers=_headers("count=none"),
                         params=p, timeout=60)
        r.raise_for_status()
        batch = r.json()
        out.extend(batch)
        if len(batch) < page:
            return out


def save_obs(series_code: str, points: Iterable[tuple], source: str | None = None) -> int:
    """points: [(fecha, valor), ...] — descarta None/NaN y duplica por fecha (gana el último)."""
    by_date: dict[str, dict] = {}
    for d, v in points:
        if v is None or (isinstance(v, float) and math.isnan(v)):
            continue
        by_date[iso(d)] = {"series_code": series_code, "date": iso(d), "value": float(v),
                           "source": source,
                           "updated_at": dt.datetime.now(dt.timezone.utc).isoformat()}
    return upsert("observations", by_date.values(), "series_code,date")


# ---------------------------------------------------------------- Bitácora
class Run:
    """Context manager que registra cada corrida en ingest_runs y nunca tumba al resto de robots."""

    def __init__(self, job: str):
        self.job, self.rows, self.notes, self.status = job, 0, [], "ok"
        self.log = logging.getLogger(job)
        self.id = None

    def note(self, msg: str):
        self.log.warning(msg)
        self.notes.append(msg)
        self.status = "partial"

    def __enter__(self):
        self.t0 = dt.datetime.now(dt.timezone.utc)
        self.log.info("Inicio")
        return self

    def __exit__(self, exc_type, exc, tb):
        if exc:
            self.status = "error"
            self.notes.append(f"{exc_type.__name__}: {exc}")
            self.log.error("Fallo:\n%s", "".join(traceback.format_exception(exc_type, exc, tb)))
        try:
            upsert("ingest_runs", [{
                "job": self.job, "started_at": self.t0.isoformat(),
                "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "status": self.status, "rows": self.rows,
                "message": " | ".join(self.notes)[:4000] or None,
            }])
        except Exception as e:  # noqa: BLE001
            self.log.error("No se pudo registrar la corrida: %s", e)
        self.log.info("Fin · %s · %d filas", self.status, self.rows)
        return True  # absorbe la excepción: un robot caído no detiene a los demás


def clean_text(s: str | None, n: int = 400) -> str | None:
    if not s:
        return None
    s = re.sub(r"<[^>]+>", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:n] if s else None
