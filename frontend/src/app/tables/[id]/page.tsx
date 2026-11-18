import { getTranslations } from "next-intl/server";
import { TableSwitch } from "@/components/table/table-switch";

export async function generateMetadata() {
  const t = await getTranslations("table");
  return { title: t("title") };
}

export default async function TablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TableSwitch tableId={id} />;
}
