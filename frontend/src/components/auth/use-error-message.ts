"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { ApiError } from "@/lib/api";

/**
 * Maps backend error codes to translated messages. The returned function is stable between renders,
 * so it is safe to list in effect dependencies.
 */
export function useErrorMessage() {
  const t = useTranslations("errors");
  return useCallback(
    (error: unknown): string => {
      const code = error instanceof ApiError ? error.code : "INTERNAL_ERROR";
      return t.has(code) ? t(code) : t("INTERNAL_ERROR");
    },
    [t],
  );
}
