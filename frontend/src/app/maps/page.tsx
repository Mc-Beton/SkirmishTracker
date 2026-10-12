import { getTranslations } from "next-intl/server";
import { MapsHome } from "@/components/table/maps-home";

export async function generateMetadata() {
  const t = await getTranslations("table");
  return { title: t("mapsTitle") };
}

export default function MapsPage() {
  return <MapsHome />;
}
