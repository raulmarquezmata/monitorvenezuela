"""Informe PDF de cada acción de la BVC (formato Solfín Research: precio en Bs. y en US$).

Se genera al cierre de cada día con los datos ya cargados (cotizaciones BVC + tipo de cambio oficial y
paralelo) y se sube a Supabase Storage (depósito público «reportes»), en español y en inglés:
    reportes/acciones/RST_es.pdf   reportes/acciones/RST_en.pdf
La ficha de cada acción en la web enlaza esos archivos.
"""
from __future__ import annotations

import base64
import datetime as dt
import io
import json
import pathlib
import re

from .common import Run, ensure_bucket, select, storage_upload

BUCKET = "reportes"
EMPRESAS = pathlib.Path(__file__).resolve().parent.parent / "config" / "bvc_empresas.json"
# paleta del manual de marca Grupo Solfin: azul principal #004AA1, azul noche #121A30, acentos #0D407D / #1C7DE0, grises
NAVY, BLUE, ACC, LIGHT, GRID = "#121a30", "#004aa1", "#1c7de0", "#f2f2f2", "#dbdbe0"
GOLD = ACC                     # (nombre antiguo) acento de los indicadores
GREEN, PAR, RED = BLUE, "#d9822b", "#d9822b"  # US$ oficial = azul de marca; mercado alternativo = ámbar (contraste)
ASSETS = pathlib.Path(__file__).resolve().parent / "assets"


def logo(variant: str = "blanco") -> str:
    """Logo de Grupo Solfin (SVG del manual) como imagen embebida."""
    try:
        return "data:image/svg+xml;base64," + base64.b64encode((ASSETS / f"solfin-logo-{variant}.svg").read_bytes()).decode()
    except Exception:  # noqa: BLE001
        return ""
MES = {"es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
       "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]}
MES_LARGO = {"es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
             "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]}

T = {
    "es": dict(
        title="{name} ({sym}) — Precio en Bs. y en US$",
        sub="Serie diaria completa: {d0} al {d1}. Precio de cierre de la acción {cls} en bolívares y su conversión a dólares (Bs. del día ÷ tipo de cambio del día, oficial y mercado alternativo).",
        ind="INDICADORES {y} ({a} → {b})", val="VALORACIÓN DE MERCADO (US$ ALTERNATIVO)", par_note="Alternativo Bs. {r}/US$ · {d}",
        shares="Acciones", close="Cierre Bs.", usd_sh="US$ / acc.", val_mm="Valor US$ MM", total="Total",
        at_off="A tasa oficial BCV (Bs. {r}): US$ {v} MM.", price="PRECIO ACTUAL (BS.)", last_close="{d} · último cierre SIBE",
        nominal="RENDIMIENTO NOMINAL (BS.)", r_of="RENDIMIENTO EN US$ OFICIAL", r_par="RENDIMIENTO EN US$ ALTERNATIVO",
        hilo_bs="MÁX / MÍN EN BS.", hilo_us="MÁX / MÍN EN US$ (OF.)", hilo_d="máx {a} · mín {b}",
        ch1="Precio de {sym} — Bs. y US$ en una sola vista",
        ch1_sub="Eje izquierdo: precio nominal en bolívares. Eje derecho: precio convertido a dólares. La divergencia entre ambos ejes es el efecto de la devaluación. Las líneas verticales marcan el nivel de mayo 2025 y el último dato disponible.",
        l_bs="Precio Bs.", l_bs2="(eje izq.)", l_of="US$ oficial", l_par="US$ alternativo", l_right="(eje der.)",
        may="Mayo 2025", lastd="Último dato ({d})", of_s="oficial", par_s="alternativo",
        ch2="Tipo de cambio (Bs./US$)", ch2_sub="Oficial y mercado alternativo utilizados para la conversión.", l_ofx="Oficial", l_parx="Alternativo",
        cls_common="común", cls_a="Clase A", cls_b="Clase B", about="LA EMPRESA", kicker="RADAR · INFORME DE ACCIÓN",
        src=("Fuente: Bolsa de Valores de Caracas (cierres diarios SIBE{syms}) y tipo de cambio del Radar Grupo Solfin: tasa oficial BCV "
             "y referencia del mercado alternativo (P2P). Días sin dato de tipo de cambio: se usa el último disponible. Valoración: acciones en circulación "
             "(BVC) × último cierre ÷ tipo de cambio del mercado alternativo. Metodología: precio en US$ = precio en Bs. del día ÷ tipo de cambio del día. "
             "Informe generado automáticamente el {now} — no constituye recomendación de inversión."),
    ),
    "en": dict(
        title="{name} ({sym}) — Price in Bs. and US$",
        sub="Full daily series: {d0} to {d1}. Closing price of the {cls} share in bolivars and its conversion to dollars (Bs. of the day ÷ exchange rate of the day, official and alternative market).",
        ind="{y} INDICATORS ({a} → {b})", val="MARKET VALUE (US$ ALTERNATIVE)", par_note="Alternative Bs. {r}/US$ · {d}",
        shares="Shares", close="Close Bs.", usd_sh="US$ / sh.", val_mm="Value US$ MM", total="Total",
        at_off="At the BCV official rate (Bs. {r}): US$ {v} MM.", price="LAST PRICE (BS.)", last_close="{d} · last SIBE close",
        nominal="NOMINAL RETURN (BS.)", r_of="RETURN IN US$ (OFFICIAL)", r_par="RETURN IN US$ (ALTERNATIVE)",
        hilo_bs="HIGH / LOW IN BS.", hilo_us="HIGH / LOW IN US$ (OFF.)", hilo_d="high {a} · low {b}",
        ch1="{sym} price — Bs. and US$ in one view",
        ch1_sub="Left axis: nominal price in bolivars. Right axis: price converted to dollars. The gap between both axes is the effect of devaluation. Vertical lines mark the May 2025 level and the latest data point.",
        l_bs="Price Bs.", l_bs2="(left axis)", l_of="US$ official", l_par="US$ alternative", l_right="(right axis)",
        may="May 2025", lastd="Latest ({d})", of_s="official", par_s="alternative",
        ch2="Exchange rate (Bs./US$)", ch2_sub="Official and alternative-market rates used for the conversion.", l_ofx="Official", l_parx="Alternative",
        cls_common="common", cls_a="Class A", cls_b="Class B", about="THE COMPANY", kicker="RADAR · STOCK REPORT",
        src=("Source: Caracas Stock Exchange (daily SIBE closes{syms}) and Radar Grupo Solfin exchange rates: BCV official rate and the "
             "alternative-market (P2P) reference. Days without an exchange-rate print use the latest available. Valuation: shares outstanding (BVC) × "
             "last close ÷ alternative-market rate. Methodology: US$ price = Bs. price of the day ÷ exchange rate of the day. "
             "Report generated automatically on {now} — not investment advice."),
    ),
}


# ---------------------------------------------------------------- formato
def num(v: float | None, dec: int = 2, lang: str = "es") -> str:
    if v is None:
        return "—"
    s = f"{v:,.{dec}f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".") if lang == "es" else s


def sgn(v: float | None, lang: str) -> str:
    return "—" if v is None else ("+" if v > 0 else "") + num(v, 1, lang) + "%"


def dshort(d: str, lang: str) -> str:
    x = dt.date.fromisoformat(d)
    return f"{x.day:02d}-{MES[lang][x.month - 1]}-{str(x.year)[2:]}"


def dlong(d: str, lang: str) -> str:
    x = dt.date.fromisoformat(d)
    return f"{x.day} de {MES_LARGO['es'][x.month - 1]} de {x.year}" if lang == "es" else f"{MES_LARGO['en'][x.month - 1]} {x.day}, {x.year}"


def ffill(dates: list[str], fx: list[tuple[str, float]]) -> list[float | None]:
    """Tipo de cambio vigente en cada fecha (último dato ≤ fecha)."""
    out, j, cur = [], 0, None
    for d in dates:
        while j < len(fx) and fx[j][0] <= d:
            cur = fx[j][1]
            j += 1
        out.append(cur)
    return out


def class_label(sym: str, t: dict, multi: bool = False) -> str:
    """RST y RST.B → Clase A y Clase B; una sola clase → común."""
    if sym.endswith(".B"):
        return t["cls_b"]
    if sym.endswith(".A") or multi:
        return t["cls_a"]
    return t["cls_common"]


# ---------------------------------------------------------------- gráficos (matplotlib → SVG)
def _svg(fig) -> str:
    """El gráfico va como imagen PNG de alta resolución: se ve igual en cualquier computadora
    (como SVG, el tamaño de las letras dependía de las fuentes instaladas en el robot)."""
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=220, bbox_inches="tight", pad_inches=0.02, facecolor="white")
    import matplotlib.pyplot as plt
    plt.close(fig)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def _setup():
    import logging
    logging.getLogger("matplotlib.font_manager").setLevel(logging.ERROR)
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib import font_manager
    for f in FONTS.glob("*.ttf"):
        try:
            font_manager.fontManager.addfont(str(f))
        except Exception:  # noqa: BLE001
            pass
    plt.rcParams.update({"font.family": ["Lato", "Carlito", "DejaVu Sans"], "font.size": 7, "axes.edgecolor": GRID,
                         "axes.linewidth": 0.6, "xtick.color": "#666", "ytick.color": "#666", "svg.fonttype": "path"})
    return plt


def _xticks(ax, dates, lang, n=9):
    import numpy as np
    idx = np.linspace(0, len(dates) - 1, min(n, len(dates))).astype(int)
    ax.set_xticks(idx)
    ax.set_xticklabels([dshort(dates[i], lang) for i in idx], fontsize=6)
    ax.set_xlim(-len(dates) * 0.01, len(dates) - 1 + len(dates) * 0.01)


def _yfmt(lang, dec):
    from matplotlib.ticker import FuncFormatter
    return FuncFormatter(lambda v, _: num(v, dec, lang))


def chart_price(dates, bs, of, par, lang, t, may_i, sym) -> str:
    plt = _setup()
    import numpy as np
    fig, ax = plt.subplots(figsize=(7.4, 2.45))
    x = np.arange(len(dates))
    ax.plot(x, bs, color=NAVY, lw=1.4)
    ax2 = ax.twinx()
    ofa = np.array([np.nan if v is None else v for v in of], dtype=float)
    pa = np.array([np.nan if v is None else v for v in par], dtype=float)
    ax2.plot(x, ofa, color=GREEN, lw=1.3)
    ax2.plot(x, pa, color=PAR, lw=1.2, ls=(0, (4, 2)))
    top = max(bs) * 1.06
    rtop = np.nanmax(np.concatenate([ofa, pa])) * 1.06
    ax.set_ylim(0, top)
    ax2.set_ylim(0, rtop)
    for a, ticks, dec in ((ax, np.linspace(0, top, 6), 0), (ax2, np.linspace(0, rtop, 6), 2)):
        a.set_yticks(ticks)
        a.yaxis.set_major_formatter(_yfmt(lang, dec))
        a.tick_params(length=0, labelsize=6)
        for s in a.spines.values():
            s.set_visible(False)
    ax.grid(axis="y", color=GRID, lw=0.6)
    _xticks(ax, dates, lang)
    last = len(dates) - 1

    def box(i, title, ha):
        lines = [f"Bs. {num(bs[i], 2, lang)}", f"US$ {num(of[i], 3, lang)} {t['of_s']}", f"US$ {num(par[i], 3, lang)} {t['par_s']}"]
        ax.axvline(i, color="#888", lw=0.7, ls=(0, (3, 3)))
        ax.plot([i], [bs[i]], "o", ms=4, mfc="white", mec=NAVY, mew=1.2)
        if of[i] is not None:
            ax2.plot([i], [of[i]], "o", ms=4, mfc="white", mec=GREEN, mew=1.2)
        if par[i] is not None:
            ax2.plot([i], [par[i]], "o", ms=4, mfc="white", mec=PAR, mew=1.2)
        txt = title + "\n" + "\n".join(f"— {l}" for l in lines)
        xo = i + (len(dates) * 0.02 if ha == "left" else -len(dates) * 0.035)
        # en el eje derecho (se dibuja encima de todas las líneas) pero con coordenadas del izquierdo
        ax2.text(xo, top * 0.97, txt, ha=ha, va="top", fontsize=5.6, color="#222", linespacing=1.5, zorder=10,
                 transform=ax.transData, bbox=dict(boxstyle="round,pad=0.5", fc="white", ec="#d5d8e0", lw=0.6, alpha=0.95))

    if may_i is not None and 0 < may_i < last - len(dates) * 0.15:
        box(may_i, t["may"], "left")
    box(last, t["lastd"].format(d=dshort(dates[last], lang)), "right")
    return _svg(fig)


def chart_fx(dates, of, par, lang) -> str:
    plt = _setup()
    import numpy as np
    fig, ax = plt.subplots(figsize=(7.4, 1.55))
    x = np.arange(len(dates))
    ofa = np.array([np.nan if v is None else v for v in of], dtype=float)
    pa = np.array([np.nan if v is None else v for v in par], dtype=float)
    ax.plot(x, ofa, color=BLUE, lw=1.3)
    ax.plot(x, pa, color=RED, lw=1.2, ls=(0, (4, 2)))
    lo = np.nanmin(np.concatenate([ofa, pa]))
    hi = np.nanmax(np.concatenate([ofa, pa]))
    ax.set_yticks(np.linspace(lo, hi, 6))
    ax.yaxis.set_major_formatter(_yfmt(lang, 0))
    ax.tick_params(length=0, labelsize=6)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.grid(axis="y", color=GRID, lw=0.6)
    _xticks(ax, dates, lang)
    return _svg(fig)


# ---------------------------------------------------------------- HTML
FONTS = ASSETS / "fonts"  # Lato va dentro del repositorio: el PDF se ve igual aunque el robot no tenga la fuente instalada
FONT_FACE = "".join(f"@font-face {{ font-family: Lato; src: url('file://{FONTS / f}'); font-weight: {w}; font-style: {st}; }}\n"
                    for f, w, st in (("Lato-Regular.ttf", 400, "normal"), ("Lato-Bold.ttf", 700, "normal"), ("Lato-Italic.ttf", 400, "italic")))
CSS = FONT_FACE + """
@page { size: A4; margin: 11mm 11mm 10mm 11mm; }
* { box-sizing: border-box; }
body { font-family: Lato, Carlito, 'DejaVu Sans', sans-serif; color: #1f2333; font-size: 8pt; margin: 0; }
.hero { background: %(blue)s; color: #fff; border-radius: 6px; padding: 12px 16px 12px; border-bottom: 3px solid %(navy)s; }
.top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.top img { height: 22px; }
.brand { color: #cfe0f5; font-size: 6.4pt; font-weight: 700; letter-spacing: 1.4px; }
.about { background: %(light)s; border-left: 3px solid %(blue)s; border-radius: 4px; padding: 6px 10px; margin-top: 7px; font-size: 7.4pt; line-height: 1.45; color: #2a3247; }
.about b { font-size: 6.2pt; letter-spacing: .6px; color: %(blue)s; margin-right: 6px; }
.hero h1 { font-size: 15.5pt; margin: 4px 0 4px; font-weight: 700; }
.hero p { margin: 0; font-size: 7.6pt; color: #e3ecf8; line-height: 1.4; }
.sec { font-size: 7pt; font-weight: 700; letter-spacing: .6px; color: %(blue)s; margin: 9px 0 5px; }
.val { background: %(navy)s; color: #fff; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; margin-bottom: 7px; }
.val .k { font-size: 6.4pt; letter-spacing: .6px; color: #c9cfdf; font-weight: 700; }
.val .big { color: #7fb6f0; font-size: 20pt; font-weight: 700; margin: 6px 0 2px; }
.val .s { font-size: 6.6pt; color: #c9cfdf; }
.val table { border-collapse: collapse; font-size: 6.6pt; color: #e8ebf3; align-self: flex-start; }
.val th { font-weight: 400; color: #c9cfdf; text-align: right; padding: 1px 0 2px 14px; }
.val td { text-align: right; padding: 1px 0 1px 14px; }
.val td:first-child, .val th:first-child { text-align: left; padding-left: 0; }
.val tr.tot td { border-top: 0.6px solid #8b93ab; font-weight: 700; padding-top: 2px; }
.val .foot { font-size: 6pt; color: #aab2c7; text-align: right; margin-top: 4px; }
.grid { display: flex; flex-wrap: wrap; justify-content: space-between; }
.kpi { width: 49.2%%; border: 0.6px solid #dfe2ea; border-top: 2.2px solid %(gold)s; border-radius: 5px; padding: 6px 10px 6px; margin-bottom: 5px; }
.kpi .k { font-size: 6.2pt; letter-spacing: .5px; color: #555; font-weight: 700; }
.kpi .v { font-size: 13pt; font-weight: 700; margin: 2px 0 1px; color: %(navy)s; }
.kpi .m { font-size: 6.3pt; color: #777; }
.card { border: 0.6px solid #dfe2ea; border-radius: 6px; padding: 8px 12px 6px; margin-top: 6px; }
.card h2 { font-size: 10.5pt; margin: 0 0 2px; }
.card .d { font-size: 6.6pt; color: #666; margin: 0 0 4px; line-height: 1.4; }
.leg { font-size: 6.8pt; margin-bottom: 2px; }
.leg span { margin-right: 14px; }
.leg i { display: inline-block; width: 14px; height: 0; border-top: 2.2px solid; vertical-align: middle; margin-right: 4px; }
.leg i.dash { border-top-style: dashed; }
.card img { width: 100%%; }
.src { font-size: 5.9pt; color: #666; margin-top: 7px; line-height: 1.45; }
""" % {"navy": NAVY, "gold": BLUE, "blue": BLUE, "light": LIGHT}


def build_html(info: dict, lang: str) -> str:
    t = T[lang]
    sym, dates, bs, of, par = info["symbol"], info["dates"], info["bs"], info["of"], info["par"]
    last = len(dates) - 1
    year = dates[last][:4]
    i0 = next(i for i, d in enumerate(dates) if d[:4] == year)
    ys = range(i0, last + 1)

    def ret(arr):
        return None if arr[i0] in (None, 0) or arr[last] is None else (arr[last] / arr[i0] - 1) * 100

    def hilo(arr):
        vals = [(arr[i], i) for i in ys if arr[i] is not None]
        return max(vals), min(vals)

    (hb, hbi), (lb, lbi) = hilo(bs)
    (hu, hui), (lu, lui) = hilo(of)
    may_i = next((i for i, d in enumerate(dates) if d >= "2025-05-01"), None)
    a, b = dshort(dates[i0], lang).upper(), dshort(dates[last], lang).upper()
    a, b = a[:-3], b[:-3]  # «5-ENE → 14-OCT» (sin año)
    a, b = a.lstrip("0"), b.lstrip("0")
    kpis = [
        (t["price"], f"Bs. {num(bs[last], 2, lang)}", t["last_close"].format(d=dshort(dates[last], lang))),
        (t["nominal"], sgn(ret(bs), lang), f"{dshort(dates[i0], lang)} → {dshort(dates[last], lang)}"),
        (t["r_of"], sgn(ret(of), lang), f"US$ {num(of[i0], 3, lang)} → US$ {num(of[last], 3, lang)}"),
        (t["r_par"], sgn(ret(par), lang), f"US$ {num(par[i0], 3, lang)} → US$ {num(par[last], 3, lang)}"),
        (t["hilo_bs"], f"Bs. {num(hb, 0, lang)} / {num(lb, 0, lang)}", t["hilo_d"].format(a=dshort(dates[hbi], lang), b=dshort(dates[lbi], lang))),
        (t["hilo_us"], f"US$ {num(hu, 2, lang)} / {num(lu, 2, lang)}", t["hilo_d"].format(a=dshort(dates[hui], lang), b=dshort(dates[lui], lang))),
    ]
    val = ""
    classes = [c for c in info.get("classes", []) if c.get("shares") and c.get("close")]
    rate_par, rate_of = info["par_rate"], info["of_rate"]
    multi = len(info.get("classes", [])) > 1
    if classes and rate_par:
        rows, tot_sh, tot_v, tot_of = "", 0.0, 0.0, 0.0
        for c in classes:
            v = c["shares"] * c["close"] / rate_par / 1e6
            tot_sh += c["shares"]
            tot_v += v
            tot_of += c["shares"] * c["close"] / rate_of / 1e6 if rate_of else 0
            rows += (f"<tr><td>{c['symbol']} ({class_label(c['symbol'], t, multi)})</td><td>{num(c['shares'], 0, lang)}</td><td>{num(c['close'], 2, lang)}</td>"
                     f"<td>{num(c['close'] / rate_par, 3, lang)}</td><td>{num(v, 1, lang)}</td></tr>")
        if len(classes) > 1:
            rows += f"<tr class='tot'><td>{t['total']}</td><td>{num(tot_sh, 0, lang)}</td><td></td><td></td><td>{num(tot_v, 1, lang)}</td></tr>"
        val = f"""<div class="val"><div><div class="k">{t['val']}</div><div class="big">US$ {num(tot_v, 1, lang)} MM</div>
<div class="s">{t['par_note'].format(r=num(rate_par, 0 if rate_par > 100 else 2, lang), d=dshort(info['fx_date'], lang))}</div></div>
<div><table><tr><th></th><th>{t['shares']}</th><th>{t['close']}</th><th>{t['usd_sh']}</th><th>{t['val_mm']}</th></tr>{rows}</table>
{f"<div class='foot'>{t['at_off'].format(r=num(rate_of, 2, lang), v=num(tot_of, 1, lang))}</div>" if rate_of else ""}</div></div>"""
    kp = "".join(f"<div class='kpi'><div class='k'>{k}</div><div class='v'>{v}</div><div class='m'>{m}</div></div>" for k, v, m in kpis)
    c1 = chart_price(dates, bs, of, par, lang, t, may_i, sym)
    c2 = chart_fx(dates, info["of_raw"], info["par_raw"], lang)
    syms = ", ".join(c["symbol"] for c in info.get("classes", [])) or sym
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4)))
    src = t["src"].format(syms=f" · {syms}", now=f"{dshort(now.date().isoformat(), lang)} {now:%H:%M} VET")
    if info.get("splits"):
        from .splits import label
        evs = "; ".join(f"{label(e, lang)} {'el' if lang == 'es' else 'on'} {dshort(e['date'], lang)}" for e in info["splits"])
        src = (f"<b>Serie ajustada por cambios en el capital ({evs}): los precios anteriores se expresan en las acciones actuales.</b> " if lang == "es"
               else f"<b>Series adjusted for capital changes ({evs}): earlier prices are expressed in today's shares.</b> ") + src
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="hero"><div class="top"><img src="{logo()}"><div class="brand">{t['kicker']}</div></div><h1>{t['title'].format(name=info['name'], sym=sym)}</h1>
<p>{t['sub'].format(d0=dlong(dates[0], lang), d1=dlong(dates[last], lang), cls=class_label(sym, t, multi))}</p></div>
{f"<div class='about'><b>{t['about']}</b>{info['desc']}</div>" if info.get('desc') else ""}
<div class="sec">{t['ind'].format(y=year, a=a, b=b)}</div>
{val}<div class="grid">{kp}</div>
<div class="card"><h2>{t['ch1'].format(sym=sym)}</h2><p class="d">{t['ch1_sub']}</p>
<div class="leg"><span><i style="border-color:{NAVY}"></i><b>{t['l_bs']}</b> {t['l_bs2']}</span><span><i style="border-color:{GREEN}"></i><b>{t['l_of']}</b> {t['l_right']}</span><span><i class="dash" style="border-color:{PAR}"></i><b>{t['l_par']}</b> {t['l_right']}</span></div>
<img src="{c1}"></div>
<div class="card"><h2>{t['ch2']}</h2><p class="d">{t['ch2_sub']}</p>
<div class="leg"><span><i style="border-color:{BLUE}"></i><b>{t['l_ofx']}</b></span><span><i class="dash" style="border-color:{RED}"></i><b>{t['l_parx']}</b></span></div>
<img src="{c2}"></div>
<div class="src">{src}</div>
</body></html>"""


def prepare(sym: str, quotes: list[dict], fx_of: list, fx_par: list, meta: dict, classes: list[dict], name: str, start: str = "2025-01-01") -> dict | None:
    q = [(x["date"], x["close"]) for x in quotes if x.get("close") and x["date"] >= start]
    if len(q) < 10:
        return None
    dates = [d for d, _ in q]
    bs = [v for _, v in q]
    of_raw, par_raw = ffill(dates, fx_of), ffill(dates, fx_par)
    of = [None if r in (None, 0) else v / r for v, r in zip(bs, of_raw)]
    par = [None if r in (None, 0) else v / r for v, r in zip(bs, par_raw)]
    if of[0] is None or par[-1] is None:  # sin tipo de cambio al inicio: se recorta la serie
        k = next((i for i in range(len(dates)) if of[i] is not None and par[i] is not None), None)
        if k is None:
            return None
        dates, bs, of, par, of_raw, par_raw = dates[k:], bs[k:], of[k:], par[k:], of_raw[k:], par_raw[k:]
    return {"symbol": sym, "name": name, "dates": dates, "bs": bs, "of": of, "par": par, "of_raw": of_raw, "par_raw": par_raw,
            "par_rate": fx_par[-1][1] if fx_par else None, "of_rate": fx_of[-1][1] if fx_of else None,
            "fx_date": fx_par[-1][0] if fx_par else dates[-1], "classes": classes}


def render_pdf(html: str) -> bytes:
    from weasyprint import HTML
    return HTML(string=html).write_pdf()


def company_names() -> dict:
    try:
        return {k: v for k, v in json.loads(EMPRESAS.read_text(encoding="utf-8"))["empresas"].items()}
    except Exception:  # noqa: BLE001
        return {}


ACENTOS = {"FABRICA": "Fábrica", "CERAMICA": "Cerámica", "ELECTRICA": "Eléctrica", "ELECTRICIDAD": "Electricidad", "COMPAÑIA": "Compañía", "COMPANIA": "Compañía",
           "CORPORACION": "Corporación", "INVERSION": "Inversión", "INVERSIONES": "Inversiones", "QUIMICO": "Químico", "QUIMICA": "Química", "PETROLEO": "Petróleo",
           "TELEFONOS": "Teléfonos", "NACIONAL": "Nacional", "CREDITO": "Crédito", "AGRICOLA": "Agrícola", "INDUSTRIAS": "Industrias", "DOMINGUEZ": "Domínguez",
           "CIA": "Cía", "PAPEL": "Papel", "FINANCIERA": "Financiera", "ECONOMICO": "Económico", "TECNICA": "Técnica", "MINERIA": "Minería", "MAQUINARIA": "Maquinaria", "SIDERURGICA": "Siderúrgica", "TURISTICA": "Turística", "AEREA": "Aérea", "COMUNICACION": "Comunicación", "PRODUCCION": "Producción", "PUBLICO": "Público", "RAPIDO": "Rápido"}
MENORES = {"de", "del", "la", "las", "el", "los", "y", "e", "en", "para", "por", "a"}
SIGLAS = {"BBVA", "CANTV", "EFE", "BVC", "BNC", "FVI", "SIBE", "BOD", "BFC", "II", "III"}
LEGAL = re.compile(r"(^|\s|,)(C\.?\s?A\.?|S\.?\s?A\.?(\s?C\.?\s?A\.?)?|S\.?\s?A\.?\s?I\.?\s?C\.?\s?A\.?|S\.?\s?A\.?\s?C\.?\s?A\.?\s?S\.?\s?A\.?\s?I\.?\s?C\.?\s?A\.?)(?=\s|,|$)", re.I)


# abreviaturas que la BVC publica ya en minúsculas (misma lista que lib/names.ts)
NAME_FIXES = [(r'\bInm\.\s?val\.?\s?"?a"?', "Inmuebles y Valores"), (r"\bBco\.\s?univ\.?", "Banco Universal"), (r"^C\.\s?a\.\s?", ""), (r"\(sivensa\)", "(SIVENSA)")]


def pretty_name(name: str) -> str:
    """Nombre legible del emisor, con las abreviaturas de la BVC corregidas."""
    n = _pretty_name(name)
    for rx, t in NAME_FIXES:
        n = re.sub(rx, t, n, flags=re.I)
    n = re.sub(r"\s+", " ", n).strip()
    return n[:1].upper() + n[1:]


def _pretty_name(name: str) -> str:
    """«C.A. FABRICA NACIONAL DE VIDRIO» → «Fábrica Nacional de Vidrio»: sin forma jurídica y con mayúsculas normales."""
    n = LEGAL.sub(" ", name or "").replace(",", " ").strip()
    n = re.sub(r"\s+", " ", n)
    if not n or not (n.isupper() or n.islower()):
        return n or name
    out = []
    for i, w in enumerate(n.split(" ")):
        up = w.upper()
        if up.strip("()") in SIGLAS or (w.startswith("(") and len(w.strip("()")) <= 6):  # (CANTV), (MANPA)
            out.append(up)
        elif up in SIGLAS:
            out.append(up)
        elif up in ACENTOS:
            out.append(ACENTOS[up])
        elif i and w.lower() in MENORES:
            out.append(w.lower())
        else:
            out.append(w[:1].upper() + w[1:].lower())
    return " ".join(out)


def describe(emp: dict, sym: str, siblings: list[str], lang: str) -> str | None:
    """Descripción corta de la empresa (config/bvc_empresas.json), buscando también por sus otras clases."""
    for k in [sym, *siblings, sym.split(".")[0]]:
        e = emp.get(k) or {}
        if e.get(lang):
            return e[lang]
    return None


def run(only: list[str] | None = None):
    with Run("reportes") as r:
        ensure_bucket(BUCKET)
        since = (dt.date.today() - dt.timedelta(days=120)).isoformat()
        syms = select("bvc_symbols", {"select": "symbol,name,company,shares_outstanding", "market": "eq.RV"})
        recent = {x["symbol"] for x in select("bvc_quotes", {"select": "symbol", "market": "eq.RV", "date": f"gte.{since}"})}
        fx = {c: [(x["date"], x["value"]) for x in select("observations", {"select": "date,value", "series_code": f"eq.{c}", "date": "gte.2024-12-01", "order": "date"})]
              for c in ("usd_bcv", "usd_paralelo", "ibc")}
        emp = company_names()
        by_company: dict[str, list[dict]] = {}
        for s in syms:
            by_company.setdefault((s.get("company") or s["symbol"]).strip().upper(), []).append(s)
        n = 0
        for s in syms:
            sym = s["symbol"]
            if sym not in recent or (only and sym not in only):
                continue
            try:
                quotes = select("bvc_quotes", {"select": "date,close", "symbol": f"eq.{sym}", "market": "eq.RV", "date": "gte.2025-01-01", "order": "date"})
                # splits / reverse splits: toda la serie en el capital accionario actual
                from . import splits
                prices = [(q["date"], q["close"]) for q in quotes if q.get("close")]
                evs = splits.events(sym, prices, fx["ibc"])
                quotes = [{"date": d, "close": v} for d, v in splits.adjust(prices, evs)]
                sib = by_company.get((s.get("company") or sym).strip().upper(), [s])
                classes = []
                for c in sorted(sib, key=lambda x: x["symbol"]):
                    last = select("bvc_quotes", {"select": "close", "symbol": f"eq.{c['symbol']}", "close": "gt.0", "order": "date.desc", "limit": 1})
                    classes.append({"symbol": c["symbol"], "shares": c.get("shares_outstanding"), "close": last[0]["close"] if last else None})
                name = (emp.get(sym) or {}).get("nombre") or pretty_name(s.get("company") or s.get("name") or sym)
                info = prepare(sym, quotes, fx["usd_bcv"], fx["usd_paralelo"], s, classes, name)
                if not info:
                    continue
                info["splits"] = evs
                info["desc"] = {lg: describe(emp, sym, [c["symbol"] for c in classes], lg) for lg in ("es", "en")}
                for lang in ("es", "en"):
                    storage_upload(BUCKET, f"acciones/{sym}_{lang}.pdf", render_pdf(build_html({**info, "desc": info["desc"][lang]}, lang)))
                n += 1
            except Exception as e:  # noqa: BLE001
                r.note(f"{sym}: {str(e)[:120]}")
        try:
            mk = mktcap_data(fx)
            if mk:
                for lang in ("es", "en"):
                    storage_upload(BUCKET, f"mercado/mktcap_{lang}.pdf", render_pdf(build_mktcap_html(mk, lang)))
                n += 1
        except Exception as e:  # noqa: BLE001
            r.note(f"mktcap: {str(e)[:160]}")
        r.rows = n
        r.log.info("Informes por acción generados: %d", n)


# ---------------------------------------------------------------- informe de capitalización (toda la renta variable)
TM = {
    "es": dict(kicker="RADAR · CAPITALIZACIÓN BVC", title="Capitalización bursátil de la Bolsa de Valores de Caracas",
               sub="Renta variable, sesión del {d}. Ordenado de mayor a menor capitalización en US$ al mercado alternativo.",
               k1="TOTAL · US$ ALTERNATIVO", k2="TOTAL · US$ OFICIAL BCV", k3="TOTAL · BOLÍVARES", k4="EMPRESAS",
               mm="MM", rate="Bs. {r}/US$", top="Peso de cada empresa en la capitalización total", multi="Clases sumadas", nodata="s/d = sin acciones en circulación publicadas", rank="Ranking completo",
               h=["#", "Símbolo", "Emisor", "Precio<br>Bs.", "Precio<br>US$ alt.", "Acciones en<br>circulación", "Cap. alternativo<br>US$ MM", "Cap. oficial<br>US$ MM", "Peso"],
               total="Total", src="Fuente: Bolsa de Valores de Caracas (acciones en circulación y último cierre SIBE) y tipo de cambio del Radar Grupo Solfin: "
               "mercado alternativo Bs. {par}/US$ y oficial BCV Bs. {of}/US$ al {fd}. Capitalización = acciones en circulación × último cierre ÷ tipo de cambio. "
               "Informe generado automáticamente el {now} — no constituye recomendación de inversión."),
    "en": dict(kicker="RADAR · BVC MARKET CAP", title="Market capitalization of the Caracas Stock Exchange",
               sub="Equities, session of {d}. Sorted by market cap in US$ at the alternative-market rate.",
               k1="TOTAL · US$ ALTERNATIVE", k2="TOTAL · US$ BCV OFFICIAL", k3="TOTAL · BOLIVARS", k4="COMPANIES",
               mm="MM", rate="Bs. {r}/US$", top="Weight of each company in total market cap", multi="Classes combined", nodata="n/a = shares outstanding not published", rank="Full ranking",
               h=["#", "Symbol", "Issuer", "Price<br>Bs.", "Price<br>US$ alt.", "Shares<br>outstanding", "Cap. alternative<br>US$ MM", "Cap. official<br>US$ MM", "Weight"],
               total="Total", src="Source: Caracas Stock Exchange (shares outstanding and last SIBE close) and Radar Grupo Solfin exchange rates: "
               "alternative market Bs. {par}/US$ and BCV official Bs. {of}/US$ as of {fd}. Market cap = shares outstanding × last close ÷ exchange rate. "
               "Report generated automatically on {now} — not investment advice."),
}


def mktcap_data(fx: dict) -> dict | None:
    """Todas las empresas de renta variable; las clases de una misma compañía (A/B) se suman en una sola fila."""
    if not fx.get("usd_paralelo") or not fx.get("usd_bcv"):
        return None
    par, of = fx["usd_paralelo"][-1], fx["usd_bcv"][-1]
    syms = select("bvc_symbols", {"select": "symbol,name,company,shares_outstanding", "market": "eq.RV"})
    latest = {x["symbol"]: x for x in select("bvc_latest", {"select": "date,symbol,close,shares_outstanding,market_cap_bs", "market": "eq.RV"})}
    emp = company_names()
    groups: dict[str, dict] = {}
    for s_ in syms:
        sym = s_["symbol"]
        lt = latest.get(sym) or {}
        close, date = lt.get("close"), lt.get("date")
        if not close:  # sin cotización en la última sesión: último cierre disponible
            q = select("bvc_quotes", {"select": "date,close", "symbol": f"eq.{sym}", "close": "gt.0", "order": "date.desc", "limit": 1})
            close, date = (q[0]["close"], q[0]["date"]) if q else (None, None)
        sh = lt.get("shares_outstanding") or s_.get("shares_outstanding")
        cap = close * sh if close and sh else None
        key = (s_.get("company") or sym).strip().upper()
        g = groups.setdefault(key, {"classes": [], "cap": 0.0, "shares": 0.0, "date": None, "nombre": None})
        g["classes"].append({"symbol": sym, "close": close, "shares": sh, "cap": cap, "date": date})
        g["cap"] += cap or 0
        g["shares"] += sh or 0
        g["date"] = max(filter(None, [g["date"], date]), default=None)
        g["nombre"] = g["nombre"] or (emp.get(sym) or {}).get("nombre") or pretty_name(s_.get("company") or s_.get("name") or sym)
    rows = [g for g in groups.values() if any(c["close"] for c in g["classes"])]
    if not rows:
        return None
    for g in rows:
        g["classes"].sort(key=lambda c: c["symbol"])
        g["symbol"] = " / ".join(c["symbol"] for c in g["classes"])
    tot = sum(g["cap"] for g in rows)
    for g in rows:
        g["w"] = g["cap"] / tot * 100 if tot and g["cap"] else None
    rows.sort(key=lambda g: -(g["cap"] or 0))
    dates = [g["date"] for g in rows if g["date"]]
    return {"rows": rows, "tot": tot, "par": par, "of": of, "date": max(dates)}


def chart_top(rows: list[dict], lang: str) -> str:
    """Barras horizontales con el peso de cada empresa en la capitalización total (todas)."""
    plt = _setup()
    data = [g for g in rows if g["w"]][::-1]
    fig, ax = plt.subplots(figsize=(7.4, max(2.0, 0.16 * len(data) + 0.3)))
    ax.barh([g["nombre"][:34] for g in data], [g["w"] for g in data], color=BLUE, height=0.64)
    for i, g in enumerate(data):
        ax.text(g["w"] + 0.3, i, f"{num(g['w'], 1, lang)}%", va="center", fontsize=5.6, color=NAVY)
    ax.tick_params(length=0, labelsize=5.8)
    ax.set_xticks([])
    for sp in ax.spines.values():
        sp.set_visible(False)
    ax.set_ylim(-0.6, len(data) - 0.4)
    ax.set_xlim(0, max(g["w"] for g in data) * 1.12)
    return _svg(fig)


def build_mktcap_html(mk: dict, lang: str) -> str:
    t = TM[lang]
    par, of, tot = mk["par"][1], mk["of"][1], mk["tot"]
    rd = lambda r: num(r, 0 if r > 100 else 2, lang)  # noqa: E731
    kpis = [(t["k1"], f"US$ {num(tot / par / 1e6, 1, lang)} {t['mm']}", t["rate"].format(r=rd(par))),
            (t["k2"], f"US$ {num(tot / of / 1e6, 1, lang)} {t['mm']}", t["rate"].format(r=rd(of))),
            (t["k3"], f"Bs. {num(tot / 1e6, 0, lang)} {t['mm']}", dshort(mk["date"], lang)),
            (t["k4"], str(len(mk["rows"])), "")]
    kp = "".join(f"<td><div class='k'>{k}</div><div class='v'>{v}</div><div class='m'>{m or '&nbsp;'}</div></td>" for k, v, m in kpis)
    def cls_lines(g, fn):
        return "<br>".join(fn(c) for c in g["classes"])

    def price_bs(c):
        return num(c["close"], 2, lang) if c["close"] else "—"

    def price_us(c):
        return num(c["close"] / par, 4, lang) if c["close"] else "—"

    def cap_mm(v, r):
        return num(v / r / 1e6, 1, lang) if v else "—"

    body = ""
    for i, g in enumerate(mk["rows"], 1):
        multi = len(g["classes"]) > 1
        sym = "<br>".join(f"<b>{c['symbol']}</b>" for c in g["classes"])
        body += (f"<tr><td>{i}</td><td>{sym}</td><td class='l'>{g['nombre']}{'<div class=cl>' + t['multi'] + '</div>' if multi else ''}</td>"
                 f"<td>{cls_lines(g, price_bs)}</td><td>{cls_lines(g, price_us)}</td><td>{num(g['shares'], 0, lang) if g['shares'] else '—'}</td>"
                 f"<td><b>{cap_mm(g['cap'], par)}</b></td><td>{cap_mm(g['cap'], of)}</td><td>{num(g['w'], 1, lang) + '%' if g['w'] else '—'}</td></tr>")
    head = "".join(f"<th{' class=l' if j == 2 else ''}>{h}</th>" for j, h in enumerate(t["h"]))
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4)))
    src = t["src"].format(par=rd(par), of=rd(of), fd=dshort(mk["par"][0], lang), now=f"{dshort(now.date().isoformat(), lang)} {now:%H:%M} VET")
    extra = """
table.kq { width: 100%; border-collapse: separate; border-spacing: 6px 0; margin: 8px -6px 0; width: calc(100% + 12px); table-layout: fixed; }
table.kq td { border: 0.6px solid #dfe2ea; border-top: 2.2px solid #004aa1; border-radius: 5px; padding: 9px 8px; text-align: center; vertical-align: middle; }
table.kq .k { font-size: 7pt; letter-spacing: .5px; color: #555; font-weight: 700; }
table.kq .v { font-size: 14pt; font-weight: 700; color: #121a30; margin: 4px 0 2px; white-space: nowrap; }
table.kq .m { font-size: 7.5pt; color: #777; }
.card h2 { font-size: 12pt; }
.src { font-size: 7pt; }
table.rk { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 6px; }
table.rk th { background: #121a30; color: #fff; font-weight: 700; text-align: center; vertical-align: middle; padding: 6px 6px; font-size: 8pt; line-height: 1.25; white-space: nowrap; }
table.rk td { text-align: right; padding: 5px 6px; border-bottom: 0.5px solid #e4e5ea; }
table.rk tr:nth-child(even) td { background: #f6f7f9; }
table.rk .l { text-align: left; }
table.rk td:first-child { text-align: left; color: #6e7486; }
table.rk th:first-child { color: #b5b6ba; }
table.rk .cl { font-size: 7pt; color: #004aa1; }\ntable.rk td { vertical-align: top; }\ntable.rk tr { page-break-inside: avoid; }\ntable.rk tr.tot td { background: #eaebed; font-weight: 700; border-top: 1px solid #004aa1; }
"""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra}</style></head><body>
<div class="hero"><div class="top"><img src="{logo()}"><div class="brand">{t['kicker']}</div></div><h1>{t['title']}</h1>
<p>{t['sub'].format(d=dlong(mk['date'], lang))}</p></div>
<table class="kq"><tr>{kp}</tr></table>
<div class="card" style="margin-top:10px"><h2>{t['rank']}</h2><table class="rk"><tr>{head}</tr>{body}</table></div>
<div class="src">{src}</div>
</body></html>"""


# ---------------------------------------------------------------- informe de cierre diario (renta variable) + aviso por Telegram
TD = {
    "es": dict(kicker="RADAR · CIERRE BVC", title="Cierre de la Bolsa de Valores de Caracas · {d}",
               sub="Renta variable: las {n} acciones que operaron en la sesión, con el cierre en bolívares y en dólares, variación del día y rendimiento {wk}.",
               wk_run="en lo que va de semana", wk_full="de la semana (lunes a viernes)",
               k_ibc="IBC", k_of="US$ OFICIAL BCV", k_par="US$ MERCADO ALTERNATIVO", k_monto="MONTO NEGOCIADO (US$ ALT.)",
               ibc_m="día {d} · semana {w}", h=["Símbolo", "Emisor", "Apertura<br>Bs.", "Cierre<br>Bs.", "Var. día<br>Bs.", "Cierre<br>US$ alt.",
               "Var. día<br>US$ alt.", "Semana<br>US$ alt.", "Monto<br>US$ alt."], rank="Acciones que operaron · de mayor a menor variación del día",
               src="Fuente: Bolsa de Valores de Caracas (SIBE) y tipo de cambio del Radar Grupo Solfin: oficial BCV Bs. {of}/US$ y mercado alternativo Bs. {par}/US$. "
               "Columnas en US$ alt.: cada precio se convierte con la tasa del mercado alternativo de su fecha. Semana: cierre de hoy frente al último cierre de la semana anterior ({base}). Monto: monto negociado del día ÷ tasa alternativa de hoy. "
               "Informe generado automáticamente el {now} — no constituye recomendación de inversión.", nobase="—"),
    "en": dict(kicker="RADAR · BVC CLOSE", title="Caracas Stock Exchange close · {d}",
               sub="Equities: the {n} stocks traded in the session, with the close in bolivars and dollars, daily change and {wk} return.",
               wk_run="week-to-date", wk_full="full-week (Monday to Friday)",
               k_ibc="IBC", k_of="US$ BCV OFFICIAL", k_par="US$ ALTERNATIVE MARKET", k_monto="TRADED AMOUNT (ALT. US$)",
               ibc_m="day {d} · week {w}", h=["Symbol", "Issuer", "Open<br>Bs.", "Close<br>Bs.", "Day chg.<br>Bs.", "Close<br>US$ alt.",
               "Day chg.<br>US$ alt.", "Week<br>US$ alt.", "Amount<br>US$ alt."], rank="Stocks traded · sorted by daily change",
               src="Source: Caracas Stock Exchange (SIBE) and Radar Grupo Solfin exchange rates: BCV official Bs. {of}/US$ and alternative market Bs. {par}/US$. "
               "US$ alt. columns: each price is converted at the alternative-market rate of its own date. Week: today's close vs. the last close of the previous week ({base}). Amount: traded amount ÷ today's alternative rate. "
               "Report generated automatically on {now} — not investment advice.", nobase="—"),
}


def _at(series: list[tuple[str, float]], d: str) -> float | None:
    v = None
    for x, y in series:
        if x <= d:
            v = y
        else:
            break
    return v


def fill_open(rows: list[dict], session: str, budget: float = 90.0) -> None:
    """El resumen del día de la BVC no trae el precio de apertura: se toma del histórico de cada símbolo
    (la misma fuente que el robot nocturno) y se guarda también en bvc_quotes."""
    import time
    from .bvc import history_for
    from .common import upsert
    t0, got = time.time(), []
    for x in rows:
        if x.get("open") or time.time() - t0 > budget:
            continue
        try:
            _, hist = history_for(x["symbol"])
            h = next((q for q in hist if q["date"] == session), None)
            if h and h.get("open"):
                x["open"] = h["open"]
                got.append({k: h.get(k) for k in ("date", "symbol", "market", "open", "high", "low")})
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.5)
    if got:
        try:
            upsert("bvc_quotes", got, "date,symbol")
        except Exception:  # noqa: BLE001
            pass


def daily_data(fx: dict) -> dict | None:
    rows = select("bvc_latest", {"select": "date,symbol,name,company,open,close,var_pct,volume,amount", "market": "eq.RV"})
    if not rows:
        return None
    session = max(x["date"] for x in rows)
    rows = [x for x in rows if x["date"] == session and x.get("close")]
    if not rows:
        return None
    fill_open(rows, session)
    d = dt.date.fromisoformat(session)
    monday = (d - dt.timedelta(days=d.weekday())).isoformat()
    prev = select("bvc_quotes", {"select": "symbol,date,close", "market": "eq.RV", "close": "gt.0",
                                 "date": f"gte.{(d - dt.timedelta(days=d.weekday() + 21)).isoformat()}", "order": "date"})
    base, last = {}, {}
    for q in prev:
        if q["date"] < monday:
            base[q["symbol"]] = (q["date"], q["close"])  # el último antes del lunes
        if q["date"] < session:
            last[q["symbol"]] = (q["date"], q["close"])  # la sesión anterior de cada acción
    emp = company_names()
    of, par = _at(fx["usd_bcv"], session), _at(fx["usd_paralelo"], session)
    for x in rows:
        x["nombre"] = (emp.get(x["symbol"]) or {}).get("nombre") or pretty_name(x.get("company") or x.get("name") or x["symbol"])
        b = base.get(x["symbol"])
        x["wk_bs"] = (x["close"] / b[1] - 1) * 100 if b else None
        pb = _at(fx["usd_paralelo"], b[0]) if b else None
        x["wk_us"] = ((x["close"] / par) / (b[1] / pb) - 1) * 100 if b and par and pb else None
        p = last.get(x["symbol"])
        pp = _at(fx["usd_paralelo"], p[0]) if p else None
        x["d_us"] = ((x["close"] / par) / (p[1] / pp) - 1) * 100 if p and par and pp else None
        x["close_us"] = x["close"] / par if par else None
        x["amount_us"] = (x.get("amount") or 0) / par if par else None
    rows.sort(key=lambda x: -(x.get("var_pct") or 0))
    ibc = fx.get("ibc") or []
    ibc_now = _at(ibc, session)
    ibc_prev = next((v for x, v in reversed(ibc) if x < session), None)
    ibc_base = next((v for x, v in reversed(ibc) if x < monday), None)
    bases = sorted({b[0] for b in base.values()})
    return {"rows": rows, "session": session, "friday": d.weekday() == 4, "of": of, "par": par, "monday": monday,
            "ibc": ibc_now, "ibc_d": (ibc_now / ibc_prev - 1) * 100 if ibc_now and ibc_prev else None,
            "ibc_w": (ibc_now / ibc_base - 1) * 100 if ibc_now and ibc_base else None,
            "monto": sum(x.get("amount") or 0 for x in rows), "base": bases[-1] if bases else None}


def build_daily_html(dd: dict, lang: str) -> str:
    t = TD[lang]
    par, of = dd["par"], dd["of"]
    rd = lambda r: num(r, 0 if r and r > 100 else 2, lang)  # noqa: E731
    pc = lambda v: "—" if v is None else f"<span class='{'up' if v > 0 else 'dn' if v < 0 else ''}'>{'+' if v > 0 else ''}{num(v, 2, lang)}%</span>"  # noqa: E731
    kpis = [(t["k_ibc"], num(dd["ibc"], 2, lang) if dd["ibc"] else "—", t["ibc_m"].format(d=pc(dd["ibc_d"]), w=pc(dd["ibc_w"]))),
            (t["k_of"], f"Bs. {rd(of)}", ""), (t["k_par"], f"Bs. {rd(par)}", ""),
            (t["k_monto"], f"US$ {num(dd['monto'] / par / 1e3, 1, lang)} {'mil' if lang == 'es' else 'K'}" if par else "—",
             (f"Bs. {num(dd['monto'] / 1e6, 2, lang)} MM" if dd["monto"] >= 1e6 else f"Bs. {num(dd['monto'], 0, lang)}") + (" en bolívares" if lang == "es" else " in bolivars"))]
    kp = "".join(f"<td><div class='k'>{k}</div><div class='v'>{v}</div><div class='m'>{m or '&nbsp;'}</div></td>" for k, v, m in kpis)
    # la apertura solo se muestra si la BVC la publicó para la mayoría de las acciones del día
    show_open = sum(1 for x in dd["rows"] if x.get("open")) >= 0.8 * len(dd["rows"])
    body = "".join(
        f"<tr><td><b>{x['symbol']}</b></td><td class='l'>{x['nombre']}</td>{(f'<td>' + (num(x.get('open'), 2, lang) if x.get('open') else '—') + '</td>') if show_open else ''}"
        f"<td><b>{num(x['close'], 2, lang)}</b></td><td>{pc(x.get('var_pct'))}</td>"
        f"<td class='us'><b>{num(x['close_us'], 4, lang) if x['close_us'] else '—'}</b></td><td class='us'>{pc(x['d_us'])}</td><td class='us'>{pc(x['wk_us'])}</td>"
        f"<td class='us'>{num(x['amount_us'], 0, lang) if x['amount_us'] else '—'}</td></tr>"
        for x in dd["rows"])
    hs = [h for j, h in enumerate(t["h"]) if show_open or j != 2]
    us0 = 4 if show_open else 3
    head = "".join(f"<th{' class=l' if j == 1 else ' class=us' if j >= us0 + 1 else ''}>{h}</th>" for j, h in enumerate(hs))
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4)))
    src = t["src"].format(of=rd(of), par=rd(par), base=dshort(dd["base"], lang) if dd["base"] else t["nobase"],
                          now=f"{dshort(now.date().isoformat(), lang)} {now:%H:%M} VET")
    extra = """
@page { size: A4; margin: 11mm 11mm 10mm 11mm; }
table.kq { width: calc(100% + 12px); border-collapse: separate; border-spacing: 6px 0; margin: 8px -6px 0; table-layout: fixed; }
table.kq td { border: 0.6px solid #dfe2ea; border-top: 2.2px solid #004aa1; border-radius: 5px; padding: 8px; text-align: center; vertical-align: middle; }
table.kq .k { font-size: 7pt; letter-spacing: .5px; color: #555; font-weight: 700; }
table.kq .v { font-size: 15pt; font-weight: 700; color: #121a30; margin: 3px 0 2px; white-space: nowrap; }
table.kq .m { font-size: 7.5pt; color: #777; }
table.rk { width: 100%; border-collapse: collapse; font-size: 8.2pt; margin-top: 6px; }
table.rk th { background: #121a30; color: #fff; font-weight: 700; text-align: center; vertical-align: middle; padding: 6px 4px; font-size: 7.4pt; line-height: 1.25; white-space: nowrap; }
table.rk th.us { background: #004aa1; }
table.rk td.us { background: #f1f6fc; }
table.rk tr:nth-child(even) td.us { background: #e7eff9; }
table.rk td { text-align: right; padding: 4.5px 5px; border-bottom: 0.5px solid #e4e5ea; vertical-align: top; }
table.rk tr:nth-child(even) td { background: #f6f7f9; }
table.rk .l { text-align: left; }
table.rk td:first-child { text-align: left; }
table.rk tr { page-break-inside: avoid; }
.up { color: #1e7b45; font-weight: 700; } .dn { color: #b8322a; font-weight: 700; }
.card h2 { font-size: 12pt; } .src { font-size: 7pt; }
"""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra}</style></head><body>
<div class="hero"><div class="top"><img src="{logo()}"><div class="brand">{t['kicker']}</div></div><h1>{t['title'].format(d=dlong(dd['session'], lang))}</h1>
<p>{t['sub'].format(n=len(dd['rows']), wk=t['wk_full'] if dd['friday'] else t['wk_run'])}</p></div>
<table class="kq"><tr>{kp}</tr></table>
<div class="card" style="margin-top:10px"><h2>{t['rank']}</h2><table class="rk"><tr>{head}</tr>{body}</table></div>
<div class="src">{src}</div>
</body></html>"""


def run_daily(force: bool = False):
    """Tras el cierre de la BVC (desde la 1:30 pm de un día con sesión): genera el informe de cierre y el de capitalización,
    los sube a Storage y avisa por Telegram una sola vez por sesión."""
    from .alerts import send_telegram, site
    from .common import upsert
    with Run("cierre_pdf") as r:
        now = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4)))
        if not force and (now.weekday() > 4 or (now.hour, now.minute) < (13, 30)):
            r.log.info("Antes del cierre o fin de semana: nada que hacer")
            return
        fx = {c: [(x["date"], x["value"]) for x in select("observations", {"select": "date,value", "series_code": f"eq.{c}", "date": "gte.2025-06-01", "order": "date"})]
              for c in ("usd_bcv", "usd_paralelo", "ibc")}
        dd = daily_data(fx)
        if not dd or (not force and dd["session"] != now.date().isoformat()):
            r.log.info("Sin sesión de hoy todavía")
            return
        key = f"pdf_cierre:{dd['session']}"
        if not force and select("alerts_log", {"select": "key", "key": f"eq.{key}"}):
            r.log.info("El informe de cierre de hoy ya se envió")
            return
        ensure_bucket(BUCKET)
        urls = {}
        for lang in ("es", "en"):
            pdf = render_pdf(build_daily_html(dd, lang))
            urls[lang] = storage_upload(BUCKET, f"mercado/diario_{lang}.pdf", pdf, max_age=60)
            storage_upload(BUCKET, f"mercado/diario/{dd['session']}_{lang}.pdf", pdf)
        mk_url = None
        try:
            mk = mktcap_data(fx)
            if mk:
                for lang in ("es", "en"):
                    u = storage_upload(BUCKET, f"mercado/mktcap_{lang}.pdf", render_pdf(build_mktcap_html(mk, lang)), max_age=60)
                    mk_url = mk_url or u
        except Exception as e:  # noqa: BLE001
            r.note(f"mktcap: {str(e)[:120]}")
        rows = dd["rows"]
        sg = lambda v: "—" if v is None else f"{'+' if v > 0 else ''}{num(v, 2)}%"  # noqa: E731
        up, dn = rows[0], rows[-1]
        d = dt.date.fromisoformat(dd["session"])
        fecha = f"{['lunes', 'martes', 'miércoles', 'jueves', 'viernes'][d.weekday()]} {d.day}"
        lines = [f"📄 **Informe de cierre BVC · {fecha}**",
                 f"{len(rows)} acciones operaron · IBC {num(dd['ibc'], 2) if dd['ibc'] else '—'} ({sg(dd['ibc_d'])} día · {sg(dd['ibc_w'])} {'semana' if dd['friday'] else 'en la semana'})"]
        if (up.get("var_pct") or 0) > 0:
            lines.append(f"🟢 Mayor alza: **{up['symbol']}** {sg(up.get('var_pct'))}")
        if (dn.get("var_pct") or 0) < 0:
            lines.append(f"🔴 Mayor baja: **{dn['symbol']}** {sg(dn.get('var_pct'))}")
        links = [f"[PDF del cierre]({urls['es']}?v={dd['session']})"]
        if mk_url:
            links.append(f"[PDF capitalización]({mk_url}?v={dd['session']})")
        if site():
            links.append(f"[Ver en el Radar]({site('/es/bvc')})")
        text = "\n".join(lines) + "\n\n🔗 " + "  ·  ".join(links)
        ch = None
        try:
            ch = "telegram" if send_telegram(text) else None
        except Exception as e:  # noqa: BLE001
            r.note(f"Telegram: {e}")
        upsert("alerts_log", [{"key": key, "rule": "pdf_cierre", "message": text, "channels": ch,
                               "sent_at": dt.datetime.now(dt.timezone.utc).isoformat()}], "key")
        r.rows = len(rows)


# ---------------------------------------------------------------- Radar semanal (viernes, tras el cierre)
WEEKLY_SERIES = [("usd_bcv", "Dólar oficial BCV", "Official USD (BCV)", "Bs", 2, "pct"), ("usd_paralelo", "Dólar mercado alternativo", "Alternative-market USD", "Bs", 2, "pct"),
                 ("brecha_cambiaria", "Brecha cambiaria", "FX gap", "%", 1, "pp"), ("ibc", "IBC (Bs)", "IBC (Bs)", "pts", 2, "pct"),
                 ("ibc_usd_paralelo", "IBC en US$ alternativo", "IBC in alternative US$", "pts", 2, "pct"), ("brent", "Brent", "Brent", "US$/b", 2, "pct"),
                 ("merey", "Cesta Merey (último mes)", "Merey basket (latest month)", "US$/b", 2, "none"), ("sp500", "S&P 500", "S&P 500", "pts", 2, "pct"),
                 ("oro_diario", "Oro", "Gold", "US$/oz", 2, "pct"), ("bitcoin", "Bitcoin", "Bitcoin", "US$", 0, "pct"), ("ust_10a", "Tesoro EE.UU. 10 años", "US Treasury 10-year", "%", 2, "bp")]


def weekly_data(friday: dt.date) -> dict:
    monday = friday - dt.timedelta(days=friday.weekday())
    prev_end = (monday - dt.timedelta(days=1)).isoformat()
    codes = [c for c, *_ in WEEKLY_SERIES]
    obs = select("observations", {"select": "series_code,date,value", "series_code": f"in.({','.join(codes)})",
                                  "date": f"gte.{(monday - dt.timedelta(days=60)).isoformat()}", "order": "date"})
    by: dict[str, list] = {}
    for o in obs:
        by.setdefault(o["series_code"], []).append((o["date"], o["value"]))
    rows = []
    for code, es_, en_, unit, dec, kind in WEEKLY_SERIES:
        pts = [p for p in by.get(code, []) if p[0] <= friday.isoformat()]
        if not pts:
            continue
        last = pts[-1][1]
        base = next((v for d, v in reversed(pts) if d <= prev_end), None)
        chg = None
        if base is not None and kind == "pct" and base:
            chg = (last / base - 1) * 100
        elif base is not None and kind == "pp":
            chg = last - base
        elif base is not None and kind == "bp":
            chg = (last - base) * 100
        rows.append({"es": es_, "en": en_, "unit": unit, "dec": dec, "kind": kind, "last": last, "chg": chg, "date": pts[-1][0]})
    # BVC: rendimiento de la semana por acción (en Bs y en US$ alternativo)
    q = select("bvc_quotes", {"select": "symbol,date,close", "market": "eq.RV", "close": "gt.0",
                              "date": f"gte.{(monday - dt.timedelta(days=21)).isoformat()}", "order": "date"})
    par = [(d, v) for d, v in by.get("usd_paralelo", [])]
    lastq, baseq = {}, {}
    for x in q:
        if x["date"] <= friday.isoformat():
            (lastq if x["date"] >= monday.isoformat() else baseq)[x["symbol"]] = (x["date"], x["close"])
    emp = company_names()
    movers = []
    for sym, (d1, c1) in lastq.items():
        b = baseq.get(sym)
        if not b:
            continue
        p1, p0 = _at(par, d1), _at(par, b[0])
        movers.append({"symbol": sym, "nombre": (emp.get(sym) or {}).get("nombre") or sym, "bs": (c1 / b[1] - 1) * 100,
                       "us": ((c1 / p1) / (b[1] / p0) - 1) * 100 if p1 and p0 else None})
    movers.sort(key=lambda m: -(m["us"] if m["us"] is not None else m["bs"]))
    # datos oficiales publicados en la semana (los mismos avisos que salieron por Telegram)
    rules = json.loads((pathlib.Path(__file__).resolve().parent.parent / "config" / "alerts.json").read_text(encoding="utf-8"))["reglas"]
    data_rules = {x["id"] for x in rules if x["tipo"] == "nuevo_dato"}
    logs = select("alerts_log", {"select": "rule,message,sent_at", "sent_at": f"gte.{monday.isoformat()}", "order": "sent_at"})
    from .alerts import plain
    released = []
    for x in logs:
        if x["rule"] in data_rules and x.get("message"):
            lines = [ln.strip() for ln in plain(x["message"]).splitlines() if ln.strip() and not ln.startswith("━") and not ln.startswith("🔗")]
            txt = " · ".join(lines[:2])
            if txt and txt not in released:
                released.append(txt)
    # titulares de la semana (Venezuela; los más citados primero)
    news = select("news", {"select": "title,title_es,source,category,published_at", "published_at": f"gte.{monday.isoformat()}",
                           "category": "in.(economia,petroleo,mercados,banca,deuda,mineria)", "order": "published_at.desc", "limit": 400})
    from .alerts import same_story
    groups: list[dict] = []
    for n in news:
        t = n.get("title_es") or n["title"]
        g = next((g for g in groups if same_story(g["t"], t)), None)
        if g:
            g["n"] += 1
        else:
            groups.append({"t": t, "n": 1, "s": n.get("source") or ""})
    groups.sort(key=lambda g: -g["n"])
    return {"monday": monday.isoformat(), "friday": friday.isoformat(), "rows": rows, "movers": movers, "released": released[:10], "news": groups[:8]}


def build_weekly_html(wd: dict, lang: str) -> str:
    es = lang == "es"
    def chg(r):
        v = r["chg"]
        if v is None or r["kind"] == "none":
            return "—"
        if r["kind"] == "bp":
            s = f"{'+' if v > 0 else ''}{num(v, 0, lang)} pb" if es else f"{'+' if v > 0 else ''}{num(v, 0, lang)} bp"
        elif r["kind"] == "pp":
            s = f"{'+' if v > 0 else ''}{num(v, 1, lang)} pp"
        else:
            s = f"{'+' if v > 0 else ''}{num(v, 2, lang)}%"
        return f"<span class='{'up' if v > 0 else 'dn' if v < 0 else ''}'>{s}</span>"
    kr = "".join(f"<tr><td class='l'>{r['es'] if es else r['en']}</td><td><b>{num(r['last'], r['dec'], lang)}</b> <span class='u'>{r['unit']}</span></td><td>{chg(r)}</td></tr>" for r in wd["rows"])
    pc = lambda v: "—" if v is None else f"<span class='{'up' if v > 0 else 'dn' if v < 0 else ''}'>{'+' if v > 0 else ''}{num(v, 2, lang)}%</span>"  # noqa: E731
    mv = wd["movers"]
    top = mv[:5]
    bot = [m for m in reversed(mv[-5:]) if m not in top]
    mrow = lambda m: f"<tr><td><b>{m['symbol']}</b></td><td class='l'>{m['nombre']}</td><td>{pc(m['bs'])}</td><td>{pc(m['us'])}</td></tr>"  # noqa: E731
    mhead = f"<tr><th>{'Símbolo' if es else 'Symbol'}</th><th class='l'>{'Emisor' if es else 'Issuer'}</th><th>{'Semana Bs.' if es else 'Week Bs.'}</th><th class='us'>{'Semana US$ alt.' if es else 'Week alt. US$'}</th></tr>"
    rel = "".join(f"<li>{x}</li>" for x in wd["released"]) or f"<li>{'Sin publicaciones oficiales nuevas esta semana.' if es else 'No new official releases this week.'}</li>"
    nws = "".join(f"<li>{g['t']} <span class='u'>· {g['s']}{(' +' + str(g['n'] - 1)) if g['n'] > 1 else ''}</span></li>" for g in wd["news"])
    d0, d1 = dlong(wd["monday"], lang), dlong(wd["friday"], lang)
    now = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4)))
    extra = """
table.w { width: 100%; border-collapse: collapse; font-size: 8.6pt; }
table.w th { background: #121a30; color: #fff; text-align: right; padding: 5px 6px; font-size: 7.6pt; }
table.w th.us { background: #004aa1; }
table.w td { text-align: right; padding: 4px 6px; border-bottom: 0.5px solid #e4e5ea; }
table.w .l { text-align: left; } table.w td:first-child { text-align: left; }
table.w .u { color: #6e7486; font-size: 7pt; font-weight: 400; }
.up { color: #1e7b45; font-weight: 700; } .dn { color: #b8322a; font-weight: 700; }
.two { display: flex; gap: 10px; } .two > div { flex: 1; }
ul.b { margin: 4px 0 0; padding-left: 14px; font-size: 8.2pt; line-height: 1.45; } ul.b .u { color: #6e7486; font-size: 7pt; }
.card h2 { font-size: 11.5pt; } .src { font-size: 7pt; }
"""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra}</style></head><body>
<div class="hero"><div class="top"><img src="{logo()}"><div class="brand">{'RADAR · RESUMEN SEMANAL' if es else 'RADAR · WEEKLY SUMMARY'}</div></div>
<h1>{'Radar semanal' if es else 'Weekly Radar'}</h1><p>{(f'Semana del {d0} al {d1}: tipo de cambio, Bolsa de Caracas, datos publicados, petróleo y mercados internacionales.') if es else (f'Week of {d0} to {d1}: FX, Caracas Stock Exchange, data releases, oil and global markets.')}</p></div>
<div class="two" style="margin-top:8px">
<div class="card"><h2>{'Indicadores de la semana' if es else 'Key indicators this week'}</h2>
<table class="w"><tr><th class="l">{'Indicador' if es else 'Indicator'}</th><th>{'Cierre' if es else 'Close'}</th><th>{'Var. semana' if es else 'Weekly chg.'}</th></tr>{kr}</table></div>
<div class="card"><h2>{'Datos oficiales publicados' if es else 'Official data released'}</h2><ul class="b">{rel}</ul></div>
</div>
<div class="two">
<div class="card"><h2>{'BVC · mayores alzas de la semana' if es else 'BVC · top weekly gainers'}</h2><table class="w">{mhead}{''.join(mrow(m) for m in top)}</table></div>
<div class="card"><h2>{'BVC · mayores bajas de la semana' if es else 'BVC · top weekly losers'}</h2><table class="w">{mhead}{''.join(mrow(m) for m in bot)}</table></div>
</div>
<div class="card"><h2>{'Lo más comentado de la semana' if es else 'Most-covered stories this week'}</h2><ul class="b">{nws}</ul></div>
<div class="src">{'Fuentes: BCV, Bolsa de Valores de Caracas, OPEP, EIA, Yahoo Finance, Departamento del Tesoro de EE.UU. y medios citados. Variación semanal: cierre del viernes frente al último dato de la semana anterior; en US$ alternativo cada precio se convierte con la tasa de su fecha. ' if es else 'Sources: BCV, Caracas Stock Exchange, OPEC, EIA, Yahoo Finance, US Treasury and the outlets cited. Weekly change: Friday close vs. the previous week’s last print; in alternative US$ each price is converted at its own date’s rate. '}{'Informe generado automáticamente el' if es else 'Report generated automatically on'} {dshort(now.date().isoformat(), lang)} {now:%H:%M} VET — {'no constituye recomendación de inversión.' if es else 'not investment advice.'}</div>
</body></html>"""


def run_weekly(force: bool = False):
    """Viernes desde las 2:00 pm (o el fin de semana si no salió): PDF del Radar semanal + aviso por Telegram, una vez por semana."""
    from .alerts import send_telegram, site
    from .common import upsert
    with Run("semanal") as r:
        now = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4)))
        if not force and not (now.weekday() == 4 and now.hour >= 14 or now.weekday() >= 5):
            return
        friday = now.date() - dt.timedelta(days=(now.weekday() - 4) % 7)
        key = f"pdf_semanal:{friday.isoformat()}"
        if not force and select("alerts_log", {"select": "key", "key": f"eq.{key}"}):
            return
        wd = weekly_data(friday)
        ensure_bucket(BUCKET)
        urls = {}
        for lang in ("es", "en"):
            pdf = render_pdf(build_weekly_html(wd, lang))
            urls[lang] = storage_upload(BUCKET, f"semanal/radar_semanal_{lang}.pdf", pdf, max_age=60)
            storage_upload(BUCKET, f"semanal/{friday.isoformat()}_{lang}.pdf", pdf)
        byc = {x["es"]: x for x in wd["rows"]}
        def p(name):
            x = byc.get(name)
            return "—" if not x or x["chg"] is None else f"{'+' if x['chg'] > 0 else ''}{num(x['chg'], 2)}%"
        text = (f"🗞️ **Radar semanal · {friday.day} {['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'][friday.month - 1]}**\n"
                f"Dólar alternativo {p('Dólar mercado alternativo')} · IBC {p('IBC (Bs)')} · S&P 500 {p('S&P 500')}\n"
                f"{len(wd['released'])} datos oficiales publicados en la semana"
                + "\n\n🔗 " + "  ·  ".join(x for x in [f"[PDF del Radar semanal]({urls['es']}?v={friday.isoformat()})", f"[Ver en el Radar]({site('/es')})" if site() else ""] if x))
        ch = None
        try:
            ch = "telegram" if send_telegram(text) else None
        except Exception as e:  # noqa: BLE001
            r.note(f"Telegram: {e}")
        upsert("alerts_log", [{"key": key, "rule": "pdf_semanal", "message": text, "channels": ch, "sent_at": dt.datetime.now(dt.timezone.utc).isoformat()}], "key")
        r.rows = 1
