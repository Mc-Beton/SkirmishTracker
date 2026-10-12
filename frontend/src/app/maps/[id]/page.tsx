import { getTranslations } from "next-intl/server";
import { MapEditor } from "@/components/table/map-editor";

export async function generateMetadata() {
  const t = await getTranslations("table");
  return { title: t("mapsTitle") };
}

/** /maps/new creates a map, /maps/{id} opens one (own maps are editable, others can be saved as a copy). */
export default async function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MapEditor mapId={id === "new" ? null : id} />;
}
