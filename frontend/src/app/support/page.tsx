import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { SupportForm } from "./support-form";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("support");
  return { title: t("title") };
}

export default async function SupportPage() {
  const t = await getTranslations("support");
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6 px-4 py-10">
      <header className="grid gap-2">
        <h1 className="font-display text-3xl">{t("title")}</h1>
        <p className="text-muted-foreground">{t("lead")}</p>
      </header>
      <SupportForm />
    </div>
  );
}
