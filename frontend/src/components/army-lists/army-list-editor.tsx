"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { ListBuilder } from "@/components/warbands/list-builder";
import { api } from "@/lib/api";
import { listLabel, MAX_LIST_NAME, toWarbandInput, type ArmyList, type ArmyListInput } from "@/lib/army-lists";
import type { ListFormat } from "@/lib/tournaments";
import { useArmies, type WarbandInput } from "@/lib/warbands";

/** Creates (listId null) or edits a saved list: name, Classic/Roster and the same builder as tournament lists. */
export function ArmyListEditor({ listId }: { listId: string | null }) {
  const t = useTranslations("lists");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const armies = useArmies();
  const { me, loading } = useAuth();
  const [list, setList] = useState<ArmyList | null>(null);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<ListFormat>("CLASSIC");
  const [error, setError] = useState<string | null>(null);
  // Latest content, so switching Classic/Roster (which remounts the builder) keeps unsaved changes.
  const [draft, setDraft] = useState<WarbandInput | null>(null);
  const onChange = useCallback((b: WarbandInput) => setDraft(b), []);

  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);

  useEffect(() => {
    if (!me || !listId) return;
    let active = true;
    api<ArmyList>("GET", `/api/army-lists/${listId}`)
      .then((l) => {
        if (!active) return;
        setList(l);
        setName(l.name ?? "");
        setFormat(l.format);
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [me, listId, errorMessage]);

  async function save(body: WarbandInput) {
    const input: ArmyListInput = { name: name.trim() || null, format, list: body };
    if (list) {
      setList(await api<ArmyList>("PUT", `/api/army-lists/${list.id}`, input));
    } else {
      const created = await api<ArmyList>("POST", "/api/army-lists", input);
      router.replace(`/lists/${created.id}`);
    }
  }

  const back = (
    <Link href="/lists" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> {t("title")}
    </Link>
  );
  if (!armies || !me || (listId && !list)) {
    return (
      <div className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-10">
        {back}
        {error && <Alert variant="destructive">{error}</Alert>}
      </div>
    );
  }

  const roster = format === "ROSTER";
  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-10 [&>*]:min-w-0">
      {back}
      <header className="grid gap-1">
        <h1 className="font-display text-3xl">{list ? listLabel({ number: list.number, name: list.name }) : t("new")}</h1>
        {list?.pointsChanged && <p className="text-sm text-amber-600">{t("pointsChangedLong")}</p>}
      </header>
      {error && <Alert variant="destructive">{error}</Alert>}
      {/* Changing the format remounts the builder: the leader exists only in classic lists. */}
      <ListBuilder key={`${list?.id ?? "new"}-${format}`} armies={armies} roster={roster} limit={null}
        initial={draft ?? (list ? toWarbandInput(list) : null)}
        rosterNote={t("rosterNote")} onSave={save} onChange={onChange}
        aside={
          <div className="grid gap-3 border-b pb-4">
            <div className="grid gap-1.5">
              <Label htmlFor="list-name">{t("name")}</Label>
              <Input id="list-name" maxLength={MAX_LIST_NAME} placeholder={t("namePlaceholder")} value={name}
                onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="list-format">{t("format")}</Label>
              <NativeSelect id="list-format" value={format} onChange={(e) => setFormat(e.target.value as ListFormat)}>
                <option value="CLASSIC">{t("formats.CLASSIC")}</option>
                <option value="ROSTER">{t("formats.ROSTER")}</option>
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{t(roster ? "formatHintRoster" : "formatHintClassic")}</p>
            </div>
          </div>
        }
        saveHint={t("saveHint")} />
    </div>
  );
}
