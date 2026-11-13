"""Filtro v2 de noticias: cada titular recibe un puntaje y entra solo si supera el umbral.

Por qué: con listas de palabras sueltas se colaban noticias de otros países (bastaba la palabra «inversión»),
sucesos con una cifra en dólares y titulares de sección. Ahora cada decisión deja su motivo, y lo descartado
se guarda en la tabla news_rejects para revisarlo en la web (Noticias → Descartadas).

Pasos (en orden):
  1. Titular basura (sección, «Tema:», video, menos de 4 palabras)  → fuera.
  2. Fuente bloqueada (config/news_quality.json)                    → fuera.
  3. Ancla Venezuela: el titular nombra a Venezuela o algo propio del país (+3). En medios venezolanos,
     un titular sin otro país se toma como noticia local (+2). Intermedio: energía regional (Colombia,
     Guyana, Trinidad, Aruba, Curazao, Caribe) cuenta aunque no nombre a Venezuela (+2).
  4. Sin ancla y con otro país o un tema de Wall Street: si es de mercados va a «Mercados globales»; si no, fuera.
  5. Tema: económico (+2, +1 por cada término extra, máx. +4) o político permitido (+1). Ninguno → fuera.
  6. Restas: sucesos y crimen (−6), historias personales (−3), seguridad (−3), ruido (−4), tono (−3);
     las de sucesos, seguridad y ruido se reducen a −1 si el titular trae un tema económico fuerte.
  7. Calidad de la fuente: nivel 1 (+2), medio con RSS propio (+1), desconocido que llega por Google News (−1).
  Umbral: 3 puntos.
"""
from __future__ import annotations

import json
import pathlib
import re

QUALITY = pathlib.Path(__file__).resolve().parent.parent / "config" / "news_quality.json"
UMBRAL = 3

JUNK = re.compile(r"^(tema|temas|etiqueta|secci[oó]n|en vivo|minuto a minuto|galer[ií]a|fotos?|podcast|opini[oó]n|editorial)\s*[:|\-–]|"
                  r"^(econom[ií]a|pol[ií]tica|internacionales?|nacionales?|deportes|sucesos|mercados?|negocios)$|hor[oó]scopo", re.I)
# otros países, regiones y ciudades (si el titular no nombra a Venezuela, la noticia es de allá)
ABROAD = re.compile(r"\b(argentin|milei|chile|chilen|per[uú]\b|peruan|ecuador|bolivia|m[eé]xic|brasil|brasile|lula\b|colombia|petro\b|"
                    r"eeuu|ee\.\s?uu|estados unidos|washington|trump|wall street|eurozona|europa|uni[oó]n europea|\bbce\b|"
                    r"espa[nñ]a|francia|alemania|italia|reino unido|portugal|china|jap[oó]n|india|rusia|ucrania|turqu[ií]a|canad[aá]|"
                    r"panam[aá]|costa rica|dominicana|cuba|uruguay|paraguay|guatemala|honduras|nicaragua|el salvador|"
                    r"buenos aires|bogot[aá]|madrid|lima\b|ciudad de m[eé]xico|s[aã]o paulo|"
                    r"france|spain|germany|italy|united kingdom|britain|japan|russia|canada|europe|u\.s\.|united states)", re.I)
# noticias de mercados internacionales (van a su pestaña si no nombran a Venezuela)
GLOBAL_LEAD = re.compile(r"s&p\s?500|wall street|nasdaq|dow jones|goldman|jp\s?morgan|morgan stanley|\bfed\b|reserva federal|tesoro de ee|"
                         r"bonos del tesoro|bitcoin|cripto|\boro\b|\bgold\b|brent|\bwti\b|petr[oó]leo|crudo|\boil\b|bolsas? (de|europe|asi)|"
                         r"inflaci[oó]n|\bpib\b|econom[ií]a|tasas de inter[eé]s|d[oó]lar|euro\b|yen\b|mercados?", re.I)
# intermedio: energía regional que afecta a Venezuela aunque no la nombre
REGIONAL = re.compile(r"colombia|ecopetrol|guyana|exxon|staatsolie|surinam|trinidad|tobago|dragon gas|aruba|curazao|cura[cç]ao|caribe|petrocaribe|esequibo", re.I)
ENERGY = re.compile(r"petr[oó]le|crudo|\bgas\b|gasoduct|oleoduct|refiner|energ|el[eé]ctric|\boil\b|lng|bloque", re.I)
# temas propiamente venezolanos aunque el titular no diga «Venezuela»
VE_SPECIFIC = re.compile(r"\bbcv\b|seniat|sudeban|sunaval|\bbvc\b|bolpriaven|pdvsa|corpoelec|cantv|fedec[aá]maras|conindustria|consecomercio|"
                         r"venamcham|cavecol|bol[ií]var(es)?\b|ingreso (integral|m[ií]nimo)|bono de (guerra|fin de a)|patria\b|cashea|"
                         r"banesco|bancaribe|mercantil|provincial|\bbnc\b|banplus|delcy|cabello|maduro|machado|asamblea nacional|\btsj\b|"
                         r"caracas|maracaibo|zulia|carabobo|anzo[aá]tegui|monagas|bol[ií]var\b|guayana|orinoco|\bfaja\b|esequibo", re.I)
CRIME = re.compile(r"magnicidio|atentado|asesin|homicid|crimen|criminal|narco|sicari|secuestr|extorsi|lavado de|capturad|detenid|detien|arrest|"
                   r"tiroteo|balacera|fallec|muert|cad[aá]ver|v[ií]ctima|violaci|abuso|kidnap|murder|killed", re.I)
PERSONAL = re.compile(r"\(\d{1,2} a[nñ]os\)|\b\d{1,2} a[nñ]os,|cuenta c[oó]mo|su historia|lloraba|hallar a|paradero|desaparecid|"
                      r"de polic[ií]a (en|a)|emigr[oó]|migrante|reencuentro|conmovedor|viral|tiktok|influencer", re.I)
SECURITY = re.compile(r"seguridad|frontera|fronteriz|polic[ií]a|militar|fuerza armada|\bfanb\b|narcotr|contrabando|guerrilla|\beln\b", re.I)
# «acciones» como verbo/gestión (no como títulos valores)
NOT_SHARES = re.compile(r"acciones (de|para|conjuntas|contra|coordinadas)\s+(seguridad|coordinaci|frente|lucha|combat|prevenci|gobierno|protecci)|"
                        r"acciones (conjuntas|coordinadas|contra)", re.I)

_q: dict | None = None


def quality() -> dict:
    global _q
    if _q is None:
        try:
            _q = json.loads(QUALITY.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            _q = {}
    return _q


def _in(name: str, lst: list[str]) -> bool:
    n = (name or "").lower()
    return any(x.lower() in n for x in lst)


def evaluate(title: str, summary: str | None, source: str | None, *, ve_outlet: bool, aggregator: bool) -> dict:
    """Decide si un titular entra. Devuelve {ok, scope ('ve'|'global'), score, reason}."""
    from . import news as N  # reglas existentes (ruido, tono, tema); import aquí para evitar el ciclo
    t = re.sub(r"^\(?(video|videos|fotos?|en vivo)\)?\s*[:|\-–]?\s*", "", (title or "").strip(), flags=re.I)  # «(VIDEO) …» es noticia
    q = quality()
    if len(re.findall(r"\w+", t)) < 4 or JUNK.search(t):
        return {"ok": False, "scope": "ve", "score": 0, "reason": "titular de sección o sin contenido"}
    if _in(source or "", q.get("bloqueadas", [])):
        return {"ok": False, "scope": "ve", "score": 0, "reason": "fuente bloqueada"}

    score, why = 0, []
    t_econ = NOT_SHARES.sub(" ", t)
    anchor_title = bool(N.RELEVANT.search(t) or VE_SPECIFIC.search(t))
    abroad = bool(ABROAD.search(t))
    if anchor_title:
        score += 3; why.append("Venezuela en el titular +3")
    elif REGIONAL.search(t) and ENERGY.search(t):
        score += 2; why.append("energía regional +2")
    elif abroad or GLOBAL_LEAD.search(t) and re.search(r"s&p|wall street|nasdaq|dow|goldman|morgan|\bfed\b|reserva federal|bitcoin|tesoro de ee", t, re.I):
        if N.is_global_relevant(t) or GLOBAL_LEAD.search(t):
            return {"ok": True, "scope": "global", "score": 0, "reason": "otro país o Wall Street: a Mercados globales"}
        return {"ok": False, "scope": "ve", "score": 0, "reason": "otro país sin mención a Venezuela"}
    elif ve_outlet:
        score += 2; why.append("medio venezolano, tema local +2")
    elif summary and N.RELEVANT.search(summary):
        score += 1; why.append("Venezuela solo en el resumen +1")
    else:
        return {"ok": False, "scope": "ve", "score": 0, "reason": "sin mención a Venezuela"}

    econ = len({m.group(0).lower() for m in N.ECON.finditer(t_econ)})
    pol = bool(N.POL_OK.search(t))
    strong = bool(N.STRONG.search(t_econ))
    if econ:
        pts = min(4, 1 + econ); score += pts; why.append(f"tema económico +{pts}")
    elif pol:
        score += 1; why.append("política permitida +1")
    else:
        return {"ok": False, "scope": "ve", "score": score, "reason": "sin tema económico ni político permitido"}
    if N.categorize(f"{t} {summary or ''}") == "politica" and not pol and not N.ECON_POLICY.search(t):
        return {"ok": False, "scope": "ve", "score": score, "reason": "política sin medida económica"}

    for rx, pen, label, softens in ((CRIME, 6, "suceso o crimen", True), (PERSONAL, 3, "historia personal", False),
                                     (SECURITY, 3, "seguridad", True), (N.NOISE, 4, "ruido", True), (N.TONE, 3, "tono", False)):
        if rx.search(t):
            p = 1 if (softens and strong) else pen
            score -= p; why.append(f"{label} −{p}")

    if _in(source or "", q.get("nivel1", [])):
        score += 2; why.append("fuente de nivel 1 +2")
    elif not aggregator:
        score += 1; why.append("medio con RSS propio +1")
    elif not _in(source or "", q.get("conocidas", [])):
        score -= 1; why.append("fuente desconocida −1")

    ok = score >= UMBRAL
    return {"ok": ok, "scope": "ve", "score": score, "reason": ("; ".join(why) if ok else f"puntaje {score} < {UMBRAL}: " + "; ".join(why))}


def category(text: str) -> str:
    """Tema de la noticia, sin confundir «acciones de seguridad» con acciones de bolsa."""
    from . import news as N
    return N.categorize(NOT_SHARES.sub(" ", text))


# medios venezolanos (misma lista que lib/newsgroup.ts → VE_SOURCES, más algunos regionales)
VE_OUTLETS = ["Banca y Negocios", "Finanzas Digital", "Tal Cual", "El Estímulo", "Ecosistema", "Bitácora Económica", "Venevisión",
              "Efecto Cocuyo", "El Nacional", "Noticias Venevision", "El Universal", "Últimas Noticias", "Globovisión", "Descifrado",
              "Petroguía", "El Pitazo", "Runrunes", "2001", "Crónica Uno", "Prodavinci", "El Periodiquito", "Diario La Calle", "Unión Radio",
              "La Patilla", "Panorama", "El Carabobeño", "Notitarde", "Caracas Chronicles", "Aporrea", "VTV", "Radio America"]
