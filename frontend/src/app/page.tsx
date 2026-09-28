import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { CalendarRange, Trophy, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function HomePage() {
  const t = await getTranslations();
  const features = [
    { icon: Trophy, text: t("home.features.tournaments") },
    { icon: CalendarRange, text: t("home.features.leagues") },
    { icon: WifiOff, text: t("home.features.live") },
  ];
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:py-20">
      <p className="text-sm tracking-widest text-primary uppercase">{t("app.name")}</p>
      <h1 className="mt-3 max-w-2xl font-display text-4xl leading-tight sm:text-5xl">{t("home.headline")}</h1>
      <p className="mt-4 max-w-xl text-lg text-muted-foreground">{t("home.lead")}</p>
      <div className="mt-8 flex gap-3">
        <Button size="lg" asChild>
          <Link href="/register">{t("home.cta")}</Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href="/login">{t("nav.login")}</Link>
        </Button>
      </div>
      <ul className="mt-14 grid gap-4 sm:grid-cols-3">
        {features.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 rounded-lg border bg-card p-4">
            <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="mt-10 text-xs text-muted-foreground">{t("home.status")}</p>
    </div>
  );
}
