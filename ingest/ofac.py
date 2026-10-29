"""Acciones recientes de OFAC (Tesoro de EE.UU.) que mencionan a Venezuela."""
from __future__ import annotations

import datetime as dt
import re
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from .common import Run, fetch, upsert

PAGE = "https://ofac.treasury.gov/recent-actions"
KEYWORDS = re.compile(r"venezuel|pdvsa|citgo|maduro|minerven|\bbcv\b", re.I)


def parse(html: str) -> list[dict]:
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for a in soup.select("a[href*='/recent-actions/']"):
        href = a.get("href", "")
        m = re.search(r"/recent-actions/(\d{8})", href)
        if not m:
            continue
        title = " ".join(a.get_text(" ").split())
        # el título del enlace suele ser genérico; se toma el bloque contenedor completo
        block = a.find_parent(["div", "li", "article"]) or a
        text = " ".join(block.get_text(" ").split())
        if not KEYWORDS.search(text):
            continue
        d = dt.datetime.strptime(m.group(1), "%Y%m%d").date()
        out.append({"url": urljoin(PAGE, href), "date": d.isoformat(), "title": (title if len(title) > 25 else text)[:500]})
    return list({x["url"]: x for x in out}.values())


def run():
    with Run("ofac") as r:
        items = []
        for page in range(3):
            html = fetch(PAGE + (f"?page={page}" if page else ""), timeout=40).text
            items += parse(html)
        r.rows = upsert("ofac_actions", items, "url")
