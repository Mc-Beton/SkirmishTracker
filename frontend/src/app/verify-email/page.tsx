import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmail } from "./verify-email";

export default async function VerifyEmailPage() {
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("verifyTitle")}>
      <Suspense>
        <VerifyEmail />
      </Suspense>
    </AuthCard>
  );
}
