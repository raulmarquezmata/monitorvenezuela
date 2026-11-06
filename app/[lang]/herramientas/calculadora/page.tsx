import { redirect } from "next/navigation";

/** Ruta antigua: ahora la herramienta vive en /herramientas. */
export default function Old({ params, searchParams }: { params: { lang: string }; searchParams: { s?: string } }) {
  redirect(`/${params.lang}/herramientas${searchParams.s ? `?s=${encodeURIComponent(searchParams.s)}` : ""}#calculadora`);
}
