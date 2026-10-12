import { getTranslations } from "next-intl/server";
import { TablePlay } from "@/components/table/table-play";

export async function generateMetadata() {
  const t = await getTranslations("table");
  return { title: t("title") };
}

export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TablePlay tableId={id} />;
}
