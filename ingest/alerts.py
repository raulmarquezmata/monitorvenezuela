"""Alertas a un canal de Telegram (gratis) y/o correo vía Gmail (gratis, sin dominio propio).

Secretos opcionales en GitHub:
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   (ej. @mi_canal o id numérico)
  GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_EMAILS (lista separada por comas)
Las reglas están en config/alerts.json. Cada alerta se envía una sola vez (tabla alerts_log).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import pathlib
import smtplib
from email.mime.text import MIMEText

from .common import Run, http, select, today_caracas, upsert

CONFIG = pathlib.Path(__file__).resolve().parent.parent / "config" / "alerts.json"
SITE = os.environ.get("SITE_URL", "")
VET = dt.timezone(dt.timedelta(hours=-4))


def gather_extra(rules: list[dict], daily: bool = False) -> dict:
    """Datos que necesitan las reglas que no son de una sola serie."""
    tipos = {r["tipo"] for r in rules}
    ex: dict = {"hist": {}}
    need = {c for r in rules if r["tipo"] in ("cierre_semana", "cierre_mes") for c in r.get("series", [])}
    if daily and need:
        since = (today_caracas() - dt.timedelta(days=400)).isoformat()
        for c in need:
            ex["hist"][c] = [(x["date"], x["value"]) for x in select("observations", {"select": "date,value", "series_code": f"eq.{c}", "date": f"gte.{since}", "order": "date"})]
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=6)).isoformat()
    if "acciones" in tipos:
        ex["quotes"] = select("bvc_latest", {"select": "symbol,company,date,close,var_pct,amount", "market": "eq.RV"})
    if "volumen" in tipos:
        ex["monto"] = select("observations", {"select": "date,value", "series_code": "eq.bvc_monto",
                                              "date": f"gte.{today_caracas().year - 1}-10-01", "order": "date"})
    if "noticia" in tipos:
        ex["news"] = select("news", {"select": "title,url,source,published_at", "published_at": f"gte.{since}", "order": "published_at.desc", "limit": 80})
    if "ofac" in tipos:
        ex["ofac"] = select("ofac_actions", {"select": "url,date,title", "order": "date.desc", "limit": 10})
    if "robots" in tipos:
        runs = select("ingest_runs", {"select": "job,status,finished_at", "order": "finished_at.desc", "limit": 300})
        by: dict[str, list] = {}
        for x in runs:
            by.setdefault(x["job"], []).append(x["status"])
        ex["failing"] = [j for j, st in by.items() if len(st) >= 2 and st[0] == "error" and st[1] == "error"]
    return ex


def fmt(v: float, dec: int = 2) -> str:
    s = f"{v:,.{dec}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def last_two(code: str) -> list[dict]:
    return select("observations", {"select": "date,value", "series_code": f"eq.{code}", "order": "date.desc", "limit": 2})[:2]


def evaluate(rules: list[dict], meta: dict[str, dict], data: dict[str, list[dict]], daily: bool, extra: dict | None = None) -> list[tuple[str, str]]:
    """Devuelve [(clave_única, mensaje)] de las reglas que se cumplen."""
    out = []
    extra = extra or {}
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
        elif t == "resumen_hora":
            # mensaje a una hora fija (p. ej. 08:00 VET): sale en la primera corrida después de esa hora
            now = dt.datetime.now(VET)
            hh, mm = map(int, rule["hora"].split(":"))
            if (now.hour, now.minute) >= (hh, mm) and now.hour < hh + 6:
                hoy = now.date().isoformat()
                lines = [rule["texto"].format(fecha=hoy)]
                for code in rule["series"]:
                    obs, m = data.get(code, []), meta.get(code, {})
                    if obs:
                        ch = ""
                        if len(obs) > 1 and obs[1]["value"]:
                            c = (obs[0]["value"] / obs[1]["value"] - 1) * 100
                            ch = f" ({'+' if c > 0 else ''}{fmt(c, 2)}% vs {obs[1]['date'][8:10]}/{obs[1]['date'][5:7]})"
                        lines.append(f"• {m.get('name_es', code)}: {fmt(obs[0]['value'], min(m.get('decimals', 2), 2))} {m.get('unit_es', '')}{ch}")
                if SITE:
                    lines.append(SITE)
                out.append((f"{rule['id']}:{hoy}", "\n".join(lines)))
        elif t == "acciones":
            # acciones de la BVC con movimientos fuertes en la última sesión
            for q in extra.get("quotes", []):
                v = q.get("var_pct")
                if v is not None and abs(v) >= rule["pct"] and (q.get("amount") or 0) >= rule.get("monto_min", 0):
                    out.append((f"{rule['id']}:{q['symbol']}:{q['date']}", rule["texto"].format(
                        simbolo=q["symbol"], empresa=q.get("company") or "", cambio=("+" if v > 0 else "") + fmt(v, 2),
                        precio=fmt(q.get("close") or 0, 2), fecha=q["date"])))
        elif t == "volumen":
            pts = extra.get("monto", [])
            if len(pts) > 25:
                last = pts[-1]
                year = [p["value"] for p in pts[:-1] if p["date"][:4] == last["date"][:4]] or [p["value"] for p in pts[-61:-1]]
                avg_y = sum(year) / len(year)
                avg_20 = sum(p["value"] for p in pts[-21:-1]) / 20
                if avg_y and last["value"] >= rule["veces"] * avg_y:
                    out.append((f"{rule['id']}:{last['date']}", rule["texto"].format(
                        valor=fmt(last["value"] / 1e6, 1), veces=fmt(last["value"] / avg_y, 1),
                        veces20=fmt(last["value"] / avg_20 if avg_20 else 0, 1), fecha=last["date"])))
        elif t == "noticia":
            import re as _re
            rx = _re.compile(rule["patron"], _re.I)
            for n in extra.get("news", []):
                if rx.search(n["title"]):
                    out.append((f"{rule['id']}:{n['url'][-120:]}", rule["texto"].format(titulo=n["title"], fuente=n.get("source") or "", url=n["url"])))
        elif t == "ofac":
            for a in extra.get("ofac", []):
                out.append((f"{rule['id']}:{a['url'][-120:]}", rule["texto"].format(titulo=a["title"], fecha=a["date"], url=a["url"])))
        elif t == "robots":
            for j in extra.get("failing", []):
                out.append((f"{rule['id']}:{j}:{today_caracas().isoformat()}", rule["texto"].format(robot=j)))
        elif t == "una_vez":
            out.append((f"{rule['id']}:1", rule["texto"] + (f"\n{SITE}" if SITE else "")))
        elif t in ("cierre_semana", "cierre_mes") and daily:
            hoy = today_caracas()
            if t == "cierre_semana" and hoy.weekday() != 4:
                continue
            if t == "cierre_mes" and (hoy + dt.timedelta(days=1)).day != 1:
                continue
            ref = (hoy - dt.timedelta(days=7)) if t == "cierre_semana" else hoy.replace(day=1) - dt.timedelta(days=1)
            jan = dt.date(hoy.year - 1, 12, 31)
            def at(pts, d):
                v = None
                for x, y in pts:
                    if x <= d.isoformat():
                        v = y
                    else:
                        break
                return v
            lines = [rule["texto"].format(fecha=hoy.isoformat())]
            for code in rule["series"]:
                pts, m = extra.get("hist", {}).get(code, []), meta.get(code, {})
                if not pts:
                    continue
                last, base, y0 = pts[-1][1], at(pts, ref), at(pts, jan)
                pct = m.get("unit_es") == "%"
                def ch(b):
                    if b is None or (not pct and not b):
                        return "—"
                    v = last - b if pct else (last / b - 1) * 100
                    return f"{'+' if v > 0 else ''}{fmt(v, 1)}{' pp' if pct else '%'}"
                lines.append(f"• {m.get('name_es', code)}: {fmt(last, min(m.get('decimals', 2), 2))} {m.get('unit_es', '')} · "
                             f"{'semana' if t == 'cierre_semana' else 'mes'} {ch(base)} · año {ch(y0)}")
            if SITE:
                lines.append(SITE)
            out.append((f"{rule['id']}:{hoy.isoformat()}", "\n".join(lines)))
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
    import time
    with Run("alerts") as r:
        rules = json.loads(CONFIG.read_text(encoding="utf-8"))["reglas"]
        if not (os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID")):
            r.note("Faltan los secretos TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en GitHub: no se puede enviar nada")
        codes = sorted({c for x in rules for c in ([x["serie"]] if "serie" in x else x.get("series", []))})
        meta = {s["code"]: s for s in select("series", {"select": "code,name_es,unit_es,decimals"})}
        data = {c: last_two(c) for c in codes}
        candidates = evaluate(rules, meta, data, daily, gather_extra(rules, daily))
        if not candidates:
            return
        # bitácora completa (sin filtros con caracteres especiales en la URL de la consulta)
        log_all = select("alerts_log", {"select": "key,rule,sent_at"})
        sent = {x["key"] for x in log_all}
        first_run = not log_all
        known_rules = {x["rule"] for x in log_all}
        by_id = {x["id"]: x for x in rules}
        today = today_caracas().isoformat()
        since30 = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat()
        recent = [x for x in log_all if (x.get("sent_at") or "") >= since30]
        TIMED = ("resumen_hora", "resumen_diario", "cierre_semana", "cierre_mes", "una_vez", "robots")
        log, n_sent = [], 0
        for key, text in candidates:
            if key in sent:
                continue
            rid = key.split(":")[0]
            rule = by_id.get(rid, {})
            tipo = rule.get("tipo")
            prefix = ":".join(key.split(":")[:2]) + ":"
            # regla nueva: la primera vez solo registra lo que ya existía (salvo mensajes con hora fija)
            silent = first_run or (rid not in known_rules and tipo not in TIMED)
            if tipo == "nuevo_dato" and not any(x["key"].startswith(prefix) for x in log_all):
                silent = True  # serie recién agregada a la regla: no avisar el dato viejo
            if rule.get("min_dias") and any(x["key"].startswith(prefix) and (x.get("sent_at") or "")[:10] > (dt.date.today() - dt.timedelta(days=rule["min_dias"])).isoformat() for x in recent):
                continue  # series diarias (p. ej. reservas): como máximo un aviso cada N días
            if rule.get("max_dia") and sum(1 for x in recent + log if x["rule"] == rid and str(x.get("sent_at", ""))[:10] == today and x.get("channels")) >= rule["max_dia"]:
                silent = True  # tope diario (noticias): se registra sin enviar
            if not silent and n_sent >= 25:
                continue  # demasiados mensajes en una corrida: el resto sale en la siguiente
            channels = []
            if not silent:
                try:
                    if send_telegram(text):
                        channels.append("telegram")
                        n_sent += 1
                        time.sleep(3)  # Telegram admite ~20 mensajes por minuto en un canal
                except Exception as e:  # noqa: BLE001
                    r.note(f"Telegram: {e}")
                try:
                    if send_email(text):
                        channels.append("email")
                except Exception as e:  # noqa: BLE001
                    r.note(f"Correo: {e}")
            log.append({"key": key, "rule": rid, "message": text, "channels": ",".join(channels) or None, "sent_at": dt.datetime.now(dt.timezone.utc).isoformat()})
        r.rows = upsert("alerts_log", log, "key")
