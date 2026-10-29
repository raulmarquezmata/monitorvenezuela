"""Alertas a un canal de Telegram (gratis) y/o correo vía Gmail (gratis, sin dominio propio).

Secretos opcionales en GitHub:
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   (ej. @mi_canal o id numérico)
  GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_EMAILS (lista separada por comas)
Las reglas están en config/alerts.json. Cada alerta se envía una sola vez (tabla alerts_log).
"""
from __future__ import annotations

import json
import os
import pathlib
import smtplib
from email.mime.text import MIMEText

from .common import Run, http, select, today_caracas, upsert

CONFIG = pathlib.Path(__file__).resolve().parent.parent / "config" / "alerts.json"
SITE = os.environ.get("SITE_URL", "")


def fmt(v: float, dec: int = 2) -> str:
    s = f"{v:,.{dec}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def last_two(code: str) -> list[dict]:
    return select("observations", {"select": "date,value", "series_code": f"eq.{code}", "order": "date.desc", "limit": 2})[:2]


def evaluate(rules: list[dict], meta: dict[str, dict], data: dict[str, list[dict]], daily: bool) -> list[tuple[str, str]]:
    """Devuelve [(clave_única, mensaje)] de las reglas que se cumplen."""
    out = []
    for rule in rules:
        t = rule["tipo"]
        if t in ("umbral", "variacion"):
            obs = data.get(rule["serie"], [])
            if len(obs) < 2:
                continue
            cur, prev = obs[0], obs[1]
            m = meta.get(rule["serie"], {})
            dec = min(m.get("decimals", 2), 2)
            if t == "umbral":
                op, lim = rule["op"], rule["valor"]
                now_ok = cur["value"] > lim if op == ">" else cur["value"] < lim
                was_ok = prev["value"] > lim if op == ">" else prev["value"] < lim
                if now_ok and not was_ok:
                    out.append((f"{rule['id']}:{cur['date']}", rule["texto"].format(valor=fmt(cur["value"], dec), fecha=cur["date"], cambio="")))
            else:
                if prev["value"]:
                    ch = (cur["value"] / prev["value"] - 1) * 100
                    if abs(ch) >= rule["pct"]:
                        out.append((f"{rule['id']}:{cur['date']}", rule["texto"].format(
                            valor=fmt(cur["value"], dec), fecha=cur["date"], cambio=("+" if ch > 0 else "") + fmt(ch, 1))))
        elif t == "nuevo_dato":
            for code in rule["series"]:
                obs = data.get(code, [])
                if obs:
                    m = meta.get(code, {})
                    out.append((f"{rule['id']}:{code}:{obs[0]['date']}", rule["texto"].format(
                        nombre=m.get("name_es", code), valor=fmt(obs[0]["value"], min(m.get("decimals", 2), 2)),
                        unidad=m.get("unit_es", ""), fecha=obs[0]["date"])))
        elif t == "resumen_diario" and daily:
            hoy = today_caracas().isoformat()
            lines = [rule["texto"].format(fecha=hoy)]
            for code in rule["series"]:
                obs, m = data.get(code, []), meta.get(code, {})
                if obs:
                    ch = ""
                    if len(obs) > 1 and obs[1]["value"]:
                        c = (obs[0]["value"] / obs[1]["value"] - 1) * 100
                        ch = f" ({'+' if c > 0 else ''}{fmt(c, 1)}%)"
                    lines.append(f"• {m.get('name_es', code)}: {fmt(obs[0]['value'], min(m.get('decimals', 2), 2))} {m.get('unit_es', '')}{ch}")
            if SITE:
                lines.append(SITE)
            out.append((f"{rule['id']}:{hoy}", "\n".join(lines)))
    return out


def send_telegram(text: str) -> bool:
    tok, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not (tok and chat):
        return False
    r = http.post(f"https://api.telegram.org/bot{tok}/sendMessage",
                  json={"chat_id": chat, "text": text, "disable_web_page_preview": True}, timeout=30)
    r.raise_for_status()
    return True


def send_email(text: str) -> bool:
    user, pw, to = os.environ.get("GMAIL_USER"), os.environ.get("GMAIL_APP_PASSWORD"), os.environ.get("ALERT_EMAILS")
    if not (user and pw and to):
        return False
    msg = MIMEText(text, "plain", "utf-8")
    msg["Subject"] = "Monitor Venezuela · " + text.splitlines()[0][:80]
    msg["From"], msg["To"] = user, to
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as s:
        s.login(user, pw)
        s.sendmail(user, [x.strip() for x in to.split(",")], msg.as_string())
    return True


def run(daily: bool = False):
    with Run("alerts") as r:
        rules = json.loads(CONFIG.read_text(encoding="utf-8"))["reglas"]
        codes = sorted({c for x in rules for c in ([x["serie"]] if "serie" in x else x.get("series", []))})
        meta = {s["code"]: s for s in select("series", {"select": "code,name_es,unit_es,decimals"})}
        data = {c: last_two(c) for c in codes}
        candidates = evaluate(rules, meta, data, daily)
        if not candidates:
            return
        sent = {x["key"] for x in select("alerts_log", {"select": "key", "key": "in.(" + ",".join(f'"{k}"' for k, _ in candidates) + ")"})}
        first_run = not select("alerts_log", {"select": "key", "limit": 1})
        log = []
        for key, text in candidates:
            if key in sent:
                continue
            channels = []
            if not first_run:  # la primera vez solo se registra, para no inundar el canal con datos viejos
                try:
                    if send_telegram(text):
                        channels.append("telegram")
                except Exception as e:  # noqa: BLE001
                    r.note(f"Telegram: {e}")
                try:
                    if send_email(text):
                        channels.append("email")
                except Exception as e:  # noqa: BLE001
                    r.note(f"Correo: {e}")
            log.append({"key": key, "rule": key.split(":")[0], "message": text, "channels": ",".join(channels) or None})
        r.rows = upsert("alerts_log", log, "key")
