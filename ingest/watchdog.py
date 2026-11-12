"""Vigilante del Radar: avisa por Telegram (chat de administración) cuando algo se detiene.

- Series clave atrasadas respecto a su frecuencia (p. ej. el Merey sin dato del mes, el dólar sin dato del día hábil).
- Robots que fallan tres veces seguidas.
- Ninguna corrida exitosa en la última hora y media (los robots dejaron de lanzarse).
Cada problema se avisa una sola vez por día. El chat es TELEGRAM_ADMIN_CHAT_ID si existe; si no, TELEGRAM_CHAT_ID.
"""
from __future__ import annotations

import datetime as dt
import os

from .common import Run, select, upsert

KEY_SERIES = ["usd_bcv", "usd_paralelo", "eur_bcv", "brecha_cambiaria", "ibc", "bvc_monto", "inflacion_mensual", "liquidez_m2", "base_monetaria",
              "reservas_internacionales", "merey", "petroleo_prod_opep_cd", "petroleo_prod_opep_fs", "brent", "tasa_activa", "pib_real_var",
              "sp500", "ust_10a", "oro_diario"]
GRACE = {"D": 3, "W": 4, "M": 10, "Q": 30, "A": 60}


def send_admin(text: str) -> bool:
    from .alerts import http, pretty
    tok = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_ADMIN_CHAT_ID") or os.environ.get("TELEGRAM_CHAT_ID")
    if not (tok and chat):
        return False
    r = http.post(f"https://api.telegram.org/bot{tok.strip()}/sendMessage",
                  json={"chat_id": chat.strip(), "text": pretty(text), "parse_mode": "HTML", "disable_web_page_preview": True}, timeout=30)
    return r.status_code < 300


def run():
    with Run("vigilante") as r:
        today = dt.date.today()
        now = dt.datetime.now(dt.timezone.utc)
        issues: list[tuple[str, str]] = []
        # 1) series clave atrasadas
        meta = {x["code"]: x for x in select("latest_observations", {"select": "code,name_es,frequency,stale_days,last_date,method",
                                                                       "code": f"in.({','.join(KEY_SERIES)})"})}
        for code in KEY_SERIES:
            m = meta.get(code)
            if not m or not m.get("last_date") or not m.get("stale_days"):
                continue
            age = (today - dt.date.fromisoformat(m["last_date"])).days
            limit = int(m["stale_days"]) + GRACE.get(m.get("frequency") or "M", 7)
            if age > limit:
                issues.append((f"serie:{code}", f"• **{m['name_es']}**: último dato {m['last_date']} ({age} días; se espera cada {m['stale_days']})"))
        # 2) robots que fallan tres veces seguidas
        runs = select("ingest_runs", {"select": "job,status,started_at,message", "started_at": f"gte.{(now - dt.timedelta(days=2)).isoformat()}",
                                      "order": "started_at.desc", "limit": 1500})
        by_job: dict[str, list[dict]] = {}
        for x in runs:
            by_job.setdefault(x["job"], []).append(x)
        for job, xs in by_job.items():
            if len(xs) >= 3 and all(x.get("status") == "error" for x in xs[:3]):
                msg = (xs[0].get("message") or "")[:120]
                issues.append((f"robot:{job}", f"• Robot **{job}** falló 3 veces seguidas{': ' + msg if msg else ''}"))
        # 3) sin corridas exitosas recientes
        ok = [x for x in runs if x.get("status") in ("ok", "partial")]
        if ok and (now - dt.datetime.fromisoformat(ok[0]["started_at"].replace("Z", "+00:00"))).total_seconds() > 90 * 60:
            issues.append(("robots:parados", "• Ninguna corrida exitosa en la última hora y media: revisa Actions en GitHub"))
        if not issues:
            r.log.info("Todo en orden")
            return
        day = today.isoformat()
        sent = {x["key"] for x in select("alerts_log", {"select": "key", "key": f"like.vigilante:*:{day}"})}
        new = [(k, t) for k, t in issues if f"vigilante:{k}:{day}" not in sent]
        if not new:
            return
        text = "⚠️ **Vigilante del Radar**\n" + "\n".join(t for _, t in new)
        try:
            ch = "telegram" if send_admin(text) else None
        except Exception as e:  # noqa: BLE001
            r.note(f"Telegram: {e}")
            ch = None
        upsert("alerts_log", [{"key": f"vigilante:{k}:{day}", "rule": "vigilante", "message": t, "channels": ch,
                               "sent_at": now.isoformat()} for k, t in new], "key")
        r.rows = len(new)
