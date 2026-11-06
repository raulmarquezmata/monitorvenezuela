"""Alertas a un canal de Telegram (gratis) y/o correo vía Gmail (gratis, sin dominio propio).

Secretos opcionales en GitHub:
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID   (ej. @mi_canal o id numérico)
  GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_EMAILS (lista separada por comas)
Las reglas están en config/alerts.json. Cada alerta se envía una sola vez (tabla alerts_log).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import os
import pathlib
import smtplib
from email.mime.text import MIMEText

from .common import Run, http, select, today_caracas, upsert

CONFIG = pathlib.Path(__file__).resolve().parent.parent / "config" / "alerts.json"
SITE = os.environ.get("SITE_URL", "")
VET = dt.timezone(dt.timedelta(hours=-4))


# ---------------------------------------------------------------- formato de los mensajes
# Los mensajes se arman en texto simple con dos marcas: **negrita** y [texto](enlace).
# pretty() los convierte al HTML de Telegram; plain() los deja legibles para el correo.
SEP = "━━━━━━━━━━━━━━"
CAT_PAGE = {"mercados": "/es/bvc", "noticias": "/es/noticias"}
BCV_STATS = "https://www.bcv.org.ve/estadisticas"


def site(path: str = "") -> str:
    return (SITE.rstrip("/") + path) if SITE else ""


def lk(label: str, url: str | None) -> str:
    return f"[{label}]({url})" if url else ""


def foot(*links: str) -> str:
    items = [x for x in links if x]
    return ("\n\n🔗 " + "  ·  ".join(items)) if items else ""


def arrow(v: float | None) -> str:
    return "" if v is None else ("🟢▲" if v > 0 else "🔴▼" if v < 0 else "⚪")


def series_page(m: dict) -> str:
    cat = m.get("category")
    return site(CAT_PAGE.get(cat, f"/es/indicadores/{cat}")) if cat else site()


def pretty(text: str) -> str:
    """Texto con **negrita** y [enlaces](url) → HTML de Telegram (escapa todo lo demás)."""
    import html
    import re
    t = html.escape(text, quote=False)
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    t = re.sub(r"\[([^\]]+)\]\((https?://[^\s)]+)\)", lambda m: f'<a href="{m.group(2).replace(chr(34), "%22")}">{m.group(1)}</a>', t)
    # enlaces sueltos (p. ej. en textos viejos): se muestran como «Abrir ↗»
    t = re.sub(r"(?m)^(https?://\S+)$", r'<a href="\1">Abrir ↗</a>', t)
    lines = t.split("\n")
    if "<b>" not in lines[0]:
        lines[0] = f"<b>{lines[0]}</b>"
    if len(lines) > 1 and lines[1].strip() != SEP:
        lines.insert(1, SEP)
    return "\n".join(lines)


def plain(text: str) -> str:
    import re
    t = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    return re.sub(r"\[([^\]]+)\]\((https?://[^\s)]+)\)", r"\1: \2", t)


DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]
MERCADO = ["usd_bcv", "usd_paralelo", "eur_bcv", "brecha_cambiaria", "ibc", "bvc_monto", "bvc_monto_rf", "embi_venezuela", "brent", "merey"]


def market_summary(title: str, hist: dict, today: dt.date) -> str:
    """Resumen de mercado (buenos días y cierre): mismas líneas, para seguir siempre los mismos indicadores."""

    def last(code):
        pts = hist.get(code) or []
        return pts[-1] if pts else None

    def before(code, d):
        v = None
        for x, y in hist.get(code) or []:
            if x < d:
                v = (x, y)
            else:
                break
        return v

    def pct(a, b):
        return None if not b else (a / b - 1) * 100

    def sg(v, dec=2, suf="%"):
        if v is None:
            return "—"
        return f"{arrow(v)} {'+' if v > 0 else ''}{fmt(v, dec)}{suf}"

    def wk(d):  # lunes de la semana del dato (el lunes por la mañana mide la semana anterior)
        x = dt.date.fromisoformat(d)
        return (x - dt.timedelta(days=x.weekday())).isoformat()

    def tag(d):  # fecha del dato si no es de hoy
        return "" if d == today.isoformat() else f" ({int(d[8:10])}-{MESES[int(d[5:7]) - 1]})"

    out = [f"{title} · {DIAS[today.weekday()]} {today.day} {MESES[today.month - 1]} {today.year}", SEP, "💱 **TIPO DE CAMBIO**"]
    for code, label, dec, emoji in (("usd_bcv", "Dólar oficial", 2, "💵"), ("usd_paralelo", "Mercado alternativo", 2, "💵"), ("eur_bcv", "Euro oficial", 2, "💶")):
        x = last(code)
        if x:
            p = hist[code][-2] if len(hist[code]) > 1 else None
            w = before(code, wk(x[0]))
            out.append(f"{emoji} {label}: **Bs {fmt(x[1], dec)}**{tag(x[0])}")
            out.append(f"      día {sg(pct(x[1], p[1]) if p else None)}   semana {sg(pct(x[1], w[1]) if w else None)}")
    x = last("brecha_cambiaria")
    if x:
        p = hist["brecha_cambiaria"][-2] if len(hist["brecha_cambiaria"]) > 1 else None
        out.append(f"↔️ Brecha: **{fmt(x[1], 1)}%**{tag(x[0])}   día {sg(x[1] - p[1] if p else None, 1, ' pp')}")
    out += ["", "📈 **BOLSA DE CARACAS**"]
    x = last("ibc")
    if x:
        p = hist["ibc"][-2] if len(hist["ibc"]) > 1 else None
        w = before("ibc", wk(x[0]))
        out.append(f"IBC: **{fmt(x[1], 2)} pts**{tag(x[0])}")
        out.append(f"      día {sg(pct(x[1], p[1]) if p else None)}   semana {sg(pct(x[1], w[1]) if w else None)}")
    for code, label in (("bvc_monto", "Renta variable"), ("bvc_monto_rf", "Renta fija")):
        x = last(code)
        if x and x[1]:
            of = before("usd_bcv", (dt.date.fromisoformat(x[0]) + dt.timedelta(days=1)).isoformat())
            pa = before("usd_paralelo", (dt.date.fromisoformat(x[0]) + dt.timedelta(days=1)).isoformat())
            out.append(f"💰 {label}: **Bs {fmt(x[1], 0)}**{tag(x[0])}")
            usd = [f"US$ {fmt(x[1] / r[1], 0)} {n}" for r, n in ((of, "oficial"), (pa, "alternativo")) if r]
            if usd:
                out.append("      " + " · ".join(usd))
    out += ["", "🌎 **RIESGO Y PETRÓLEO**"]
    x = last("embi_venezuela")
    if x:
        p = hist["embi_venezuela"][-2] if len(hist["embi_venezuela"]) > 1 else None
        w = before("embi_venezuela", (dt.date.fromisoformat(x[0]) - dt.timedelta(days=6)).isoformat())
        out.append(f"📉 Riesgo país (EMBI): **{fmt(x[1], 0)} pbs**{tag(x[0])}")
        out.append(f"      día {sg(x[1] - p[1] if p else None, 0, ' pbs')}   semana {sg(pct(x[1], w[1]) if w else None)}")
    x = last("brent")
    if x:
        p = hist["brent"][-2] if len(hist["brent"]) > 1 else None
        out.append(f"🛢️ Brent: **US$ {fmt(x[1], 2)}**{tag(x[0])}   día {sg(pct(x[1], p[1]) if p else None)}")
    x = last("merey")
    if x:
        p = hist["merey"][-2] if len(hist["merey"]) > 1 else None
        out.append(f"🛢️ Merey ({MESES[int(x[0][5:7]) - 1]}): **US$ {fmt(x[1], 2)}**   mes {sg(pct(x[1], p[1]) if p else None)}")
    return "\n".join(out) + foot(lk("Abrir el Radar", site("/es")), lk("Tipo de cambio", site("/es/indicadores/cambiario")), lk("BVC", site("/es/bvc")))


def gather_extra(rules: list[dict], daily: bool = False) -> dict:
    """Datos que necesitan las reglas que no son de una sola serie."""
    tipos = {r["tipo"] for r in rules}
    ex: dict = {"hist": {}}
    need = {c for r in rules if r["tipo"] in ("cierre_semana", "cierre_mes") for c in r.get("series", [])} if daily else set()
    if any(r["tipo"] == "resumen_mercado" for r in rules):
        need |= set(MERCADO)
    if need:
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
    if "bvc_noticia" in tipos:  # noticias de emisores (las etiqueta el robot «emisores»)
        try:
            ex["bvc_news"] = select("news", {"select": "title,title_es,url,source,published_at,symbols", "published_at": f"gte.{since}",
                                             "symbols": "not.is.null", "order": "published_at.desc", "limit": 40})
        except Exception:  # noqa: BLE001
            ex["bvc_news"] = []
    if "bvc_asamblea" in tipos:
        try:
            ex["bvc_events"] = select("bvc_events", {"select": "id,symbol,date,kind,title,url", "date": f"gte.{today_caracas().isoformat()}", "order": "date"})
        except Exception:  # noqa: BLE001
            ex["bvc_events"] = []
    if "informe" in tipos:
        try:
            ex["informes"] = select("informes", {"select": "id,title,date,topic,lang,created_at,url", "order": "created_at.desc", "limit": 30})
        except Exception:  # noqa: BLE001
            ex["informes"] = []
    if "nuevo_dato" in tipos:  # documentos publicados (BCV, SUNAVAL, OPEP) para enlazarlos en los avisos
        try:
            ex["files"] = select("source_files", {"select": "url,page,filename,first_seen,last_seen", "order": "last_seen.desc", "limit": 200})
        except Exception:  # noqa: BLE001
            ex["files"] = []
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
    return select("observations", {"select": "date,value,source", "series_code": f"eq.{code}", "order": "date.desc", "limit": 2})[:2]


def fecha_txt(d: str, freq: str | None = None) -> str:
    """2026-11-03 → 3 nov 2026; datos mensuales → oct 2026; trimestrales → III trim. 2026; anuales → 2026."""
    try:
        x = dt.date.fromisoformat(d[:10])
    except ValueError:
        return d
    if freq == "M":
        return f"{MESES[x.month - 1]} {x.year}"
    if freq == "Q":
        return f"{['I', 'II', 'III', 'IV'][(x.month - 1) // 3]} trim. {x.year}"
    if freq == "A":
        return str(x.year)
    return f"{x.day} {MESES[x.month - 1]} {x.year}"


# archivo del BCV de donde sale cada serie (código de la serie → nombre del archivo), para enlazar el archivo exacto
BCV_FILE_HINTS = [(r"^pib_.*anual", r"5_2_4_ae_anual"), (r"^pib_", r"5_2_4_ae_trim"), (r"liquidez|dinero_m1|multiplicador", r"liquidez_monetaria"),
                  (r"^base_monetaria", r"base_monetaria"), (r"^reservas", r"^2_1_1|^2_3_1"), (r"^tasa_activa", r"^1_1_7"),
                  (r"^tasa_(ahorro|plazo)", r"^1_1_6"), (r"^encaje", r"^1_3_36"),
                  (r"cuenta_corriente|exportaciones_(bienes|petroleras|no_petroleras)$|importaciones_bienes|inversion_directa|transferencias", r"^2_4_1_t")]
ARCHIVE_PAGE = {"sunaval": ("SUNAVAL mensual", "sunaval"), "momr": ("OPEP MOMR", "opep-momr")}


def source_links(rule: dict, code: str, ob: dict, m: dict, extra: dict) -> str:
    """Enlaces de un dato nuevo: el documento o la noticia de donde salió, una copia archivada si la hay y la página del Monitor."""
    import re
    src = ob.get("source") or ""
    links = []
    url = re.search(r"https?://\S+", src)
    if url:  # anuncio tomado de la prensa: enlaza la noticia
        links.append(lk("Ver la noticia", url.group(0)))
    elif rule["id"] in ARCHIVE_PAGE:  # SUNAVAL, OPEP: el informe original y la copia guardada en el repositorio
        page, folder = ARCHIVE_PAGE[rule["id"]]
        f = next((x for x in extra.get("files", []) if x.get("page") == page), None)
        if f:
            links.append(lk("Informe original", f["url"]))
            repo = os.environ.get("GITHUB_REPOSITORY")
            from urllib.parse import quote
            from .common import ARCHIVE, archive_name
            name = archive_name(f["filename"])
            if repo and (ARCHIVE / folder / name).exists():
                links.append(lk("Copia archivada", f"https://github.com/{repo}/blob/main/data/archivo/{folder}/{quote(name)}"))
    elif src.startswith("BCV"):  # el archivo exacto que publicó el BCV, si se reconoce, y su copia archivada
        hint = next((fx for cx, fx in BCV_FILE_HINTS if re.search(cx, code)), None)
        f = next((x for x in extra.get("files", []) if x.get("page") == "BCV" and hint
                  and re.search(hint, re.sub(r"^[0-9a-f]{8}-", "", x["filename"].lower()))), None)
        links.append(lk("Archivo del BCV", f["url"]) if f else lk("Estadísticas del BCV", m.get("source_url") or BCV_STATS))
        repo = os.environ.get("GITHUB_REPOSITORY")
        if f and repo:
            from urllib.parse import quote
            from .common import ARCHIVE, archive_name
            name = archive_name(f["filename"])
            if (ARCHIVE / "bcv" / name).exists():
                links.append(lk("Copia archivada", f"https://github.com/{repo}/blob/main/data/archivo/bcv/{quote(name)}"))
    if not links and m.get("source_url"):
        links.append(lk(f"Fuente: {m.get('source') or 'ver'}", m["source_url"]))
    links.append(lk("Ver en el Radar", series_page(m)))
    return foot(*links)


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
                    out.append((f"{rule['id']}:{cur['date']}", rule["texto"].format(valor=fmt(cur["value"], dec), fecha=fecha_txt(cur["date"]), cambio="", flecha="")
                                + foot(lk(f"Fuente: {m.get('source') or 'ver'}", m.get("source_url")), lk("Ver en el Radar", series_page(m)))))
            else:
                if prev["value"]:
                    ch = (cur["value"] / prev["value"] - 1) * 100
                    if abs(ch) >= rule["pct"]:
                        out.append((f"{rule['id']}:{cur['date']}", rule["texto"].format(
                            valor=fmt(cur["value"], dec), fecha=fecha_txt(cur["date"]), cambio=("+" if ch > 0 else "") + fmt(ch, 1), flecha=arrow(ch),
                            anterior=fmt(prev["value"], dec))
                            + foot(lk(f"Fuente: {m.get('source') or 'ver'}", m.get("source_url")), lk("Ver en el Radar", series_page(m)))))
        elif t == "nuevo_dato":
            for code in rule["series"]:
                obs = data.get(code, [])
                if obs:
                    m = meta.get(code, {})
                    out.append((f"{rule['id']}:{code}:{obs[0]['date']}", rule["texto"].format(
                        nombre=m.get("name_es", code), valor=fmt(obs[0]["value"], min(m.get("decimals", 2), 2)),
                        unidad=m.get("unit_es", ""), fecha=fecha_txt(obs[0]["date"], m.get("frequency")))
                        + source_links(rule, code, obs[0], m, extra)))
        elif t == "resumen_hora":
            # mensaje a una hora fija (p. ej. 08:00 VET): sale en la primera corrida después de esa hora
            now = dt.datetime.now(VET)
            hh, mm = map(int, rule["hora"].split(":"))
            # se puede adelantar unos minutos ("adelanto") para compensar el retraso de GitHub;
            # pasada la "ventana" (minutos después de la hora) ya no se manda ese día
            m = now.hour * 60 + now.minute
            if hh * 60 + mm - rule.get("adelanto", 0) <= m < hh * 60 + mm + rule.get("ventana", 360):
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
        elif t == "resumen_mercado":
            now = dt.datetime.now(VET)
            hh, mm = map(int, rule["hora"].split(":"))
            if rule.get("dias_habiles") and now.weekday() >= 5:
                continue
            # se puede adelantar unos minutos ("adelanto") para compensar el retraso de GitHub;
            # pasada la "ventana" (minutos después de la hora) ya no se manda ese día
            m = now.hour * 60 + now.minute
            if hh * 60 + mm - rule.get("adelanto", 0) <= m < hh * 60 + mm + rule.get("ventana", 360):
                out.append((f"{rule['id']}:{now.date().isoformat()}", market_summary(rule["texto"], extra.get("hist", {}), now.date())))
        elif t == "acciones":
            # acciones de la BVC con movimientos fuertes en la última sesión
            hoy = today_caracas().isoformat()
            for q in extra.get("quotes", []):
                if q.get("date") != hoy:
                    continue  # solo movimientos de la sesión de hoy
                v = q.get("var_pct")
                if v is not None and (v >= 300 or v <= -75):
                    continue  # salto de varias veces el precio: casi seguro un split o reverse split, no un movimiento de mercado
                if v is not None and abs(v) >= rule["pct"] and (q.get("amount") or 0) >= rule.get("monto_min", 0):
                    out.append((f"{rule['id']}:{q['symbol']}:{q['date']}", rule["texto"].format(
                        simbolo=q["symbol"], empresa=q.get("company") or "", cambio=("+" if v > 0 else "") + fmt(v, 2), flecha=arrow(v),
                        precio=fmt(q.get("close") or 0, 2), fecha=fecha_txt(q["date"]))
                        + foot(lk("Ver la acción", site(f"/es/bvc/{q['symbol']}")))))
        elif t == "bvc_noticia":
            for n in extra.get("bvc_news", []):
                syms = ", ".join(n.get("symbols") or [])
                first = (n.get("symbols") or [""])[0]
                out.append((f"{rule['id']}:{n['url'][-120:]}", rule["texto"].format(
                    simbolo=syms, titulo=n.get("title_es") or n["title"], fuente=n.get("source") or "", url="")
                    + foot(lk("Leer la noticia", n["url"]), lk("Ficha de la acción", site(f"/es/bvc/{first}") if first else ""))))
        elif t == "bvc_asamblea":
            for e in extra.get("bvc_events", []):
                d = dt.date.fromisoformat(e["date"])
                out.append((f"{rule['id']}:{e['id']}", rule["texto"].format(
                    simbolo=e["symbol"], tipo={"ordinaria": "Asamblea ordinaria", "extraordinaria": "Asamblea extraordinaria"}.get(e.get("kind"), "Asamblea de accionistas"),
                    fecha=f"{DIAS[d.weekday()]} {d.day} {MESES[d.month - 1]} {d.year}", url="")
                    + foot(lk("Ver la convocatoria", e.get("url")), lk("Ficha de la acción", site(f"/es/bvc/{e['symbol']}")))))
        elif t == "informe":
            for x in extra.get("informes", []):
                if (x.get("created_at") or "") < (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=3)).isoformat():
                    continue
                link = site(f"/{'en' if x.get('lang') == 'en' else 'es'}/informes")
                out.append((f"{rule['id']}:{x['id']}", rule["texto"].format(titulo=x.get("title") or x["id"], url="").strip()
                            + foot(lk("Abrir el informe (PDF)", x.get("url")), lk("Todos los informes", link))))
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
                        veces20=fmt(last["value"] / avg_20 if avg_20 else 0, 1), fecha=fecha_txt(last["date"]))
                        + foot(lk("Ver la BVC", site("/es/bvc")))))
        elif t == "noticia":
            import re as _re
            rx = _re.compile(rule["patron"], _re.I)
            for n in extra.get("news", []):
                if rx.search(n["title"]):
                    out.append((f"{rule['id']}:{n['url'][-120:]}", rule["texto"].format(titulo=n.get("title_es") or n["title"], fuente=n.get("source") or "", url="")
                                + foot(lk("Leer la noticia", n["url"]), lk("Más noticias", site("/es/noticias")))))
        elif t == "ofac":
            for a in extra.get("ofac", []):
                out.append((f"{rule['id']}:{a['url'][-120:]}", rule["texto"].format(titulo=a["title"], fecha=fecha_txt(a["date"]), url="")
                            + foot(lk("Ver en OFAC", a["url"]))))
        elif t == "robots":
            for j in extra.get("failing", []):
                out.append((f"{rule['id']}:{j}:{today_caracas().isoformat()}", rule["texto"].format(robot=j)
                            + foot(lk("Estado de los robots", site("/es/datos")))))
        elif t == "una_vez":
            out.append((f"{rule['id']}:1", rule["texto"] + foot(lk("Abrir el Radar", site("/es")))))
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
                    return f"{arrow(v)} {'+' if v > 0 else ''}{fmt(v, 1)}{' pp' if pct else '%'}"
                lines.append(f"• {m.get('name_es', code)}: **{fmt(last, min(m.get('decimals', 2), 2))} {m.get('unit_es', '')}**")
                lines.append(f"      {'semana' if t == 'cierre_semana' else 'mes'} {ch(base)}   año {ch(y0)}")
            out.append((f"{rule['id']}:{hoy.isoformat()}", "\n".join(lines) + foot(lk("Abrir el Radar", site("/es")))))
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


NEWS_TYPES = ("noticia", "bvc_noticia")
_STOP = set("para como esta este sobre entre desde hasta tras pero porque cuando donde segun durante contra hacia cada otro otra "
            "sera fueron tiene tienen hace venezuela venezolano venezolana banca negocios finanzas digital".split())


def _norm(t: str) -> str:
    import unicodedata
    return "".join(c for c in unicodedata.normalize("NFD", t or "") if unicodedata.category(c) != "Mn").lower()


def same_story(a: str, b: str) -> bool:
    """¿Dos avisos cuentan la misma noticia? (mismas cifras y palabras clave, aunque el titular cambie de medio a medio)."""
    import re
    first = lambda t: _norm(t.split("\n")[0])  # noqa: E731  (solo el titular, sin fuente ni enlace)
    ta, tb = first(a), first(b)
    wa = {w for w in re.findall(r"[a-z]{4,}", ta) if w not in _STOP}
    wb = {w for w in re.findall(r"[a-z]{4,}", tb) if w not in _STOP}
    na, nb = set(re.findall(r"\d+(?:[.,]\d+)?", ta)), set(re.findall(r"\d+(?:[.,]\d+)?", tb))
    if not wa or not wb:
        return False
    shared = len(wa & wb)
    jac = shared / len(wa | wb)
    pa = set(re.findall(r"\d+(?:[.,]\d+)?(?=\s?%)", ta))
    pb = set(re.findall(r"\d+(?:[.,]\d+)?(?=\s?%)", tb))
    # la misma cifra porcentual (p. ej. 6,2%) con al menos una palabra clave en común = la misma noticia
    if pa & pb and shared >= 1:
        return True
    return jac >= 0.4 or (bool(na & nb - {"2026", "2025"}) and shared >= 2)


def send_telegram(text: str) -> bool:
    tok, chat = os.environ.get("TELEGRAM_BOT_TOKEN"), os.environ.get("TELEGRAM_CHAT_ID")
    if not (tok and chat):
        return False
    r = http.post(f"https://api.telegram.org/bot{tok.strip()}/sendMessage",
                  json={"chat_id": chat.strip(), "text": pretty(text), "parse_mode": "HTML", "disable_web_page_preview": True}, timeout=30)
    if r.status_code >= 300:  # se muestra la respuesta de Telegram (p. ej. «chat not found», «Unauthorized»)
        raise RuntimeError(f"{r.status_code} {r.text[:200]}")
    return True


def send_email(text: str) -> bool:
    user, pw, to = os.environ.get("GMAIL_USER"), os.environ.get("GMAIL_APP_PASSWORD"), os.environ.get("ALERT_EMAILS")
    if not (user and pw and to):
        return False
    msg = MIMEText(plain(text), "plain", "utf-8")
    msg["Subject"] = "Radar Grupo Solfin · " + plain(text).splitlines()[0][:80]
    msg["From"], msg["To"] = user, to
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as s:
        s.login(user, pw)
        s.sendmail(user, [x.strip() for x in to.split(",")], msg.as_string())
    return True


def run(daily: bool = False):
    import time
    with Run("alerts") as r:
        rules = json.loads(CONFIG.read_text(encoding="utf-8"))["reglas"]
        by_tipo = {x["id"]: x["tipo"] for x in rules}
        if not (os.environ.get("TELEGRAM_BOT_TOKEN") and os.environ.get("TELEGRAM_CHAT_ID")):
            r.note("Faltan los secretos TELEGRAM_BOT_TOKEN o TELEGRAM_CHAT_ID en GitHub: no se puede enviar nada")
        codes = sorted({c for x in rules for c in ([x["serie"]] if "serie" in x else x.get("series", []))})
        meta = {s["code"]: s for s in select("series", {"select": "code,name_es,unit_es,decimals,category,source,source_url,frequency"})}
        data = {c: last_two(c) for c in codes}
        candidates = evaluate(rules, meta, data, daily, gather_extra(rules, daily))
        if not candidates:
            return
        # bitácora completa (sin filtros con caracteres especiales en la URL de la consulta)
        log_all = select("alerts_log", {"select": "key,rule,sent_at"})
        # la misma noticia en varios medios (o repetida días después): solo se avisa una vez; se compara con lo
        # enviado en los últimos 10 días, porque los medios siguen publicando la misma cifra varios días
        since48 = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=10)).isoformat()
        recent_news = [x["message"] for x in select("alerts_log", {"select": "message,rule,sent_at,channels", "sent_at": f"gte.{since48}"})
                       if (x.get("message") or "") and (by_tipo.get(x["rule"]) in NEWS_TYPES or x["rule"] == "bvc_lote")]
        sent = {x["key"] for x in log_all}
        first_run = not log_all
        known_rules = {x["rule"] for x in log_all}
        by_id = {x["id"]: x for x in rules}
        dup_news: set[str] = set()
        for key, text in candidates:
            if by_tipo.get(key.split(":")[0]) in NEWS_TYPES and key not in sent:
                if any(same_story(text, m) for m in recent_news):
                    dup_news.add(key)  # ya avisada desde otro medio: se registra sin enviar
                else:
                    recent_news.append(text)
        today = today_caracas().isoformat()
        since30 = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat()
        recent = [x for x in log_all if (x.get("sent_at") or "") >= since30]
        TIMED = ("resumen_hora", "resumen_diario", "cierre_semana", "cierre_mes", "una_vez", "robots")
        # BVC: movimientos fuertes, noticias de emisores y asambleas → un solo mensaje por corrida
        BVC_TYPES = ("acciones", "bvc_noticia", "bvc_asamblea")
        bvc_ids = {x["id"]: x["tipo"] for x in rules if x["tipo"] in BVC_TYPES}
        # las reglas nuevas (primera vez) no entran: se registran en silencio más abajo
        acc = [(k, t) for k, t in candidates if k.split(":")[0] in bvc_ids and k not in sent
               and not first_run and k.split(":")[0] in known_rules]
        if len(acc) > 1:
            import re as _re
            fecha = today

            def item(t: str) -> str:
                """Primera línea del aviso (sin el emoji) y su primer enlace, en una sola línea de lista."""
                first = t.split("\n")[0]
                first = first.split(" ", 1)[1] if first and not first[:1].isalnum() else first
                link = _re.search(r"\[([^\]]+)\]\((https?://[^\s)]+)\)", t)
                return f"• {first}" + (f"  [{'leer' if 'noticia' in link.group(1).lower() else 'ver'} ↗]({link.group(2)})" if link else "")
            sec = {"acciones": [], "bvc_noticia": [], "bvc_asamblea": []}
            for k, t in acc:
                sec[bvc_ids[k.split(":")[0]]].append(item(t))
            parts = [f"📊 BVC · {fecha_txt(fecha)}"]
            if sec["acciones"]:
                parts.append("**Movimientos fuertes**\n" + "\n".join(sec["acciones"]))
            if sec["bvc_noticia"]:
                parts.append("📰 **Noticias de emisores**\n" + "\n".join(sec["bvc_noticia"][:8]))
            if sec["bvc_asamblea"]:
                parts.append("🗓️ **Asambleas**\n" + "\n".join(sec["bvc_asamblea"]))
            parts[-1] += foot(lk("Ver la BVC en el Radar", site("/es/bvc")))
            merged = (f"bvc_lote:{fecha}:{hashlib.sha1('|'.join(k for k, _ in acc).encode()).hexdigest()[:12]}", "\n\n".join(parts))
            candidates = [c for c in candidates if c not in acc] + [merged]
            by_lote = acc
        else:
            by_lote = []
        log, n_sent = [], 0
        for key, text in candidates:
            if key in sent:
                continue
            rid = key.split(":")[0]
            rule = by_id.get(rid, {})
            tipo = rule.get("tipo")
            prefix = ":".join(key.split(":")[:2]) + ":"
            # regla nueva o primera corrida: solo registra lo que ya existía (los mensajes con hora fija sí salen)
            silent = (first_run or rid not in known_rules) and tipo not in TIMED and rid != "bvc_lote"
            if key in dup_news:
                silent = True
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
        if by_lote:  # cada aviso del lote queda registrado para no repetirlo en la próxima corrida
            now = dt.datetime.now(dt.timezone.utc).isoformat()
            log += [{"key": k, "rule": k.split(":")[0], "message": t, "channels": "lote", "sent_at": now} for k, t in by_lote]
        r.rows = upsert("alerts_log", log, "key")
        r.log.info("Alertas: %d candidatas, %d enviadas a Telegram", len(log), n_sent)
