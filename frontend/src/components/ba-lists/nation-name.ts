"use client";

import { useTranslations } from "next-intl";

/** Translated Bolt Action nation name (unknown codes as they are). */
export function useNationName(): (code: string) => string {
  const t = useTranslations("boltAction.nations");
  return (code: string) => (t.has(code) ? t(code) : code);
}
