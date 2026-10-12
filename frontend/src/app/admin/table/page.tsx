import { getTranslations } from "next-intl/server";
import { LibraryEditor } from "@/components/table/library-editor";

export async function generateMetadata() {
  const t = await getTranslations("table");
  return { title: t("libraryTitle") };
}

export default function TableLibraryPage() {
  return <LibraryEditor />;
}
