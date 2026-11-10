"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { ArrowLeft, Eye, Lock, Paperclip, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth/auth-provider";
import { useErrorMessage } from "@/components/auth/use-error-message";
import { ListStatusBadge } from "@/components/warbands/list-status-badge";
import { api } from "@/lib/api";
import { BA_NATIONS } from "@/lib/game-system";
import { baListPath, MAX_LIST_TEXT, MAX_PDF_BYTES, type BaList, type BaListInput, type MyBaList } from "@/lib/ba-lists";
import type { TournamentDetail } from "@/lib/tournaments";
import { useNationName } from "./nation-name";
import { PdfViewer } from "./pdf-viewer";

type Loaded = {
  tournament: TournamentDetail;
  list: BaList | null;
  editable: boolean;
};

type Form = { nation: string; points: string; orderDice: string; platoons: string; text: string };

const toForm = (l: BaList | null): Form => ({
  nation: l?.nation ?? "",
  points: l?.points.toString() ?? "",
  orderDice: l?.orderDice.toString() ?? "",
  platoons: l?.platoons.toString() ?? "",
  text: l?.text ?? "",
});

/**
 * Bolt Action list: nation, declared points / order dice / platoons, the list pasted as text and/or attached as a
 * PDF. Without `userId` the caller's own list; with `userId` another player's (read-only, or editable for the
 * organizer).
 */
export function BaListEditor({ tournamentId, userId }: { tournamentId: string; userId?: string }) {
  const t = useTranslations("baLists");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const nation = useNationName();
  const { me } = useAuth();
  const [data, setData] = useState<Loaded | null>(null);
  const [form, setForm] = useState<Form>(toForm(null));
  const [pdf, setPdf] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const who = userId ?? "me";

  useEffect(() => {
    let active = true;
    const detail = api<TournamentDetail>("GET", `/api/tournaments/${tournamentId}`);
    const list = userId
      ? api<BaList>("GET", baListPath(tournamentId, userId)).then((l) => ({ list: l, editable: l.editable }))
      : api<MyBaList>("GET", baListPath(tournamentId, "me")).then((m) => ({ list: m.list, editable: m.editable }));
    Promise.all([detail, list])
      .then(([tournament, l]) => {
        if (!active) return;
        setData({ tournament, ...l });
        setForm(toForm(l.list));
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [tournamentId, userId, me?.id, errorMessage]);

  const back = (
    <Link href={`/tournaments/${tournamentId}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" aria-hidden /> {data?.tournament.name ?? t("backToTournament")}
    </Link>
  );
  if (!data) {
    return <div className="mx-auto grid w-full max-w-3xl gap-4 px-4 py-10">{back}{error && <Alert variant="destructive">{error}</Alert>}</div>;
  }

  const { tournament, list, editable } = data;
  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pdf && pdf.size > MAX_PDF_BYTES) {
      setError(t("pdfTooLarge"));
      return;
    }
    if (!form.text.trim() && !pdf && !list?.pdfName) {
      setError(t("needTextOrPdf"));
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const input: BaListInput = {
        nation: form.nation,
        points: Number(form.points),
        orderDice: Number(form.orderDice),
        platoons: Number(form.platoons),
        text: form.text.trim() ? form.text : null,
      };
      let saved = await api<BaList>("PUT", baListPath(tournamentId, who), input);
      if (pdf) {
        // The raw PDF goes as the body; the server checks the signature, not the name.
        saved = await api<BaList>("PUT", `${baListPath(tournamentId, who)}/pdf?name=${encodeURIComponent(pdf.name)}`, pdf);
        setPdf(null);
      }
      setData((d) => d && { ...d, list: saved });
      setNotice(t("saved"));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function removePdf() {
    if (!window.confirm(t("confirmRemovePdf"))) return;
    setBusy(true);
    setError(null);
    try {
      const saved = await api<BaList>("DELETE", `${baListPath(tournamentId, who)}/pdf`);
      setData((d) => d && { ...d, list: saved });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const ownerId = userId ?? me?.id;
  const pdfHref = list?.pdfName && ownerId ? `${baListPath(tournamentId, ownerId)}/pdf` : null;
  const limits = [
    tournament.pointsLimit != null && t("limitPoints", { n: tournament.pointsLimit }),
    tournament.maxOrderDice != null && t("limitDice", { n: tournament.maxOrderDice }),
    tournament.maxPlatoons != null && t("limitPlatoons", { n: tournament.maxPlatoons }),
  ].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6 px-4 py-10 [&>*]:min-w-0">
      {back}
      <header className="grid gap-2">
        <h1 className="flex flex-wrap items-center gap-3 font-display text-3xl">
          {userId ? t("listOf", { name: list?.displayName ?? "" }) : t("myList")}
          {list && <ListStatusBadge status={list.status} />}
        </h1>
        {limits && <p className="text-sm text-muted-foreground">{t("limits")}: {limits}</p>}
        {tournament.listDeadline && (
          <p className="text-sm text-muted-foreground">
            {t("deadline", { at: format.dateTime(new Date(tournament.listDeadline), { dateStyle: "medium", timeStyle: "short" }) })}
          </p>
        )}
      </header>

      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {!editable && (
        <Alert><Lock className="mr-2 inline size-4" aria-hidden />{list ? t("locked") : t("none")}</Alert>
      )}

      {editable ? (
        <form method="post" onSubmit={save} className="grid gap-6">
          <Card>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="nation">{t("nation")}</Label>
                <NativeSelect id="nation" required value={form.nation} onChange={set("nation")}>
                  <option value="" disabled>{t("pickNation")}</option>
                  {BA_NATIONS.map((n) => <option key={n} value={n}>{nation(n)}</option>)}
                </NativeSelect>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <NumField id="points" label={t("points")} value={form.points} onChange={set("points")}
                  max={tournament.pointsLimit ?? 100000} />
                <NumField id="orderDice" label={t("orderDice")} value={form.orderDice} onChange={set("orderDice")}
                  max={tournament.maxOrderDice ?? 100} />
                <NumField id="platoons" label={t("platoons")} value={form.platoons} onChange={set("platoons")}
                  max={tournament.maxPlatoons ?? 20} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="text">{t("text")}</Label>
                <Textarea id="text" rows={14} maxLength={MAX_LIST_TEXT} value={form.text} onChange={set("text")}
                  placeholder={t("textPlaceholder")} className="font-mono text-sm" />
                <p className="text-xs text-muted-foreground">{t("textHint")}</p>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="pdf">{t("pdf")}</Label>
                {list?.pdfName && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Paperclip className="size-4" aria-hidden />
                    {pdfHref ? <a href={pdfHref} className="text-primary hover:underline" download>{list.pdfName}</a> : list.pdfName}
                    {list.pdfSize != null && <span className="text-muted-foreground">({Math.ceil(list.pdfSize / 1024)} KB)</span>}
                    {pdfHref && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setPreview((v) => !v)}>
                        <Eye aria-hidden /> {preview ? t("hidePreview") : t("showPreview")}
                      </Button>
                    )}
                    <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={removePdf}>
                      <Trash2 aria-hidden /> {t("removePdf")}
                    </Button>
                  </div>
                )}
                {preview && pdfHref && <PdfViewer key={list?.updatedAt} src={pdfHref} fileName={list?.pdfName ?? null} />}
                <Input id="pdf" type="file" accept="application/pdf,.pdf"
                  onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
                <p className="text-xs text-muted-foreground">{list?.pdfName ? t("pdfReplaceHint") : t("pdfHint")}</p>
              </div>
            </CardContent>
          </Card>
          <Button type="submit" disabled={busy} className="justify-self-start">{t("save")}</Button>
        </form>
      ) : list && (
        <Card>
          <CardContent className="grid gap-4">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Fact label={t("nation")} value={nation(list.nation)} />
              <Fact label={t("points")} value={String(list.points)} />
              <Fact label={t("orderDice")} value={String(list.orderDice)} />
              <Fact label={t("platoons")} value={String(list.platoons)} />
            </dl>
            {/* Plain text only: rendered as text, never as HTML. */}
            {list.text && <pre className="overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">{list.text}</pre>}
            {/* Organizer review / opponents: the PDF is shown right here (download button inside). */}
            {pdfHref && <PdfViewer key={list.updatedAt} src={pdfHref} fileName={list.pdfName} />}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NumField({ id, label, value, onChange, max }: {
  id: string; label: string; value: string; max: number;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" required min={0} max={max} value={value} onChange={onChange} />
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
