"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/auth-provider";
import { TournamentForm } from "@/components/tournaments/tournament-form";
import { api } from "@/lib/api";
import type { TournamentInput } from "@/lib/tournaments";

export function NewTournament() {
  const t = useTranslations("tournaments.form");
  const router = useRouter();
  const { me, loading } = useAuth();

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  if (!me) return null;

  async function create(input: TournamentInput) {
    const { id } = await api<{ id: string }>("POST", "/api/tournaments", input);
    router.push(`/tournaments/${id}/manage?created=1`);
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10">
      <h1 className="font-display text-3xl">{t("createTitle")}</h1>
      <TournamentForm submitLabel={t("create")} onSubmit={create} />
    </div>
  );
}
