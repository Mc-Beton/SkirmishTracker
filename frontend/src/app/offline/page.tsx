import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CloudOff } from "lucide-react";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("offline");
  return { title: t("pageTitle") };
}

/** Shown by the service worker for pages that were never opened while online. */
export default async function OfflinePage() {
  const t = await getTranslations("offline");
  return (
    <div className="mx-auto grid w-full max-w-md justify-items-center gap-4 px-4 py-16 text-center">
      <CloudOff className="size-12 text-primary" aria-hidden />
      <h1 className="font-display text-2xl">{t("pageTitle")}</h1>
      <p className="text-muted-foreground">{t("pageText")}</p>
    </div>
  );
}
