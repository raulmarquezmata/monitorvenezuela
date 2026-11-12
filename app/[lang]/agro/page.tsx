import AgroBody from "@/components/AgroBody";
import MacroNav from "@/components/MacroNav";
import type { Lang } from "@/lib/i18n";

// el rubro elegido llega por la URL (?item=): se renderiza en cada visita
export const dynamic = "force-dynamic";

export default async function Agro({ params, searchParams }: { params: { lang: Lang }; searchParams: { item?: string } }) {
  return (<><MacroNav lang={params.lang} /><AgroBody lang={params.lang} item={searchParams.item} /></>);
}
