import { getTranslations } from "next-intl/server";
import { Map3dEditor } from "@/components/table/map3d-editor";

export async function generateMetadata() {
  const t = await getTranslations("maps3d");
  return { title: t("title") };
}

export default function Maps3dPage() {
  return <Map3dEditor />;
}
