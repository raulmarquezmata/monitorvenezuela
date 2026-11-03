"""Sección «Informes»: los PDF que se suben a data/informes/ se publican solos.

Para cada PDF nuevo o modificado:
  - lee del propio archivo el título (texto más grande de la portada), la fecha, el idioma y un resumen;
  - le asigna un tema por palabras clave (petróleo, electricidad, minería, política, economía, finanzas…);
  - lo sube a Supabase Storage (depósito público «informes») con una miniatura de la portada;
  - lo registra en la tabla `informes`, que es lo que lee la web.
Si algún dato sale mal, se corrige en config/informes.json (gana sobre lo que se lee del PDF).
Si se borra un PDF de la carpeta, desaparece de la web.
"""
from __future__ import annotations

import datetime as dt
import hashlib
import io
import json
import pathlib
import re
import unicodedata

from .common import Run, delete, ensure_bucket, select, storage_upload, upsert

ROOT = pathlib.Path(__file__).resolve().parent.parent
FOLDER = ROOT / "data" / "informes"
FIXES = ROOT / "config" / "informes.json"
BUCKET = "informes"
TOPICS = [  # orden = prioridad cuando hay empate
    ("petroleo", r"petr[oó]le|pdvsa|crudo|barril|opep|opec|\boil\b|crude|hidrocarbur|refiner|chevron|faja|gas natural|upstream|\bbpd\b|barrels"),
    ("electricidad", r"electric|corpoelec|guri|megavatio|\bmw\b|apag[oó]n|blackout|generaci[oó]n el[eé]ctrica|power grid|hidroel[eé]ctric|termoel[eé]ctric"),
    ("mineria", r"miner[ií]a|minero|\boro\b|coltan|hierro|bauxita|arco minero|mining|\bgold\b|iron ore|minas"),
    ("politica", r"pol[ií]tic|elecci|sanci[oó]n|ofac|licencia general|gobierno|asamblea nacional|transici[oó]n|election|sanction|government|diplomac|negociaci"),
    ("finanzas", r"\bbanc[oa]s?\b|banca|bolsa de valores|\bbvc\b|acci[oó]n(es)?\b|renta fija|bonos?|deuda|\bembi\b|cartera|equity|stock market|banking|bonds?|debt"),
    ("economia", r"inflaci[oó]n|\bpib\b|tipo de cambio|d[oó]lar|bol[ií]var|monetari|fiscal|reservas|econom|inflation|gdp|exchange rate|monetary|dollariz"),
    ("agro", r"agr[ií]col|agro|cosecha|ma[ií]z|arroz|caf[eé]|cacao|ganad|alimentos|agricult"),
]
ES_WORDS = set("de la el que en los las del por para con una como sobre más pero sus entre fue también desde".split())
EN_WORDS = set("the of and to in is for that on with as by from this are was which be its has have".split())
MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8, "septiembre": 9,
         "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12, "january": 1, "february": 2, "march": 3, "april": 4,
         "may": 5, "june": 6, "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12}


def norm(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").lower()


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", norm(pathlib.Path(name).stem)).strip("-")
    return s[:90] or hashlib.sha1(name.encode()).hexdigest()[:10]


def guess_lang(text: str) -> str:
    w = re.findall(r"[a-záéíóúñ]+", text.lower())
    es, en = sum(x in ES_WORDS for x in w), sum(x in EN_WORDS for x in w)
    return "en" if en > es else "es"


def guess_topic(text: str) -> str:
    t = norm(text)
    scores = [(len(re.findall(rx, t)), -i, k) for i, (k, rx) in enumerate(TOPICS)]
    best = max(scores)
    return best[2] if best[0] > 0 else "economia"


def guess_date(name: str, text: str, meta: dict) -> str | None:
    m = re.search(r"(20\d{2})[-_.](\d{1,2})[-_.](\d{1,2})", name)
    if m:
        try:
            return dt.date(*map(int, m.groups())).isoformat()
        except ValueError:
            pass
    t = norm(text[:4000])
    found = []
    for mt in re.finditer(r"(\d{1,2})\s+(?:de\s+)?([a-z]+)\s+(?:de\s+|del\s+)?(20\d{2})|([a-z]+)\s+(\d{1,2}),?\s+(20\d{2})", t):
        g = mt.groups()
        d, mon, y = (g[0], g[1], g[2]) if g[0] else (g[4], g[3], g[5])
        if mon in MESES:
            try:
                x = dt.date(int(y), MESES[mon], int(d))
            except ValueError:
                continue
            if x <= dt.date.today():
                found.append(x)
    if found:  # en la portada suele estar la fecha de publicación: la más reciente
        return max(found).isoformat()
    m = re.search(r"(?:^|[^\d])(20\d{2})[-_ ](\d{2})(?:[^\d]|$)", name)
    if m and 1 <= int(m.group(2)) <= 12:
        return f"{m.group(1)}-{m.group(2)}-01"
    for mon, num in MESES.items():  # «Octubre 2026», «October 2026»
        m = re.search(rf"\b{mon}\s+(?:de\s+)?(20\d{{2}})\b", t)
        if m:
            return f"{m.group(1)}-{num:02d}-01"
    raw = (meta or {}).get("CreationDate") or ""
    m = re.search(r"(20\d{2})(\d{2})(\d{2})", str(raw))
    return f"{m.group(1)}-{m.group(2)}-{m.group(3)}" if m else None


def read_pdf(path: pathlib.Path) -> dict:
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        meta = pdf.metadata or {}
        pages = len(pdf.pages)
        p1 = pdf.pages[0]
        text = "\n".join((pg.extract_text() or "") for pg in pdf.pages[:3])
        first = p1.extract_text() or ""
        # título: la línea con letra más grande en la parte superior de la portada (sin cifras sueltas)
        title, after = "", ""
        lines = p1.extract_text_lines(return_chars=True) or []
        cand = []
        for i, ln in enumerate(lines):
            txt = ln["text"].strip()
            letters = re.sub(r"[^A-Za-zÁÉÍÓÚÑáéíóúñ]", "", txt)
            if ln["top"] > p1.height * 0.5 or len(letters) < 6 or len(txt.split()) < 2:
                continue
            size = max((c.get("size") or 0) for c in ln["chars"]) if ln.get("chars") else 0
            cand.append((size, -i, i))
        if cand:
            size, _, i = max(cand)
            parts, j = [lines[i]["text"].strip()], i + 1
            while j < len(lines) and lines[j].get("chars") and abs(max(c["size"] for c in lines[j]["chars"]) - size) < 0.6 and len(parts) < 3:
                parts.append(lines[j]["text"].strip())
                j += 1
            title = " ".join(parts)
            after = " ".join(ln["text"] for ln in lines[j:])
        if len(title) < 8:
            title = (meta.get("Title") or "").strip() or title
        thumb = None
        try:
            img = p1.to_image(resolution=40).original
            buf = io.BytesIO()
            img.convert("RGB").save(buf, format="JPEG", quality=78)
            thumb = buf.getvalue()
        except Exception:  # noqa: BLE001
            pass
    summary = re.sub(r"\s+", " ", after or text).strip()
    return {"title": re.sub(r"\s+", " ", title).strip()[:240], "text": text, "first": first, "summary": summary.strip()[:420],
            "pages": pages, "meta": meta, "thumb": thumb}


def load_fixes() -> dict:
    try:
        return json.loads(FIXES.read_text(encoding="utf-8")).get("informes", {})
    except Exception:  # noqa: BLE001
        return {}


def run():
    with Run("informes") as r:
        files = sorted(p for p in FOLDER.glob("**/*") if p.suffix.lower() == ".pdf") if FOLDER.exists() else []
        have = {x["id"]: x for x in select("informes", {"select": "id,sha,file"})}
        fixes = load_fixes()
        ensure_bucket(BUCKET)
        rows, seen = [], set()
        for p in files:
            rel = p.relative_to(FOLDER).as_posix()
            sid = slugify(rel)
            seen.add(sid)
            data = p.read_bytes()
            fx = fixes.get(rel) or fixes.get(p.name) or {}
            # la huella incluye las correcciones: si cambias config/informes.json se vuelve a publicar
            sha = hashlib.sha1(data + json.dumps(fx, sort_keys=True).encode()).hexdigest()
            if have.get(sid, {}).get("sha") == sha:
                continue
            try:
                info = read_pdf(p)
                url = storage_upload(BUCKET, f"pdf/{sid}.pdf", data, max_age=86400)
                thumb = storage_upload(BUCKET, f"portadas/{sid}.jpg", info["thumb"], "image/jpeg", 86400) if info["thumb"] else None
                text = f"{info['title']} {info['text']}"
                rows.append({
                    "id": sid, "file": rel, "sha": sha, "size": len(data), "pages": info["pages"], "url": url, "thumb_url": thumb,
                    "title": fx.get("titulo") or info["title"] or p.stem.replace("_", " "),
                    "date": fx.get("fecha") or guess_date(p.name, info["first"], info["meta"]),
                    "lang": fx.get("idioma") or guess_lang(info["text"]),
                    "topic": fx.get("tema") or guess_topic(text),
                    "summary": fx.get("resumen") or info["summary"] or None,
                    "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                })
            except Exception as e:  # noqa: BLE001
                r.note(f"{rel}: {str(e)[:120]}")
        r.rows = upsert("informes", rows, "id")
        gone = [k for k in have if k not in seen]
        if gone and files:  # nunca se borra todo por una carpeta vacía o un error de lectura
            delete("informes", {"id": f"in.({','.join(gone)})"})
        r.log.info("Informes: %d archivos, %d nuevos o actualizados, %d retirados", len(files), len(rows), len(gone) if files else 0)
