import { getTranslations } from "next-intl/server";
import { ArmyListEditor } from "@/components/army-lists/army-list-editor";

export async function generateMetadata() {
  const t = await getTranslations("lists");
  return { title: t("title") };
}

/** `/lists/new` creates a list; `/lists/{id}` edits a saved one. */
export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ArmyListEditor listId={id === "new" ? null : id} />;
}
