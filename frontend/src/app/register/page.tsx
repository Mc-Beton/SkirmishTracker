import { getTranslations } from "next-intl/server";
import { AuthCard } from "@/components/auth/auth-card";
import { RegisterForm } from "./register-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("registerTitle") };
}

export default async function RegisterPage() {
  const t = await getTranslations("auth");
  return (
    <AuthCard title={t("registerTitle")}>
      <RegisterForm />
    </AuthCard>
  );
}
