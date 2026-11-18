"""Vigilancia del consumo de los planes gratuitos.

- Supabase: tamaño de la base de datos (límite 500 MB) y de Storage (límite 1 GB), con la función uso_plan().
Si algo pasa del 70 %, avisa por correo (ALERT_EMAILS) y, si existe TELEGRAM_ADMIN_CHAT, por Telegram privado.
Guarda la última medición en app_state (clave «uso_plan»).
"""
from __future__ import annotations

import datetime as dt
import json
import os

import requests

from .common import SUPABASE_KEY, SUPABASE_URL, Run, upsert

LIMITES = {"db_mb": ("Base de datos de Supabase", 500.0), "storage_mb": ("Archivos (Storage) de Supabase", 1024.0)}
UMBRAL = 0.70


def medir() -> dict:
    r = requests.post(f"{SUPABASE_URL}/rest/v1/rpc/uso_plan", headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                      "Content-Type": "application/json"}, data="{}", timeout=30)
    r.raise_for_status()
    return r.json()


def avisar(texto: str, r: Run) -> None:
    from .alerts import send_email, tg
    try:
        send_email(texto)
    except Exception as e:  # noqa: BLE001
        r.log.info("Correo: %s", e)
    chat = os.environ.get("TELEGRAM_ADMIN_CHAT")
    if chat:
        tg("sendMessage", chat_id=chat.strip(), text=texto)


def run():
    with Run("uso") as r:
        u = medir()
        lineas, alto = [], False
        for k, (nombre, lim) in LIMITES.items():
            v = float(u.get(k) or 0)
            pct = v / lim
            lineas.append(f"{nombre}: {v:,.0f} MB de {lim:,.0f} MB ({pct:.0%})")
            alto |= pct >= UMBRAL
        upsert("app_state", [{"clave": "uso_plan", "valor": json.dumps({**u, "medido": dt.datetime.now(dt.timezone.utc).isoformat()}),
                               "actualizado": dt.datetime.now(dt.timezone.utc).isoformat()}], "clave")
        r.rows = 1
        if alto:
            r.note("; ".join(lineas))
            avisar("⚠️ Radar Solfin: consumo alto del plan gratuito\n" + "\n".join(lineas)
                   + "\nRevise Storage → informes: los PDF del Research Desk son lo que más ocupa.", r)
        else:
            r.log.info("; ".join(lineas))
