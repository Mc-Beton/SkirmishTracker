"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocale } from "@/i18n/actions";
import { locales } from "@/i18n/config";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const current = useLocale();
  const t = useTranslations("nav");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="group" aria-label={t("language")} className="flex rounded-md border text-xs">
      {locales.map((locale) => (
        <button
          key={locale}
          type="button"
          disabled={pending}
          aria-pressed={current === locale}
          onClick={() =>
            startTransition(async () => {
              await setLocale(locale);
              router.refresh();
            })
          }
          className={cn(
            "px-2 py-1 uppercase first:rounded-l-md last:rounded-r-md",
            current === locale ? "bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          {locale}
        </button>
      ))}
    </div>
  );
}
