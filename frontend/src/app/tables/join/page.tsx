import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { JoinTable } from "@/components/table/join-table";

export async function generateMetadata() {
  const t = await getTranslations("table");
  return { title: t("joinTitle") };
}

export default function JoinTablePage() {
  // useSearchParams needs a Suspense boundary in a statically rendered page
  return (
    <Suspense>
      <JoinTable />
    </Suspense>
  );
}
