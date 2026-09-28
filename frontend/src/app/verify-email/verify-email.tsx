"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { api } from "@/lib/api";

export function VerifyEmail() {
  const t = useTranslations("auth");
  const errorMessage = useErrorMessage();
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"pending" | "done" | "error">(token ? "pending" : "error");
  const [error, setError] = useState<string | null>(token ? null : t("missingToken"));
  const sent = useRef(false);

  useEffect(() => {
    // Tokens are single-use: guard against React StrictMode's double effect in development.
    if (!token || sent.current) return;
    sent.current = true;
    api("POST", "/api/auth/verify-email", { token })
      .then(() => setState("done"))
      .catch((err) => {
        setError(errorMessage(err));
        setState("error");
      });
  }, [token, errorMessage]);

  if (state === "pending") return <p className="text-muted-foreground">{t("verifying")}</p>;
  if (state === "error") return <Alert variant="destructive">{error}</Alert>;
  return (
    <div className="grid gap-4">
      <Alert variant="success">{t("verified")}</Alert>
      <Button asChild>
        <Link href="/login">{t("loginSubmit")}</Link>
      </Button>
    </div>
  );
}
