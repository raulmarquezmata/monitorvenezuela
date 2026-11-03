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

from .common import Run, ensure_bucket, select, storage_upload

BUCKET = "reportes"
EMPRESAS = pathlib.Path(__file__).resolve().parent.parent / "config" / "bvc_empresas.json"
NAVY, GOLD, GREEN, PAR, RED, GRID = "#1c2541", "#c9a227", "#1e7b45", "#d4a72c", "#b8322a", "#e6e8ee"
MES = {"es": ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
       "en": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]}
MES_LARGO = {"es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
             "en": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]}

T = {
    "es": dict(
        title="{name} ({sym}) — Precio en Bs. y en US$",
        sub="Serie diaria completa: {d0} al {d1}. Precio de cierre de la acción {cls} en bolívares y su conversión a dólares (Bs. del día ÷ tipo de cambio del día, oficial y paralelo).",
        ind="INDICADORES {y} ({a} → {b})", val="VALORACIÓN DE MERCADO (US$ PARALELO)", par_note="Paralelo Bs. {r}/US$ · {d}",
        shares="Acciones", close="Cierre Bs.", usd_sh="US$ / acc.", val_mm="Valor US$ MM", total="Total",
        at_off="A tasa oficial BCV (Bs. {r}): US$ {v} MM.", price="PRECIO ACTUAL (BS.)", last_close="{d} · último cierre SIBE",
        nominal="RENDIMIENTO NOMINAL (BS.)", r_of="RENDIMIENTO EN US$ OFICIAL", r_par="RENDIMIENTO EN US$ PARALELO",
        hilo_bs="MÁX / MÍN EN BS.", hilo_us="MÁX / MÍN EN US$ (OF.)", hilo_d="máx {a} · mín {b}",
        ch1="Precio de {sym} — Bs. y US$ en una sola vista",
        ch1_sub="Eje izquierdo: precio nominal en bolívares. Eje derecho: precio convertido a dólares. La divergencia entre ambos ejes es el efecto de la devaluación. Las líneas verticales marcan el nivel de mayo 2025 y el último dato disponible.",
        l_bs="Precio Bs.", l_bs2="(eje izq.)", l_of="US$ oficial", l_par="US$ paralelo", l_right="(eje der.)",
        may="Mayo 2025", lastd="Último dato ({d})", of_s="oficial", par_s="paralelo",
        ch2="Tipo de cambio (Bs./US$)", ch2_sub="Oficial y paralelo utilizados para la conversión.", l_ofx="Oficial", l_parx="Paralelo",
        cls_common="común", cls_a="Clase A", cls_b="Clase B",
        src=("Fuente: Bolsa de Valores de Caracas (cierres diarios SIBE{syms}) y tipo de cambio de Monitor Venezuela: tasa oficial BCV "
             "y referencia paralela del mercado P2P. Días sin dato de tipo de cambio: se usa el último disponible. Valoración: acciones en circulación "
             "(BVC) × último cierre ÷ tipo de cambio paralelo. Metodología: precio en US$ = precio en Bs. del día ÷ tipo de cambio del día. "
             "Informe generado automáticamente el {now} — no constituye recomendación de inversión."),
    ),
    "en": dict(
        title="{name} ({sym}) — Price in Bs. and US$",
        sub="Full daily series: {d0} to {d1}. Closing price of the {cls} share in bolivars and its conversion to dollars (Bs. of the day ÷ exchange rate of the day, official and parallel).",
        ind="{y} INDICATORS ({a} → {b})", val="MARKET VALUE (US$ PARALLEL)", par_note="Parallel Bs. {r}/US$ · {d}",
        shares="Shares", close="Close Bs.", usd_sh="US$ / sh.", val_mm="Value US$ MM", total="Total",
        at_off="At the BCV official rate (Bs. {r}): US$ {v} MM.", price="LAST PRICE (BS.)", last_close="{d} · last SIBE close",
        nominal="NOMINAL RETURN (BS.)", r_of="RETURN IN US$ (OFFICIAL)", r_par="RETURN IN US$ (PARALLEL)",
        hilo_bs="HIGH / LOW IN BS.", hilo_us="HIGH / LOW IN US$ (OFF.)", hilo_d="high {a} · low {b}",
        ch1="{sym} price — Bs. and US$ in one view",
        ch1_sub="Left axis: nominal price in bolivars. Right axis: price converted to dollars. The gap between both axes is the effect of devaluation. Vertical lines mark the May 2025 level and the latest data point.",
        l_bs="Price Bs.", l_bs2="(left axis)", l_of="US$ official", l_par="US$ parallel", l_right="(right axis)",
        may="May 2025", lastd="Latest ({d})", of_s="official", par_s="parallel",
        ch2="Exchange rate (Bs./US$)", ch2_sub="Official and parallel rates used for the conversion.", l_ofx="Official", l_parx="Parallel",
        cls_common="common", cls_a="Class A", cls_b="Class B",
        src=("Source: Caracas Stock Exchange (daily SIBE closes{syms}) and Monitor Venezuela exchange rates: BCV official rate and the "
             "parallel P2P market reference. Days without an exchange-rate print use the latest available. Valuation: shares outstanding (BVC) × "
             "last close ÷ parallel rate. Methodology: US$ price = Bs. price of the day ÷ exchange rate of the day. "
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
    ax.plot(x, ofa, color=NAVY, lw=1.3)
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
CSS = """
@page { size: A4; margin: 11mm 11mm 10mm 11mm; }
* { box-sizing: border-box; }
body { font-family: Lato, Carlito, 'DejaVu Sans', sans-serif; color: #1f2333; font-size: 8pt; margin: 0; }
.hero { background: %(navy)s; color: #fff; border-radius: 6px; padding: 12px 16px 12px; }
.brand { color: %(gold)s; font-size: 6.6pt; font-weight: 700; letter-spacing: 1.4px; }
.hero h1 { font-size: 15.5pt; margin: 4px 0 4px; font-weight: 700; }
.hero p { margin: 0; font-size: 7.6pt; color: #dfe3ee; line-height: 1.4; }
.sec { font-size: 7pt; font-weight: 700; letter-spacing: .6px; color: #333; margin: 9px 0 5px; }
.val { background: %(navy)s; color: #fff; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; margin-bottom: 7px; }
.val .k { font-size: 6.4pt; letter-spacing: .6px; color: #c9cfdf; font-weight: 700; }
.val .big { color: %(gold)s; font-size: 20pt; font-weight: 700; margin: 6px 0 2px; }
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
.kpi .v { font-size: 13pt; font-weight: 700; margin: 2px 0 1px; color: #1c2541; }
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
""" % {"navy": NAVY, "gold": GOLD}


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
<div class="hero"><div class="brand">SOLFÍN RESEARCH</div><h1>{t['title'].format(name=info['name'], sym=sym)}</h1>
<p>{t['sub'].format(d0=dlong(dates[0], lang), d1=dlong(dates[last], lang), cls=class_label(sym, t, multi))}</p></div>
<div class="sec">{t['ind'].format(y=year, a=a, b=b)}</div>
{val}<div class="grid">{kp}</div>
<div class="card"><h2>{t['ch1'].format(sym=sym)}</h2><p class="d">{t['ch1_sub']}</p>
<div class="leg"><span><i style="border-color:{NAVY}"></i><b>{t['l_bs']}</b> {t['l_bs2']}</span><span><i style="border-color:{GREEN}"></i><b>{t['l_of']}</b> {t['l_right']}</span><span><i class="dash" style="border-color:{PAR}"></i><b>{t['l_par']}</b> {t['l_right']}</span></div>
<img src="{c1}"></div>
<div class="card"><h2>{t['ch2']}</h2><p class="d">{t['ch2_sub']}</p>
<div class="leg"><span><i style="border-color:{NAVY}"></i><b>{t['l_ofx']}</b></span><span><i class="dash" style="border-color:{RED}"></i><b>{t['l_parx']}</b></span></div>
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
                name = (emp.get(sym) or {}).get("nombre") or s.get("company") or s.get("name") or sym
                info = prepare(sym, quotes, fx["usd_bcv"], fx["usd_paralelo"], s, classes, name)
                if not info:
                    continue
                info["splits"] = evs
                for lang in ("es", "en"):
                    storage_upload(BUCKET, f"acciones/{sym}_{lang}.pdf", render_pdf(build_html(info, lang)))
                n += 1
            except Exception as e:  # noqa: BLE001
                r.note(f"{sym}: {str(e)[:120]}")
        r.rows = n
        r.log.info("Informes por acción generados: %d", n)
