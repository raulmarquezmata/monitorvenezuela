"""Emisores de la BVC: noticias de cada acción y convocatorias a asambleas de accionistas.

Noticias: búsqueda en Google News por empresa (alias de config/bvc_empresas.json) + etiquetado de las
noticias ya guardadas que mencionan a la empresa. Se guardan en `news` con la columna `symbols`.

Asambleas (tabla `bvc_events`), por orden de confianza:
  1. data/asambleas.csv (carga manual: simbolo,fecha,tipo,descripcion,enlace)
  2. publicaciones de la BVC (bolsadecaracas.com) y de SUNAVAL que mencionen «asamblea»
  3. titulares de noticias con «asamblea» + el nombre de la empresa
"""
from __future__ import annotations

import csv
import datetime as dt
import html
import json
import pathlib
import re
import time
import unicodedata
from urllib.parse import quote

from .common import Run, clean_text, fetch, select, upsert

ROOT = pathlib.Path(__file__).resolve().parent.parent
EMPRESAS = ROOT / "config" / "bvc_empresas.json"
MANUAL = ROOT / "data" / "asambleas.csv"
MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8,
         "septiembre": 9, "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12}
LEGAL = re.compile(r"\b(c\.?\s?a\.?|s\.?\s?a\.?|s\.?a\.?c\.?a\.?|saca|banco universal|compa[nñ][ií]a an[oó]nima)\b", re.I)
WP_SOURCES = [  # sitios WordPress: su API pública permite buscar publicaciones
    ("BVC", "https://www.bolsadecaracas.com/wp-json/wp/v2/posts?search={q}&per_page=30&_fields=date,link,title,content"),
    ("SUNAVAL", "https://www.sunaval.gob.ve/wp-json/wp/v2/posts?search={q}&per_page=30&_fields=date,link,title,content"),
]


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn").lower()


def companies() -> dict[str, dict]:
    """{símbolo: {'nombre', 'alias': [...]}} con los alias del archivo y, si faltan, el nombre que publica la BVC."""
    try:
        emp = json.loads(EMPRESAS.read_text(encoding="utf-8"))["empresas"]
    except Exception:  # noqa: BLE001
        emp = {}
    out = {}
    for s in select("bvc_symbols", {"select": "symbol,company,name", "market": "eq.RV"}):
        e = emp.get(s["symbol"], {})
        alias = list(e.get("alias") or [])
        if not alias:
            name = LEGAL.sub("", s.get("company") or "").strip(" ,.-")
            if len(name) >= 8 and len(name.split()) >= 2:
                alias.append(name.title())
        if alias:
            out[s["symbol"]] = {"nombre": e.get("nombre") or alias[0], "alias": alias}
    return out


def alias_rx(alias: list[str]) -> re.Pattern:
    return re.compile(r"\b(" + "|".join(re.escape(norm(a)) for a in alias) + r")\b")


def find_symbols(text: str, comp: dict[str, dict], rxs: dict[str, re.Pattern]) -> list[str]:
    t = norm(text)
    return sorted(s for s, rx in rxs.items() if rx.search(t))


# ---------------------------------------------------------------- fechas en texto
def dates_in(text: str) -> list[dt.date]:
    """Fechas escritas en el texto, en el orden en que aparecen («26 de noviembre de 2026», «26/11/2026»)."""
    t = norm(text)
    found: list[tuple[int, dt.date]] = []
    for mt in re.finditer(r"(\d{1,2})\s+de\s+(" + "|".join(MESES) + r")\s+(?:de|del)\s+(\d{4})", t):
        d, m, y = mt.groups()
        try:
            found.append((mt.start(), dt.date(int(y), MESES[m], int(d))))
        except ValueError:
            pass
    for mt in re.finditer(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{4})\b", t):
        d, m, y = mt.groups()
        try:
            found.append((mt.start(), dt.date(int(y), int(m), int(d))))
        except ValueError:
            pass
    return [d for _, d in sorted(found)]


def kind_of(text: str) -> str:
    t = norm(text)
    return "extraordinaria" if "extraordinaria" in t else "ordinaria" if "ordinaria" in t else "asamblea"


def assembly_from(text: str, published: dt.date | None) -> tuple[dt.date, str] | None:
    """Fecha y tipo de la asamblea convocada en un texto (la primera fecha posterior a la publicación)."""
    t = norm(text)
    i = t.find("asamblea")
    if i < 0:
        return None
    ds = dates_in(text[i:]) or dates_in(text)
    base = published or dt.date.today() - dt.timedelta(days=60)
    # la primera fecha que aparece después de «asamblea» y es posterior a la publicación
    ds = [d for d in ds if base < d <= base + dt.timedelta(days=200)]
    return (ds[0], kind_of(text)) if ds else None


# ---------------------------------------------------------------- noticias
def company_news(comp: dict[str, dict], rxs: dict[str, re.Pattern]) -> list[dict]:
    from .news import parse_feed
    items = []
    for sym, c in comp.items():
        q = " OR ".join(f'"{a}"' for a in c["alias"][:3])
        url = f"https://news.google.com/rss/search?q={quote(q + ' when:30d')}&hl=es-419&gl=VE&ceid=VE:es-419"
        try:
            got = parse_feed(fetch(url, timeout=30, retries=2).content, None, "es", False)
        except Exception:  # noqa: BLE001
            continue
        for it in got:
            it["title"] = re.sub(r"\s+-\s+[^-]{2,40}$", "", it["title"]).strip()
            syms = find_symbols(it["title"], comp, rxs)
            if sym not in syms:
                continue  # Google a veces trae notas que solo mencionan la empresa en el cuerpo
            it["symbols"] = syms
            it["category"] = "mercados" if it.get("category") in (None, "economia", "politica") else it["category"]
            items.append(it)
        time.sleep(1)
    by_url = {}
    for it in items:
        by_url.setdefault(it["url"], it)
    return list(by_url.values())


def tag_existing(comp, rxs) -> int:
    """Marca con `symbols` las noticias recientes que mencionan a una empresa listada."""
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=45)).isoformat()
    rows = select("news", {"select": "url,title,title_es,symbols", "published_at": f"gte.{since}"})
    upd = []
    for x in rows:
        syms = find_symbols(f"{x['title']} {x.get('title_es') or ''}", comp, rxs)
        if syms and sorted(x.get("symbols") or []) != syms:
            upd.append({"url": x["url"], "title": x["title"], "symbols": syms})
    return upsert("news", upd, "url") if upd else 0


# ---------------------------------------------------------------- asambleas
def manual_events() -> list[dict]:
    if not MANUAL.exists():
        return []
    out = []
    with MANUAL.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            sym = (row.get("simbolo") or "").strip().upper()
            fecha = (row.get("fecha") or "").strip()
            if not sym or not fecha:
                continue
            try:
                d = dt.date.fromisoformat(fecha) if "-" in fecha[:5] else dt.datetime.strptime(fecha, "%d/%m/%Y").date()
            except ValueError:
                continue
            kind = norm(row.get("tipo") or "ordinaria").strip() or "ordinaria"
            out.append({"id": f"{sym}:{d}:{kind}", "symbol": sym, "date": d.isoformat(), "kind": kind,
                        "title": (row.get("descripcion") or "").strip() or None, "url": (row.get("enlace") or "").strip() or None,
                        "source": "manual"})
    return out


def site_events(comp, rxs, r) -> list[dict]:
    out = []
    for name, tpl in WP_SOURCES:
        ok = False
        for q in ("asamblea", "convocatoria"):
            try:
                posts = fetch(tpl.format(q=q), timeout=30, retries=1).json()
                ok = True
            except Exception:  # noqa: BLE001
                continue
            for p in posts if isinstance(posts, list) else []:
                title = html.unescape(clean_text((p.get("title") or {}).get("rendered"), 300) or "")
                body = html.unescape(clean_text((p.get("content") or {}).get("rendered"), 6000) or "")
                pub = dt.date.fromisoformat(p["date"][:10]) if p.get("date") else None
                syms = find_symbols(f"{title} {body[:1500]}", comp, rxs)
                a = assembly_from(f"{title}. {body}", pub)
                if not syms or not a:
                    continue
                for s in syms:
                    out.append({"id": f"{s}:{a[0]}:{a[1]}", "symbol": s, "date": a[0].isoformat(), "kind": a[1],
                                "title": title[:300], "url": p.get("link"), "source": name})
        if not ok:
            r.log.info("%s: sin acceso a sus publicaciones (se usa el archivo manual y las noticias)", name)
    return out


def news_events(comp, rxs) -> list[dict]:
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=90)).isoformat()
    rows = select("news", {"select": "url,title,summary,source,published_at", "published_at": f"gte.{since}", "title": "ilike.*asamblea*"})
    out = []
    for x in rows:
        text = f"{x['title']}. {x.get('summary') or ''}"
        syms = find_symbols(text, comp, rxs)
        a = assembly_from(text, dt.date.fromisoformat(x["published_at"][:10]))
        for s in syms if a else []:
            out.append({"id": f"{s}:{a[0]}:{a[1]}", "symbol": s, "date": a[0].isoformat(), "kind": a[1],
                        "title": x["title"][:300], "url": x["url"], "source": x.get("source") or "Noticias"})
    return out


def run():
    with Run("emisores") as r:
        comp = companies()
        rxs = {s: alias_rx(c["alias"]) for s, c in comp.items()}
        try:
            items = company_news(comp, rxs)
            r.rows += upsert("news", items, "url")
            r.log.info("Noticias de emisores: %d", len(items))
        except Exception as e:  # noqa: BLE001
            r.note(f"Noticias por empresa: {str(e)[:150]}")
        try:
            r.rows += tag_existing(comp, rxs)
        except Exception as e:  # noqa: BLE001
            r.note(f"Etiquetado de noticias: {str(e)[:150]}")
        events: dict[str, dict] = {}
        for src in (news_events(comp, rxs), site_events(comp, rxs, r), manual_events()):  # lo manual gana
            for e in src:
                events[e["id"]] = e
        r.rows += upsert("bvc_events", list(events.values()), "id")
        r.log.info("Asambleas detectadas: %d", len(events))
