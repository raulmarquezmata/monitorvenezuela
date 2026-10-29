/** Nombres cortos en español de los capítulos del Sistema Armonizado más relevantes para Venezuela. */
export const HS_ES: Record<string, string> = {
  "01": "Animales vivos", "02": "Carne", "03": "Pescados y crustáceos", "04": "Lácteos, huevos, miel", "07": "Hortalizas",
  "08": "Frutas", "09": "Café, té y especias", "10": "Cereales", "11": "Molinería (harinas)", "12": "Semillas oleaginosas",
  "15": "Grasas y aceites", "16": "Preparaciones de carne y pescado", "17": "Azúcares", "18": "Cacao", "19": "Preparaciones de cereales",
  "20": "Preparaciones de hortalizas y frutas", "21": "Preparaciones alimenticias diversas", "22": "Bebidas y licores", "23": "Alimento para animales",
  "24": "Tabaco", "25": "Sal, azufre, cemento", "26": "Minerales metalíferos", "27": "Petróleo y combustibles", "28": "Químicos inorgánicos",
  "29": "Químicos orgánicos", "30": "Productos farmacéuticos", "31": "Abonos", "32": "Pinturas y tintes", "33": "Perfumería y cosmética",
  "34": "Jabones y detergentes", "38": "Productos químicos diversos", "39": "Plásticos", "40": "Caucho", "44": "Madera",
  "48": "Papel y cartón", "52": "Algodón", "61": "Prendas de punto", "62": "Prendas de vestir", "63": "Textiles confeccionados",
  "64": "Calzado", "69": "Cerámica", "70": "Vidrio", "71": "Oro, piedras y metales preciosos", "72": "Hierro y acero",
  "73": "Manufacturas de hierro y acero", "74": "Cobre", "76": "Aluminio", "84": "Maquinaria y reactores", "85": "Equipos eléctricos",
  "86": "Material ferroviario", "87": "Vehículos y autopartes", "88": "Aeronaves", "89": "Barcos", "90": "Instrumentos ópticos y médicos",
  "94": "Muebles", "95": "Juguetes", "96": "Manufacturas diversas", "99": "Otros / confidencial",
};

export const hsName = (code: string, desc: string | null, lang: "es" | "en") => {
  if (lang === "es" && HS_ES[code]) return `${code} · ${HS_ES[code]}`;
  const short = (desc ?? "").split(/[;,]/)[0].trim();
  return `${code} · ${short || code}`;
};
