"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/auth-provider";
import { LeagueForm } from "@/components/leagues/league-form";
import { api } from "@/lib/api";
import type { LeagueSettings } from "@/lib/leagues";

export function NewLeague() {
  const t = useTranslations("leagues");
  const router = useRouter();
  const { me, loading } = useAuth();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  if (!me) return null;

  async function create(s: LeagueSettings) {
    const { id } = await api<{ id: string }>("POST", "/api/leagues", s);
    router.push(`/leagues/${id}`);
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <h1 className="font-display text-3xl">{t("create")}</h1>
      <LeagueForm submitLabel={t("form.create")} onSubmit={create} />
    </div>
  );
}
