import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type Section = { title: string; paragraphs: string[] };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms");
  return { title: t("title") };
}

export default async function TermsPage() {
  const t = await getTranslations("terms");
  const sections = t.raw("sections") as Section[];
  return (
    <article className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <header className="grid gap-2">
        <p className="text-sm tracking-widest text-primary uppercase">{t("kicker")}</p>
        <h1 className="font-display text-3xl">{t("title")}</h1>
        <p className="text-sm text-muted-foreground">{t("updated")}</p>
      </header>
      {sections.map((s) => (
        <section key={s.title} className="grid gap-2">
          <h2 className="text-lg font-semibold">{s.title}</h2>
          {s.paragraphs.map((p) => <p key={p} className="leading-relaxed text-muted-foreground">{p}</p>)}
        </section>
      ))}
    </article>
  );
}
