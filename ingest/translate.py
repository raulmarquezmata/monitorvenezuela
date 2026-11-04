"""Traducción de titulares para que la web los muestre siempre en español o en inglés.

Se usa el traductor web de Google (sin clave) y, si falla, MyMemory. Solo se traducen titulares nuevos
(o los que quedaron sin traducir), con un tope por corrida para no ser bloqueados.
"""
from __future__ import annotations

import datetime as dt
import time
from urllib.parse import quote

from .common import fetch, select, upsert

GOOGLE = "https://translate.googleapis.com/translate_a/single?client=gtx&sl={sl}&tl={tl}&dt=t&q={q}"
MYMEMORY = "https://api.mymemory.translated.net/get?q={q}&langpair={sl}|{tl}"


def google(text: str, tl: str, sl: str = "auto") -> tuple[str, str] | None:
    """Devuelve (traducción, idioma de origen detectado)."""
    try:
        data = fetch(GOOGLE.format(sl=sl, tl=tl, q=quote(text)), timeout=8, retries=1).json()
        out = "".join(part[0] for part in data[0] if part and part[0])
        src = data[2] if len(data) > 2 and isinstance(data[2], str) else sl
        return (out.strip(), src) if out.strip() else None
    except Exception:  # noqa: BLE001
        return None


def mymemory(text: str, tl: str, sl: str) -> str | None:
    if sl in ("auto", tl):
        return None
    try:
        data = fetch(MYMEMORY.format(q=quote(text), sl=sl, tl=tl), timeout=8, retries=1).json()
        out = (data.get("responseData") or {}).get("translatedText")
        return out.strip() if out and "MYMEMORY WARNING" not in out else None
    except Exception:  # noqa: BLE001
        return None


def translate_title(title: str, hint: str = "auto") -> dict:
    """{'lang': origen, 'title_es': ..., 'title_en': ...}; lo que no se pudo traducir queda en None."""
    out: dict = {"lang": hint if hint != "auto" else None, "title_es": None, "title_en": None}
    es = google(title, "es")
    if es:
        out["lang"] = es[1] or out["lang"]
    src = out["lang"] or hint
    if src == "es":
        out["title_es"] = title
    elif es:
        out["title_es"] = es[0]
    elif src not in ("auto", None):
        out["title_es"] = mymemory(title, "es", src)
    if src == "en":
        out["title_en"] = title
    else:
        en = google(title, "en", src or "auto")
        out["title_en"] = en[0] if en else (mymemory(title, "en", src) if src else None)
    return out


def run(limit: int = 120, budget: float = 120.0) -> int:
    """Traduce los titulares de los últimos 30 días que todavía no tienen las dos versiones."""
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat()
    rows = select("news", {"select": "url,title,lang,title_es,title_en", "published_at": f"gte.{since}",
                           "or": "(title_es.is.null,title_en.is.null)", "order": "published_at.desc", "limit": limit})
    done, t0, fails = [], time.time(), 0
    for x in rows:
        if time.time() - t0 > budget or fails >= 5:
            break  # el resto se traduce en la próxima corrida (o el traductor nos está bloqueando)
        tr = translate_title(x["title"], x.get("lang") or "auto")
        fails = fails + 1 if not (tr.get("title_es") and tr.get("title_en")) else 0
        upd = {"url": x["url"], "title": x["title"],
               "title_es": x.get("title_es") or tr.get("title_es"), "title_en": x.get("title_en") or tr.get("title_en"),
               "lang": (tr.get("lang") or x.get("lang") or "es")[:5]}
        if (upd["title_es"], upd["title_en"]) != (x.get("title_es"), x.get("title_en")):
            done.append(upd)  # todas las filas con las mismas columnas (requisito del upsert en lote)
        time.sleep(0.4)
    return upsert("news", done, "url") if done else 0
