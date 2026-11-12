import { redirect } from "next/navigation";

/** Ruta antigua: los informes viven en /informes. */
export default function Old({ params }: { params: { lang: string } }) {
  redirect(`/${params.lang}/informes`);
}
