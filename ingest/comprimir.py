"""Compresión de los PDF del Research Desk en Storage → informes → subidos.

Los PDF exportados de Canva traen imágenes a resolución de imprenta y ocupan 2-4 MB cada uno; con Ghostscript
(calidad «ebook», 150 ppp) quedan en 0,4-0,8 MB y se ven igual en pantalla. Así el plan gratuito de Supabase
(1 GB de Storage) no se llena.

- Cada PDF se comprime una sola vez: la lista de los ya revisados queda en app_state («pdf_comprimidos»).
- Solo se reemplaza si el nuevo pesa menos del 80 % del original y tiene las mismas páginas.
- Los duplicados (mismo tamaño exacto) reciben el mismo archivo comprimido, para que el robot de informes los
  siga reconociendo como duplicados.
- Trabaja por tandas (máximo ~20 minutos por corrida): lo que falte se hace en la corrida siguiente.
"""
from __future__ import annotations

import json
import pathlib
import shutil
import subprocess
import tempfile
import time

from .common import Run, select, storage_upload, upsert
from .informes import BUCKET, storage_get, storage_list

MIN_BYTES = 900_000
RATIO = 0.80
MAX_SEG = 20 * 60


def paginas(data: bytes) -> int:
    import io
    import pdfplumber
    with pdfplumber.open(io.BytesIO(data)) as pdf:
        return len(pdf.pages)


def comprimir(data: bytes) -> bytes:
    with tempfile.TemporaryDirectory() as d:
        src, out = pathlib.Path(d) / "in.pdf", pathlib.Path(d) / "out.pdf"
        src.write_bytes(data)
        subprocess.run(["gs", "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER", "-sDEVICE=pdfwrite", "-dCompatibilityLevel=1.6",
                        "-dPDFSETTINGS=/ebook", "-dDetectDuplicateImages=true", "-dColorImageResolution=150",
                        "-dGrayImageResolution=150", f"-sOutputFile={out}", str(src)], check=True, timeout=300)
        return out.read_bytes()


def run():
    with Run("comprimir") as r:
        if not shutil.which("gs"):
            r.note("Ghostscript no está instalado en esta corrida: se comprime en la próxima")
            return
        st = select("app_state", {"select": "valor", "clave": "eq.pdf_comprimidos"})
        hechos: dict = json.loads(st[0]["valor"]) if st else {}
        files = storage_list() or []
        grupos: dict = {}
        for o in files:
            grupos.setdefault(o.get("size"), []).append(o)
        t0, antes, despues = time.time(), 0, 0
        for size, grupo in sorted(grupos.items(), key=lambda kv: -(kv[0] or 0)):
            if time.time() - t0 > MAX_SEG:
                r.log.info("Tiempo de la tanda agotado: sigue en la próxima corrida")
                break
            pend = [o for o in grupo if o["name"] not in hechos]
            if not pend or not size:
                continue
            if size < MIN_BYTES:
                for o in pend:
                    hechos[o["name"]] = size
                continue
            try:
                data = storage_get(grupo[0]["path"])
                nuevo = comprimir(data)
                if len(nuevo) < RATIO * len(data) and paginas(nuevo) == paginas(data):
                    for o in grupo:
                        storage_upload(BUCKET, o["path"], nuevo, max_age=86400)
                        hechos[o["name"]] = len(nuevo)
                    antes += len(data) * len(grupo)
                    despues += len(nuevo) * len(grupo)
                    r.rows += len(grupo)
                else:
                    for o in grupo:
                        hechos[o["name"]] = len(data)
            except Exception as e:  # noqa: BLE001
                r.note(f"{grupo[0]['name']}: {str(e)[:100]}")
            upsert("app_state", [{"clave": "pdf_comprimidos", "valor": json.dumps(hechos)}], "clave")
        upsert("app_state", [{"clave": "pdf_comprimidos", "valor": json.dumps(hechos)}], "clave")
        falta = sum(1 for o in files if o["name"] not in hechos)
        r.log.info("Comprimidos %d PDF: %.0f MB → %.0f MB; faltan %d", r.rows, antes / 1e6, despues / 1e6, falta)
