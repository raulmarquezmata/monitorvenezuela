"""Noticias económicas de Venezuela vía RSS, clasificadas por tema con palabras clave."""
from __future__ import annotations

import datetime as dt
import re
import calendar
import json
import pathlib
import time

import feedparser

from .common import Run, clean_text, fetch, upsert


CONFIG = pathlib.Path(__file__).resolve().parent.parent / "config" / "news_feeds.json"


def load_feeds() -> list[dict]:
    return json.loads(CONFIG.read_text(encoding="utf-8"))["feeds"]


CATEGORIES = [  # orden = prioridad. Cambiario y precios van en economía; sanciones en política.
    ("deuda", r"bonos? (soberan|de la rep|de pdvsa|venz)|eurobono|deuda (externa|p[uú]blica|soberana)|reestructuraci[oó]n de (la )?deuda|acreedor|default|impago|riesgo pa[ií]s|\bembi\b|bondholder|debt restructuring|sovereign bond|creditors"),
    ("mineria", r"miner[ií]a|minero|\boro\b|coltan|coltán|hierro|bauxita|arco minero|ferrominera|\bcvg\b|mining|\bgold\b|iron ore"),
    ("petroleo", r"petr[oó]le|pdvsa|crudo|barril|chevron|opep|opec|\boil\b|crude|gas natural|\bgas\b|refiner|hidrocarbur|merey|faja|citgo|\blng\b"),
    ("economia", r"intervenci[oó]n cambiaria|tipo de cambio|d[oó]lar (oficial|paralelo|bcv)|tasa (bcv|oficial)|inflaci[oó]n|\binpc\b|liquidez|reservas internacionales|\bpib\b|devaluaci|exchange rate|inflation"),
    ("banca", r"\bbanc[oa]s?\b|cr[eé]dito|encaje|sudeban|dep[oó]sito|cartera crediticia|\bbank|\bloan|fintech|cashea"),
    ("mercados", r"bolsa de valores|\bbvc\b|\bibc\b|acciones|papeles comerciales|sunaval|casa de bolsa|stock|\bshares\b|bolpriaven"),
    ("agro", r"agr[ií]col|cosecha|ma[ií]z|arroz|caf[eé]|cacao|ganad|fedeagro|fertiliz|\bagro|siembra|alimentos"),
    ("politica", r"ofac|sanci[oó]n|licencia general|sanction|general license|elecci|asamblea nacional|tsj|gobierno|presiden|canciller|di[aá]logo|oposici|delcy|trump|rubio|embajad|ministr|diplomac|political|election|government"),
    ("economia", r"inflaci[oó]n|\bpib\b|econom|import|export|liquidez|reservas|recaudaci|seniat|presupuesto|d[oó]lar|tipo de cambio|bol[ií]var|divisa|intervenci[oó]n cambiaria|salario|precios|gdp|inflation|economy|exchange rate"),
]
RELEVANT = re.compile(r"venezuel|caracas|\bbcv\b|pdvsa|bol[ií]var|sudeban|seniat|sunaval|\bbvc\b|fedec[aá]maras|conindustria|consecomercio|"
                      r"delcy|maracaibo|zulia|carabobo|anzo[aá]tegui|monagas|guayana|orinoco|\bfaja\b|corpoelec|cantv|cashea|citgo|"
                      r"esequibo|bolpriaven|casa de bolsa|banesco|mercantil|provincial|bancaribe|banco de venezuela|\bbnc\b|maduro|machado", re.I)
# temas que no son de Venezuela (salvo que el titular también la mencione): se descartan aunque vengan de medios venezolanos
FOREIGN = re.compile(r"\bir[aá]n\b|ormuz|hormuz|israel|gaza|ucrania|ukraine|rusia\b|putin|zelensk|taiw[aá]n|corea del norte|"
                     r"bitcoin|ethereum|\bcripto|crypto|\bnft\b|blockchain|memecoin|solana|dogecoin|lazarus|trader ?traitor|"
                     r"argentina|milei|chile\b|per[uú]\b|ecuador|bolivia|m[eé]xico|brasil|lula|colombia(?! .*venezuel)|petro\b|"
                     r"champions|f[uú]tbol|mundial de|nba\b|mlb\b|hollywood|celebrity", re.I)


def is_relevant(title: str, summary: str | None, strict: bool) -> bool:
    """strict (medios internacionales): debe mencionar Venezuela o algo propio del país.
    No strict (medios venezolanos): se acepta todo salvo temas claramente extranjeros que no mencionen a Venezuela."""
    blob = f"{title} {summary or ''}"
    if RELEVANT.search(blob):
        return True
    return not strict and not FOREIGN.search(title)


def categorize(text: str) -> str:
    t = text.lower()
    for cat, rx in CATEGORIES:
        if re.search(rx, t):
            return cat
    return "economia"


def parse_feed(content: bytes, default_source: str | None, lang: str, require_relevance: bool) -> list[dict]:
    feed = feedparser.parse(content)
    out = []
    cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=10)
    for e in feed.entries:
        title = clean_text(e.get("title"), 300)
        link = e.get("link")
        if not title or not link:
            continue
        source = default_source
        src = e.get("source")
        if not source and src:
            source = src.get("title") if isinstance(src, dict) else getattr(src, "title", None)
        if not default_source and source and title.endswith(f" - {source}"):
            title = title[: -len(source) - 3].strip()
        tp = e.get("published_parsed") or e.get("updated_parsed")
        published = dt.datetime.fromtimestamp(calendar.timegm(tp), dt.timezone.utc) if tp else dt.datetime.now(dt.timezone.utc)
        if published < cutoff:
            continue
        summary = clean_text(e.get("summary"), 400)
        if summary and summary.startswith(title[:40]):
            summary = None  # Google News repite el titular en el resumen
        blob = f"{title} {summary or ''}"
        if not is_relevant(title, summary, require_relevance):
            continue
        out.append({"url": link, "title": title, "source": source or "—", "published_at": published.isoformat(),
                    "summary": summary, "category": categorize(blob), "lang": lang})
    return out


def google_fallback(f: dict) -> list[dict] | None:
    """Si el RSS propio del medio no responde (bloqueo a GitHub), busca el mismo medio en Google News."""
    from urllib.parse import quote, urlparse
    if f.get("kind") == "agregador":
        return None
    dom = urlparse(f["url"]).netloc.removeprefix("www.")
    es = f.get("lang", "es") == "es"
    q = quote(f"site:{dom} when:3d")
    url = (f"https://news.google.com/rss/search?q={q}&hl=es-419&gl=VE&ceid=VE:es-419" if es
           else f"https://news.google.com/rss/search?q={q}&hl=en-US&gl=US&ceid=US:en")
    try:
        got = parse_feed(fetch(url, timeout=30, retries=2).content, f["name"], f.get("lang", "es"), f.get("filter", True))
    except Exception:  # noqa: BLE001
        return None
    for it in got:  # Google añade " - Medio" al titular
        it["title"] = re.sub(r"\s+-\s+[^-]{2,40}$", "", it["title"]).strip()
    return got


OLD_CATS = ("cambiario", "precios", "sanciones")


def cleanup() -> int:
    """Quita de la base las noticias recientes que no son sobre Venezuela (reglas actuales)."""
    from .common import delete, select
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=45)).isoformat()
    bad = [x["url"] for x in select("news", {"select": "url,title,summary,source", "published_at": f"gte.{since}"})
           if not is_relevant(x["title"], x.get("summary"), False)]
    for u in bad:
        try:
            delete("news", {"url": f"eq.{u}"})
        except Exception:  # noqa: BLE001
            pass
    return len(bad)


def recategorize() -> int:
    """Vuelve a clasificar las noticias de los últimos 30 días con las reglas actuales (solo guarda las que cambian)."""
    from .common import select
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=30)).isoformat()
    rows = select("news", {"select": "url,title,summary,source,published_at,category,lang", "published_at": f"gte.{since}"})
    changed = []
    for x in rows:
        c = categorize(f"{x['title']} {x.get('summary') or ''}")
        if c != x.get("category"):
            x["category"] = c
            changed.append(x)
    return upsert("news", changed, "url") if changed else 0


def run():
    with Run("news") as r:
        seen_titles: set[str] = set()
        items: list[dict] = []
        health: list[dict] = []
        now = dt.datetime.now(dt.timezone.utc).isoformat()
        for f in load_feeds():
            agg = f.get("kind") == "agregador"
            st = {"name": f["name"], "url": f["url"], "lang": f.get("lang", "es"), "last_run": now,
                  "last_ok": None, "last_items": 0, "last_error": None}
            try:
                content = fetch(f["url"], timeout=30, retries=2).content
                got = parse_feed(content, None if agg else re.sub(r"\s*\((RSS|búsqueda)\)$", "", f["name"]), f.get("lang", "es"), f.get("filter", True))
                for it in got:
                    # títulos repetidos en varios medios se guardan todos: la web los agrupa y ofrece cada enlace
                    if it["url"] not in seen_titles:
                        seen_titles.add(it["url"])
                        items.append(it)
                st.update(last_ok=now, last_items=len(got))
            except Exception as e:  # noqa: BLE001
                got = google_fallback(f)
                if got is not None:
                    for it in got:
                        if it["url"] not in seen_titles:
                            seen_titles.add(it["url"])
                            items.append(it)
                    st.update(last_ok=now, last_items=len(got), last_error="RSS propio bloqueado; vía Google News")
                else:
                    st["last_error"] = str(e)[:300]
                    r.note(f"{f['name']}: sin respuesta")
            health.append(st)
        r.rows = upsert("news", items, "url")
        try:
            n = cleanup()
            if n:
                r.log.info("Noticias fuera de tema retiradas: %d", n)
            r.rows += recategorize()
        except Exception as e:  # noqa: BLE001
            r.log.info("recategorizar: %s", e)
        ok = [h for h in health if h["last_ok"]]
        upsert("news_sources", ok, "name")
        upsert("news_sources", [{k: v for k, v in h.items() if k != "last_ok"} for h in health if not h["last_ok"]], "name")
