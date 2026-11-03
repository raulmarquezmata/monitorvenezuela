import { redirect } from "next/navigation";
import type { Lang } from "@/lib/i18n";

// «Research» ahora se llama «Informes»
export default function ResearchIndex({ params }: { params: { lang: Lang } }) {
  redirect(`/${params.lang}/informes`);
}
