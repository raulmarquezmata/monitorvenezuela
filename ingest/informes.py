"""Sección «Informes»: los PDF del Research Desk se publican solos.

De dónde salen los PDF:
  - Supabase → Storage → depósito «informes» → carpeta «subidos» (la forma recomendada), o
  - data/informes/ del repositorio (archivos pequeños).

Para cada PDF nuevo o modificado:
  - título: el texto más grande de la portada (si se lee bien) o, si no, el nombre del archivo;
  - fecha de publicación: la que aparece en la portada («Octubre 2026», «14 de octubre de 2026», «III Trimestre…»)
    o en el nombre del archivo; si no aparece, queda sin fecha para completarla a mano;
  - idioma: (ESP)/(ENG) en el nombre o, si no, el texto; tema por palabras clave;
  - miniatura de la portada y registro en la tabla `informes`, que es lo que lee la web.
Duplicados (mismo archivo con otro nombre) se publican una sola vez.

Correcciones: config/informes.xlsx (columnas archivo, titulo, fecha, idioma, tema, publicar). El robot deja en
Storage → informes → revision → informes_revision.xlsx la lista completa con lo que detectó: se descarga,
se corrige y se sube a GitHub como config/informes.xlsx.
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
FIXES_JSON = ROOT / "config" / "informes.json"
FIXES_XLSX = ROOT / "config" / "informes.xlsx"
BUCKET = "informes"
VERSION = "v2"  # cambiarlo obliga a releer todos los PDF (nuevas reglas de título y fecha)
TOPICS = [  # orden = prioridad cuando hay empate
    ("petroleo", r"petr[oó]le|pdvsa|crudo|barril|opep|opec|\boil\b|crude|hidrocarbur|refiner|chevron|faja|gas natural|upstream|\bbpd\b|barrels"),
    ("electricidad", r"electric|corpoelec|guri|megavatio|\bmw\b|apag[oó]n|blackout|generaci[oó]n el[eé]ctrica|power grid|hidroel[eé]ctric|termoel[eé]ctric"),
    ("mineria", r"miner[ií]a|minero|\boro\b|coltan|hierro|bauxita|arco minero|mining|\bgold\b|iron ore|minas"),
    ("politica", r"pol[ií]tic|elecci|sanci[oó]n|ofac|licencia general|gobierno|asamblea nacional|transici[oó]n|election|sanction|government|diplomac|negociaci"),
    ("finanzas", r"\bbanc[oa]s?\b|banca|banking|bolsa de valores|\bbvc\b|acci[oó]n(?:es)?\b|renta fija|bonos?\b|deuda|\bembi\b|cartera|equity|stock market|bonds?\b|debt"),
    ("economia", r"inflaci[oó]n|\bpib\b|tipo de cambio|d[oó]lar|bol[ií]var|monetari|fiscal|reservas|econom|inflation|gdp|exchange rate|monetary|dollariz|trimestre|quarter"),
    ("agro", r"agr[ií]col|agro|cosecha|ma[ií]z|arroz|caf[eé]|cacao|ganad|alimentos|agricult"),
]
TOPIC_KEYS = {k for k, _ in TOPICS}
ES_WORDS = set("de la el que en los las del por para con una como sobre más pero sus entre fue también desde".split())
EN_WORDS = set("the of and to in is for that on with as by from this are was which be its has have".split())
MESES = {"enero": 1, "febrero": 2, "marzo": 3, "abril": 4, "mayo": 5, "junio": 6, "julio": 7, "agosto": 8, "septiembre": 9,
         "setiembre": 9, "octubre": 10, "noviembre": 11, "diciembre": 12, "january": 1, "february": 2, "march": 3, "april": 4,
         "may": 5, "june": 6, "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12}
MON_RX = "|".join(sorted(MESES, key=len, reverse=True))
ROMAN = {"i": 1, "ii": 2, "iii": 3, "iv": 4, "primer": 1, "segundo": 2, "tercer": 3, "cuarto": 4,
         "first": 1, "second": 2, "third": 3, "fourth": 4}


def norm(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn").lower()


def slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", norm(pathlib.Path(name).stem)).strip("-")
    return s[:90] or hashlib.sha1(name.encode()).hexdigest()[:10]


# ---------------------------------------------------------------- idioma, tema, título
def lang_from_name(name: str) -> str | None:
    n = norm(name)
    if re.search(r"[\(\[\s_-](eng|en|english|ingles)[\)\]\s_.-]", n + " "):
        return "en"
    if re.search(r"[\(\[\s_-](esp|es|espanol|spanish)[\)\]\s_.-]", n + " "):
        return "es"
    return None


def guess_lang(text: str) -> str:
    w = re.findall(r"[a-záéíóúñ]+", text.lower())
    es, en = sum(x in ES_WORDS for x in w), sum(x in EN_WORDS for x in w)
    return "en" if en > es else "es"


def guess_topic(text: str) -> str:
    t = norm(text)
    scores = [(len(re.findall(rx, t)), -i, k) for i, (k, rx) in enumerate(TOPICS)]
    best = max(scores)
    return best[2] if best[0] > 0 else "economia"


def name_title(name: str) -> str:
    """Título a partir del nombre del archivo: «Grupo Solfin - Analisis CANTV (ESP).pdf» → «Analisis CANTV»."""
    s = pathlib.Path(name).stem
    s = re.sub(r"\((no sali[oó]|esp|eng|es|en|1|2|3)\)|\bcopia de\b|\bcopy of\b|grupo sol\s?f[ií]n", " ", s, flags=re.I)
    s = re.sub(r"[_]+", " ", s)
    s = re.sub(r"\s*-\s*-+\s*|\s+-\s+", " - ", s)
    s = re.sub(r"\s+", " ", s).strip(" -–")
    return s


def nice(title: str) -> str:
    t = re.sub(r"(https?://|www\.)\S+", " ", title)
    t = re.sub(r"\s+", " ", t).strip(" -–·|")
    letters = re.sub(r"[^A-Za-zÁÉÍÓÚÑáéíóúñ]", "", t)
    if letters and letters.isupper() and len(letters) > 4:  # «BANKING SECTOR» → «Banking Sector»
        t = " ".join(w if len(w) <= 3 and w.isupper() and not w.isalpha() else w.capitalize() for w in t.lower().split())
    return t[:240]


def choose_title(cover: str, name: str) -> str:
    """La portada gana si se lee bien y coincide con el nombre del archivo; si no, el nombre del archivo."""
    nt = name_title(name)
    words = lambda s: {w for w in re.findall(r"[a-z]{4,}", norm(s))}  # noqa: E731
    if cover and len(cover) >= 8 and (words(cover) & words(nt) or not nt):
        return nice(cover)
    return nice(nt or cover)


# ---------------------------------------------------------------- fecha de publicación
def _ok(d: dt.date) -> bool:
    return dt.date(2015, 1, 1) <= d <= dt.date.today() + dt.timedelta(days=31)


def guess_date(name: str, cover: str) -> str | None:
    """Fecha de publicación según el nombre del archivo o la portada. None si no aparece."""
    m = re.search(r"(20\d{2})[-_. ](\d{1,2})[-_. ](\d{1,2})", name)
    if m:
        try:
            return dt.date(*map(int, m.groups())).isoformat()
        except ValueError:
            pass
    for src in (norm(cover[:3000]), norm(name)):
        c = re.sub(r"[\s\-_,.]+", "", src)  # «Febru ary 2026» → «february2026»
        full = []
        for mt in re.finditer(rf"(\d{{1,2}})(?:de)?({MON_RX})(?:de|del)?(20\d{{2}})", c):
            try:
                full.append(dt.date(int(mt.group(3)), MESES[mt.group(2)], int(mt.group(1))))
            except ValueError:
                pass
        for mt in re.finditer(rf"({MON_RX})(\d{{1,2}})(20\d{{2}})", c):
            try:
                full.append(dt.date(int(mt.group(3)), MESES[mt.group(1)], int(mt.group(2))))
            except ValueError:
                pass
        full = [d for d in full if _ok(d)]
        if full:
            return max(full).isoformat()
        months = [dt.date(int(mt.group(2)), MESES[mt.group(1)], 1) for mt in re.finditer(rf"({MON_RX})(?:de|del)?(20\d{{2}})", c)]
        months = [d for d in months if _ok(d)]
        if months:
            return max(months).isoformat()
        # «III Trimestre 2026», «Q3 2026», «third quarter 2026» → mes siguiente al cierre del trimestre
        q = re.search(r"\b(iv|iii|ii|i|primer|segundo|tercer|cuarto|first|second|third|fourth)\s+(?:trimestre|quarter)\b.{0,60}?(20\d{2})", src) \
            or re.search(r"\bq([1-4])\s*(20\d{2})", src)
        if q:
            n = int(q.group(1)) if q.group(1).isdigit() else ROMAN[q.group(1)]
            y = int(q.group(2)) + (1 if n == 4 else 0)
            d = dt.date(y, 1 if n == 4 else n * 3 + 1, 1)
            if _ok(d):
                return d.isoformat()
    m = re.search(r"(20\d{2})[-_ ](0[1-9]|1[0-2])(?:[^\d]|$)", name)
    return f"{m.group(1)}-{m.group(2)}-01" if m else None


# ---------------------------------------------------------------- lectura del PDF
def clean_summary(s: str) -> str | None:
    s = re.sub(r"(https?://|www\.)\S+", " ", s or "")
    s = re.sub(r"\s+", " ", s).strip(" -–·|")
    return s[:420] if len(re.sub(r"[^A-Za-zÁÉÍÓÚÑáéíóúñ]", "", s)) >= 40 else None


def read_pdf(path: pathlib.Path) -> dict:
    import pdfplumber
    with pdfplumber.open(path) as pdf:
        pages = len(pdf.pages)
        p1 = pdf.pages[0].dedupe_chars()  # Canva repite el texto en capas: sin esto salen letras mezcladas
        text = "\n".join((pg.dedupe_chars().extract_text() or "") for pg in pdf.pages[:3])
        first = p1.extract_text(x_tolerance=2) or ""
        title, after = "", ""
        lines = p1.extract_text_lines(return_chars=True, x_tolerance=2) or []
        cand = []
        for i, ln in enumerate(lines):
            txt = ln["text"].strip()
            letters = re.sub(r"[^A-Za-zÁÉÍÓÚÑáéíóúñ]", "", txt)
            if len(letters) < 6 or len(txt.split()) < 2 or re.search(r"www\.|https?://|@", txt):
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
            # «Banking Sector» + «February 2026» en la línea siguiente → «Banking Sector · February 2026»
            if j < len(lines):
                nxt = lines[j]["text"].strip()
                if len(nxt) <= 30 and re.search(rf"({MON_RX})\s*(de\s+)?20\d{{2}}", re.sub(r"(?<=[a-z]) (?=[a-z])", "", norm(nxt))) \
                        and not re.search(r"20\d{2}", title):
                    title += " · " + nxt
                    j += 1
            after = " ".join(ln["text"] for ln in lines[j:])
        thumb = None
        try:
            img = pdf.pages[0].to_image(resolution=110).original.convert("RGB")
            if img.width > 720:  # nítida en pantallas retina sin pesar demasiado (~60 KB)
                img = img.resize((720, int(img.height * 720 / img.width)))
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=80, optimize=True)
            thumb = buf.getvalue()
        except Exception:  # noqa: BLE001
            pass
    return {"cover": title, "text": text, "first": first, "summary": clean_summary(after or text), "pages": pages, "thumb": thumb}


# ---------------------------------------------------------------- correcciones
def _date_cell(v) -> str | None:
    if v in (None, ""):
        return None
    if isinstance(v, (dt.datetime, dt.date)):
        return (v.date() if isinstance(v, dt.datetime) else v).isoformat()
    s = str(v).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m", "%m/%Y"):
        try:
            return dt.datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return guess_date(s, s)


def load_fixes() -> dict:
    """{nombre de archivo: {titulo, fecha, idioma, tema, publicar}} desde config/informes.xlsx (y el .json viejo)."""
    out: dict = {}
    try:
        out.update(json.loads(FIXES_JSON.read_text(encoding="utf-8")).get("informes", {}))
    except Exception:  # noqa: BLE001
        pass
    if FIXES_XLSX.exists():
        try:
            import openpyxl
            ws = openpyxl.load_workbook(FIXES_XLSX, data_only=True).active
            rows = list(ws.iter_rows(values_only=True))
            head = [norm(str(h or "")).strip() for h in rows[0]]
            for r in rows[1:]:
                rec = dict(zip(head, r))
                name = str(rec.get("archivo") or "").strip()
                if not name:
                    continue
                fx = {}
                if rec.get("titulo"):
                    fx["titulo"] = str(rec["titulo"]).strip()
                if _date_cell(rec.get("fecha")):
                    fx["fecha"] = _date_cell(rec.get("fecha"))
                if str(rec.get("idioma") or "").strip().lower()[:2] in ("es", "en"):
                    fx["idioma"] = str(rec["idioma"]).strip().lower()[:2]
                if norm(str(rec.get("tema") or "")).strip() in TOPIC_KEYS:
                    fx["tema"] = norm(str(rec["tema"])).strip()
                if norm(str(rec.get("publicar") or "")).strip() in ("no", "n", "0", "false"):
                    fx["publicar"] = "no"
                out[name] = fx
        except Exception:  # noqa: BLE001
            pass
    return out


# ---------------------------------------------------------------- Supabase Storage
def storage_list(prefix: str = "subidos/") -> list[dict] | None:
    """PDF subidos a mano al depósito «informes» (carpeta subidos/) desde el panel de Supabase."""
    from .common import DRY_RUN, SUPABASE_KEY, SUPABASE_URL
    import requests
    if DRY_RUN:
        return []
    h = {"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"}
    out, off = [], 0
    while True:
        r = requests.post(f"{SUPABASE_URL}/storage/v1/object/list/{BUCKET}", headers=h, timeout=60,
                          json={"prefix": prefix, "limit": 1000, "offset": off, "sortBy": {"column": "name", "order": "asc"}})
        if r.status_code >= 300:
            return None
        page = r.json()
        for o in page:
            if o.get("id") and o["name"].lower().endswith(".pdf"):  # las carpetas no tienen id
                out.append({"path": prefix + o["name"], "name": o["name"], "updated": o.get("updated_at") or "",
                            "size": (o.get("metadata") or {}).get("size")})
        if len(page) < 1000:
            return out
        off += 1000


def storage_get(path: str) -> bytes:
    from .common import SUPABASE_KEY, SUPABASE_URL
    import requests
    from urllib.parse import quote
    r = requests.get(f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{quote(path)}", timeout=180,
                     headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"})
    r.raise_for_status()
    return r.content


def dup_rank(name: str) -> tuple:
    """Entre copias del mismo archivo se queda el de nombre más limpio."""
    n = norm(name)
    return (bool(re.search(r"\(\d\)|copia|copy|-\d+\.pdf$", n)), len(n), n)


def revision_xlsx(rows: list[dict], skipped: list[dict]) -> bytes:
    import openpyxl
    from openpyxl.styles import Font, PatternFill
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Informes"
    head = ["archivo", "titulo", "fecha", "idioma", "tema", "publicar", "paginas", "nota", "enlace"]
    ws.append(head)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1C2541")
    yellow = PatternFill("solid", fgColor="FFF2B3")
    for x in sorted(rows, key=lambda r: (r.get("date") or "0000", r["file"]), reverse=True):
        ws.append([x["file"], x["title"], x.get("date"), x.get("lang"), x.get("topic"), "si", x.get("pages"),
                   "" if x.get("date") else "Falta la fecha: complétala (AAAA-MM-DD o solo AAAA-MM)", x.get("url")])
        if not x.get("date"):
            for c in ws[ws.max_row]:
                c.fill = yellow
    for s in skipped:
        ws.append([s["file"], "", "", "", "", "no", "", s["nota"], ""])
    for col, w in zip("ABCDEFGHI", (48, 60, 12, 8, 13, 9, 8, 46, 40)):
        ws.column_dimensions[col].width = w
    ws.freeze_panes = "B2"
    ayuda = wb.create_sheet("Cómo usar")
    for line in ["Corrige lo que haga falta en la hoja «Informes» (no cambies la columna «archivo»).",
                 "fecha: AAAA-MM-DD (o AAAA-MM si solo sabes el mes). idioma: es o en.",
                 "tema: petroleo, electricidad, mineria, politica, economia, finanzas o agro.",
                 "publicar: no = no sale en la página.",
                 "Guarda el archivo como informes.xlsx y súbelo a la carpeta config/ del repositorio en GitHub.",
                 "El robot aplica los cambios solo en unos minutos."]:
        ayuda.append([line])
    ayuda.column_dimensions["A"].width = 110
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ---------------------------------------------------------------- corrida
def run():
    import tempfile
    from urllib.parse import quote
    from .common import SUPABASE_URL
    with Run("informes") as r:
        ensure_bucket(BUCKET)
        have = {x["id"]: x for x in select("informes", {"select": "*"})}
        fixes = load_fixes()
        # (identificador, nombre, ruta, tamaño, huella rápida, cómo leerlo, URL pública si ya está en Supabase)
        items = []
        files = sorted(p for p in FOLDER.glob("**/*") if p.suffix.lower() == ".pdf") if FOLDER.exists() else []
        for p in files:
            rel = p.relative_to(FOLDER).as_posix()
            items.append({"id": slugify(rel), "name": p.name, "rel": rel, "size": p.stat().st_size, "quick": None,
                          "load": p.read_bytes, "public": None})
        listed = storage_list()
        if listed is None:
            r.note("No se pudo listar la carpeta «subidos» del depósito «informes» en Supabase")
        for o in listed or []:
            items.append({"id": slugify(o["name"]), "name": o["name"], "rel": o["name"], "size": o.get("size"),
                          "quick": f"{o['updated']}:{o['size']}", "load": (lambda path=o["path"]: storage_get(path)),
                          "public": f"{SUPABASE_URL}/storage/v1/object/public/{BUCKET}/{quote(o['path'])}"})
        # duplicados: el mismo archivo (mismo tamaño exacto) subido con otro nombre
        by_size: dict = {}
        for it in items:
            if it["size"]:
                by_size.setdefault(it["size"], []).append(it)
        skipped, keep, seen = [], [], set()
        for it in items:
            group = by_size.get(it["size"]) or [it]
            best = min(group, key=lambda x: dup_rank(x["name"]))
            if it is not best:
                skipped.append({"file": it["rel"], "nota": f"Duplicado de «{best['rel']}»: no se publica"})
                continue
            if it["id"] in seen:
                continue
            fx = fixes.get(it["rel"]) or fixes.get(it["name"]) or {}
            if fx.get("publicar") == "no":
                skipped.append({"file": it["rel"], "nota": "Marcado publicar = no"})
                continue
            seen.add(it["id"])
            it["fx"] = fx
            keep.append(it)
        rows, done = [], []
        for it in keep:
            fx = it["fx"]
            fxh = VERSION + json.dumps(fx, sort_keys=True)
            if it["quick"] is not None:  # en Supabase: huella = fecha + tamaño, sin descargar el archivo
                sha = hashlib.sha1((it["quick"] + fxh).encode()).hexdigest()
                if have.get(it["id"], {}).get("sha") == sha:
                    done.append(have[it["id"]])
                    continue
            try:
                data = it["load"]()
                if it["quick"] is None:  # en el repositorio: la huella incluye el contenido
                    sha = hashlib.sha1(data + fxh.encode()).hexdigest()
                    if have.get(it["id"], {}).get("sha") == sha:
                        done.append(have[it["id"]])
                        continue
                with tempfile.NamedTemporaryFile(suffix=".pdf") as tmp:
                    tmp.write(data)
                    tmp.flush()
                    info = read_pdf(pathlib.Path(tmp.name))
                url = it["public"] or storage_upload(BUCKET, f"pdf/{it['id']}.pdf", data, max_age=86400)
                thumb = storage_upload(BUCKET, f"portadas/{it['id']}.jpg", info["thumb"], "image/jpeg", 3600) if info["thumb"] else None
                title = fx.get("titulo") or choose_title(info["cover"], it["name"])
                row = {
                    "id": it["id"], "file": it["rel"], "sha": sha, "size": len(data), "pages": info["pages"], "url": url,
                    "thumb_url": (thumb + f"?v={sha[:8]}") if thumb else None, "title": title,
                    "date": fx.get("fecha") or guess_date(it["name"], info["first"]),
                    "lang": fx.get("idioma") or lang_from_name(it["name"]) or guess_lang(info["text"]),
                    "topic": fx.get("tema") or guess_topic(f"{title} {title} {info['text']}"),
                    "summary": info["summary"],
                    "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                }
                rows.append(row)
                done.append(row)
                if len(rows) >= 20:  # se guarda por tandas: si la corrida se corta, lo hecho queda
                    r.rows += upsert("informes", rows, "id")
                    rows = []
            except Exception as e:  # noqa: BLE001
                r.note(f"{it['rel']}: {str(e)[:120]}")
                if it["id"] in have:
                    done.append(have[it["id"]])
        r.rows += upsert("informes", rows, "id")
        gone = [k for k in have if k not in seen]
        if gone and seen and listed is not None:  # nunca se borra todo por una carpeta vacía o un error de lectura
            for i in range(0, len(gone), 50):
                delete("informes", {"id": f"in.({','.join(gone[i:i + 50])})"})
        try:
            storage_upload(BUCKET, "revision/informes_revision.xlsx", revision_xlsx(done, skipped),
                           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 60)
        except Exception as e:  # noqa: BLE001
            r.log.info("Planilla de revisión: %s", e)
        sin_fecha = sum(1 for x in done if not x.get("date"))
        r.log.info("Informes: %d publicados, %d duplicados u ocultos, %d retirados, %d sin fecha",
                   len(done), len(skipped), len(gone) if (seen and listed is not None) else 0, sin_fecha)
