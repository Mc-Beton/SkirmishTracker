import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { TeamsView } from "./teams-view";

export async function generateMetadata() {
  const t = await getTranslations("teams");
  return { title: t("title") };
}

export default function TeamsPage() {
  // useSearchParams (the invitation link) needs a Suspense boundary in a statically rendered page
  return (
    <Suspense>
      <TeamsView />
    </Suspense>
  );
}
