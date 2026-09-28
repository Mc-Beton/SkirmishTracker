import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("resetTitle")}>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
