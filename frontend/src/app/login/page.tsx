import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("loginTitle") };
}

export default async function LoginPage() {
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("loginTitle")}>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  );
}
