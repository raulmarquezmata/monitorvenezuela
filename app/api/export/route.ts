import ExcelJS from "exceljs";
import { NextRequest } from "next/server";
import { bvcLatest, history, latest } from "@/lib/data";
import { BS_UNITS, toUsd } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * Descarga de datos.
 *   /api/export?codes=usd_bcv,usd_paralelo&format=xlsx|csv&lang=es
 *   /api/export?category=cambiario&format=xlsx
 *   /api/export?bvc=RV&format=xlsx            (cotizaciones de la última sesión)
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const format = q.get("format") === "csv" ? "csv" : "xlsx";
  const lang = q.get("lang") === "en" ? "en" : "es";
  const stamp = new Date().toISOString().slice(0, 10);

  // ---------------- BVC
  if (q.get("bvc")) {
    const market = q.get("bvc") === "RF" ? "RF" : "RV";
    const rows = await bvcLatest(market);
    const head = ["fecha", "simbolo", "emisor", "precio_bs", "var_pct", "volumen", "monto_bs", "acciones_circulacion", "capitalizacion_bs"];
    const body = rows.map((r) => [r.date, r.symbol, r.company ?? r.name, r.close, r.var_pct, r.volume, r.amount, r.shares_outstanding, r.market_cap_bs]);
    return respond(format, lang, `bvc_${market.toLowerCase()}_${stamp}`, head, body, [["Fuente", "Bolsa de Valores de Caracas (datos con 15 min de retraso)"]]);
  }

  // ---------------- Series
  const meta = await latest(q.get("category") ?? undefined);
  const codes = q.get("codes") ? q.get("codes")!.split(",").filter((c) => meta.some((m) => m.code === c)) : meta.map((m) => m.code);
  if (!codes.length) return new Response("Sin series", { status: 400 });
  const hist = await history(codes, 60);
  // ?cur=bcv|par → series en bolívares pasadas a dólares con la tasa de cada fecha
  const cur = q.get("cur");
  if (cur === "bcv" || cur === "par") {
    const fx = (await history([cur === "bcv" ? "usd_bcv" : "usd_paralelo"], 60))[cur === "bcv" ? "usd_bcv" : "usd_paralelo"];
    for (const c of codes) {
      const m = meta.find((x) => x.code === c)!;
      const u = m.unit_es ? BS_UNITS[m.unit_es] : undefined;
      if (u) { hist[c] = toUsd(hist[c], m.unit_es!, fx); m.unit_es = u.usd; m.unit_en = u.usdEn; }
    }
  }
  const dates = Array.from(new Set(codes.flatMap((c) => hist[c].map((p) => p[0])))).sort();
  const idx = Object.fromEntries(codes.map((c) => [c, new Map(hist[c])]));
  const head = [lang === "es" ? "fecha" : "date", ...codes];
  const body = dates.map((d) => [d, ...codes.map((c) => idx[c].get(d) ?? null)]);
  const info = codes.map((c) => {
    const m = meta.find((x) => x.code === c)!;
    return [c, lang === "es" ? m.name_es : m.name_en, (lang === "es" ? m.unit_es : m.unit_en) ?? "", m.frequency ?? "", m.source ?? "", m.source_url ?? ""];
  });
  const name = (q.get("category") ?? (codes.length === 1 ? codes[0] : "series")) + `_${stamp}`;
  return respond(format, lang, name, head, body, [["code", "nombre", "unidad", "frecuencia", "fuente", "url"], ...info]);
}

async function respond(format: string, lang: string, name: string, head: string[], body: (string | number | null)[][], info: string[][]) {
  if (format === "csv") {
    const sep = lang === "es" ? ";" : ",";
    const cell = (v: string | number | null) => {
      if (v == null) return "";
      if (typeof v === "number") return lang === "es" ? String(v).replace(".", ",") : String(v);
      return /[;,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    };
    const csv = "﻿" + [head, ...body].map((r) => r.map(cell).join(sep)).join("\r\n");
    return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
  }
  const wb = new ExcelJS.Workbook();
  wb.creator = "Monitor Venezuela";
  const ws = wb.addWorksheet(lang === "es" ? "Datos" : "Data", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(head).font = { bold: true };
  for (const r of body) ws.addRow(r.map((v, i) => (i === 0 && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : v)));
  ws.getColumn(1).numFmt = "yyyy-mm-dd";
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 12 : 16; });
  const wi = wb.addWorksheet(lang === "es" ? "Series" : "Series");
  info.forEach((r, i) => { const row = wi.addRow(r); if (i === 0) row.font = { bold: true }; });
  wi.addRow([]);
  wi.addRow([lang === "es" ? "Descargado de Monitor Venezuela · fuentes públicas, no constituye recomendación de inversión." : "Downloaded from Venezuela Monitor · public sources, not investment advice."]);
  wi.columns.forEach((c) => { c.width = 28; });
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` },
  });
}
