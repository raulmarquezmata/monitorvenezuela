"""Cifras a partir de reportes de prensa (WordPress REST de Banca y Negocios y Finanzas Digital).

Para datos que el BCV / SENIAT no publican en archivo estable, o como respaldo mientras se
calibra el Excel oficial. Cada punto queda con fuente "Prensa · <medio>".

- Intervención cambiaria: ventas semanales del BCV a la banca y asignaciones mensuales.
- Reservas internacionales (respaldo del Excel BCV).
- Recaudación SENIAT (Bs y US$).
- PIB trimestral (variación interanual anunciada por el BCV).
"""
from __future__ import annotations

import datetime as dt
import html
import re
from collections import defaultdict

from .common import Run, fetch, save_obs, select, ve_number

MONTHS = {m: i for i, m in enumerate(["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
                                       "septiembre", "octubre", "noviembre", "diciembre"], 1)}
MON3 = {"ene": 1, "feb": 2, "mar": 3, "abr": 4, "may": 5, "jun": 6, "jul": 7, "ago": 8, "sep": 9, "oct": 10, "nov": 11, "dic": 12}
AMOUNT = r"(?:US\$|USD|\$)\s?([\d.]+(?:,\d+)?)\s*millones"
CUMULATIVE = re.compile(r"acumulad|supera|en lo que va|primeros|durante 20\d\d|en total|suma|ha vendido|ha colocado|desde enero|"
                        r"al cierre de|en el año|anual|trimestre|semestre|ha inyectado|ha transado|mercado cambiario ha", re.I)


def es_num(s: str | None) -> float | None:
    """Número en formato español: '1.700' = 1700 · '5.574,10' = 5574.1 · '60' = 60."""
    if not s:
        return None
    s = s.strip()
    if "," in s:
        return ve_number(s)
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", s):
        return float(s.replace(".", ""))
    return ve_number(s)


def wp_posts(site: str, search: str, pages: int = 1, per_page: int = 50) -> list[dict]:
    out = []
    for p in range(1, pages + 1):
        try:
            r = fetch(f"https://{site}/wp-json/wp/v2/posts", params={
                "search": search, "per_page": per_page, "page": p, "orderby": "date", "order": "desc",
                "_fields": "date,link,slug,title,excerpt"}, timeout=40, retries=2)
        except Exception:  # noqa: BLE001  (página fuera de rango = fin)
            break
        batch = r.json()
        if not isinstance(batch, list) or not batch:
            break
        for b in batch:
            out.append({"date": b["date"][:10], "link": b["link"], "slug": b.get("slug", ""),
                        "title": html.unescape(re.sub(r"<[^>]+>", "", b["title"]["rendered"])),
                        "excerpt": html.unescape(re.sub(r"<[^>]+>", " ", (b.get("excerpt") or {}).get("rendered", "")))})
        if len(batch) < per_page:
            break
    return list({x["link"]: x for x in out}.values())


def google_posts(query: str) -> list[dict]:
    """Titulares de Google News (últimos 30 días) con el mismo formato que wp_posts: respaldo
    cuando un medio bloquea las consultas desde GitHub."""
    import feedparser
    from urllib.parse import quote
    url = f"https://news.google.com/rss/search?q={quote(query + ' when:30d')}&hl=es-419&gl=VE&ceid=VE:es-419"
    try:
        feed = feedparser.parse(fetch(url, timeout=30, retries=2).content)
    except Exception:  # noqa: BLE001
        return []
    out = []
    for e in feed.entries:
        tp = e.get("published_parsed")
        if not tp or not e.get("title"):
            continue
        title = re.sub(r"\s+-\s+[^-]{2,40}$", "", html.unescape(e["title"])).strip()
        out.append({"date": dt.date(tp.tm_year, tp.tm_mon, tp.tm_mday).isoformat(), "link": e.get("link", ""),
                    "slug": "", "title": title, "excerpt": ""})
    return out


def eom(y: int, m: int) -> str:
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return (nxt - dt.timedelta(days=1)).isoformat()


def month_in(text: str, pub: str) -> tuple[int, int] | None:
    """Mes mencionado en el texto; si es posterior a la publicación, se asume el año anterior."""
    t = text.lower()
    for name, m in MONTHS.items():
        if re.search(rf"\b{name}\b", t):
            y = int(pub[:4])
            if m > int(pub[5:7]) + 1:
                y -= 1
            return y, m
    return None


# ------------------------------------------------------------------ intervención cambiaria
def parse_intervention(posts: list[dict]) -> tuple[list, dict]:
    """Devuelve (operaciones [(fecha, monto)], asignaciones mensuales {(año, mes): monto})."""
    ops: dict[str, float] = {}
    monthly: dict[tuple, float] = {}
    cum: dict[tuple, float] = {}
    for p in posts:
        title = p["title"]
        if not re.search(r"intervenci[oó]n|vend[ií]|vende|inyect|coloc|subasta|asign", title, re.I):
            continue
        m = re.search(AMOUNT, title, re.I)
        if not m:
            continue
        amount = es_num(m.group(1))
        if not amount or amount > 5000:
            continue
        if re.search(r"(será|sera|asign\w*|monto mensual|en el mes)\b.*\b(en|de)\s+(" + "|".join(MONTHS) + r")", title, re.I) and not CUMULATIVE.search(title):
            ym = month_in(title, p["date"])
            if ym:
                monthly[ym] = amount
            continue
        acc = re.search(r"acumulado (?:mensual|del mes|en el mes)[^$]{0,20}" + AMOUNT, title, re.I)
        if acc:
            ym = (int(p["date"][:4]), int(p["date"][5:7]))
            cum[ym] = max(cum.get(ym, 0), es_num(acc.group(1)) or 0)
        if CUMULATIVE.search(title[: m.start()]):
            continue
        # fecha de la operación: etiqueta tipo "#24Feb" si existe; si no, la de publicación
        d = p["date"]
        tag = re.search(r"#(\d{1,2})([A-Za-z]{3})", title)
        if tag and tag.group(2).lower() in MON3:
            try:
                d = dt.date(int(p["date"][:4]), MON3[tag.group(2).lower()], int(tag.group(1))).isoformat()
            except ValueError:
                pass
        ops.setdefault(d, amount)
    for ym, v in cum.items():  # el acumulado del mes reportado por prensa, si supera lo sumado
        monthly.setdefault(("cum",) + ym, v)
    return sorted(ops.items()), monthly


def monthly_intervention(ops: list, monthly: dict) -> list:
    """Total por mes: asignación anunciada si existe; si no, el mayor entre la suma de operaciones y el acumulado reportado."""
    sums: dict[tuple, float] = defaultdict(float)
    for d, v in ops:
        sums[(int(d[:4]), int(d[5:7]))] += v
    alloc = {k: v for k, v in monthly.items() if k[0] != "cum"}
    cum = {k[1:]: v for k, v in monthly.items() if k[0] == "cum"}
    keys = set(sums) | set(alloc) | set(cum)
    return [(eom(y, m), alloc.get((y, m)) or max(sums.get((y, m), 0), cum.get((y, m), 0))) for (y, m) in sorted(keys)]


# ------------------------------------------------------------------ otros
def parse_reserves(posts: list[dict]) -> list:
    pts = []
    for p in posts:
        text = f"{p['title']} {p['excerpt']}"
        if not re.search(r"reservas internacionales", text, re.I) or re.search(r"oro|china|argentin|bolivia|colombia|per[uú]", p["title"], re.I):
            continue
        m = re.search(AMOUNT, text, re.I)
        v = es_num(m.group(1)) if m else None
        if not v or not 3000 < v < 40000:
            continue
        sd = re.search(r"(\d{2})-(\d{2})-(\d{4})", p["slug"])
        d = f"{sd.group(3)}-{sd.group(2)}-{sd.group(1)}" if sd else p["date"]
        pts.append((d, v))
    return pts


def parse_seniat(posts: list[dict]) -> tuple[list, list]:
    bs, usd = {}, {}
    for p in posts:
        text = f"{p['title']} {p['excerpt']}"
        if not re.search(r"seniat", text, re.I) or not re.search(r"recaud", text, re.I):
            continue
        ym = month_in(p["title"], p["date"]) or month_in(p["excerpt"][:200], p["date"])
        if not ym:
            continue
        d = eom(*ym)
        mb = re.search(r"Bs\.?\s?([\d.]+(?:,\d+)?)\s*millones", text)
        mu = re.search(AMOUNT, text, re.I)
        if mb and d not in bs:
            bs[d] = es_num(mb.group(1))
        if mu and d not in usd and (v := es_num(mu.group(1))) and v < 10000:
            usd[d] = v
    return sorted(bs.items()), sorted(usd.items())


QUARTERS = {"primer": 1, "segundo": 2, "tercer": 3, "cuarto": 4}


def parse_gdp(posts: list[dict]) -> list:
    pts = {}
    for p in posts:
        text = f"{p['title']} {p['excerpt']}"
        if not re.search(r"\bPIB\b|producto interno bruto|econom[ií]a (creció|crece)", text, re.I) or not re.search(r"\bBCV\b|banco central", text, re.I):
            continue
        q = re.search(r"(primer|segundo|tercer|cuarto) trimestre(?: de(?:l)? (20\d\d))?", text, re.I)
        g = re.search(r"(creci[oó]|crecimiento|expansi[oó]n|aument[oó]|subi[oó]|avanz[oó]|cay[oó]|contracci[oó]n)[^.%]{0,50}?(-?\d+(?:,\d+)?)\s?%", text, re.I)
        if not (q and g):
            continue
        y = int(q.group(2) or p["date"][:4])
        qn = QUARTERS[q.group(1).lower()]
        if not q.group(2) and qn * 3 > int(p["date"][5:7]) + 1:
            y -= 1
        v = es_num(g.group(2))
        if re.search(r"cay|contracci", g.group(1), re.I):
            v = -abs(v)
        pts.setdefault(eom(y, qn * 3), v)
    return sorted(pts.items())


def run(backfill: bool = False):
    with Run("press") as r:
        pages = 20 if backfill else 2
        # Intervención cambiaria
        try:
            posts = []
            for q in ("intervención cambiaria", "BCV vendió millones", "BCV inyecta millones", "BCV colocó millones"):
                posts += wp_posts("www.bancaynegocios.com", q, pages)
            for q in ("intervención cambiaria", "BCV inyecta millones"):
                posts += wp_posts("www.finanzasdigital.com", q, max(1, pages // 2))
            posts += google_posts("BCV intervención cambiaria millones")
            posts += google_posts("BCV inyecta millones banca")
            ops, monthly = parse_intervention(posts)
            r.rows += save_obs("intervencion_bcv", ops, "Prensa · Banca y Negocios")
            fixed = {x["date"] for x in select("observations", {"select": "date", "series_code": "eq.intervencion_bcv_mensual",
                                                                "source": "not.like.Prensa*"})}
            r.rows += save_obs("intervencion_bcv_mensual", [p for p in monthly_intervention(ops, monthly) if p[0] not in fixed],
                               "Prensa · Banca y Negocios")
            if not ops and not monthly:
                r.note("Intervención: sin cifras en titulares recientes")
        except Exception as e:  # noqa: BLE001
            r.note(f"Intervención: {e}")
        # SENIAT
        # PIB trimestral anunciado por el BCV (la prensa lo publica semanas antes de que salga el Excel)
        try:
            posts = wp_posts("www.finanzasdigital.com", "BCV PIB trimestre", pages) + wp_posts("www.bancaynegocios.com", "PIB trimestre BCV", pages)
            posts += google_posts("BCV PIB trimestre creció")
            official = {x["date"] for x in select("observations", {"select": "date", "series_code": "eq.pib_real_var", "source": "eq.BCV"})}
            r.rows += save_obs("pib_real_var", [p for p in parse_gdp(posts) if p[0] not in official], "BCV (anuncio, vía prensa)")
        except Exception as e:  # noqa: BLE001
            r.note(f"PIB: {e}")
        try:
            bs, usd = parse_seniat(wp_posts("www.finanzasdigital.com", "recaudación Seniat", pages))
            r.rows += save_obs("recaudacion_seniat", bs, "Prensa · Finanzas Digital")
            r.rows += save_obs("recaudacion_seniat_usd", usd, "Prensa · Finanzas Digital")
        except Exception as e:  # noqa: BLE001
            r.note(f"SENIAT: {e}")
