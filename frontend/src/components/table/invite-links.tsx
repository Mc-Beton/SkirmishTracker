"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { InviteKind } from "@/lib/table/api";

/** A link to copy, labelled by who it is for. */
export function InviteLink({ kind, link }: { kind: InviteKind; link: string }) {
  const t = useTranslations("table");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium">{t(`inviteFor.${kind}`)}</span>
      <div className="flex gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted p-2 text-xs select-all">{link}</code>
        <Button size="sm" variant="outline" onClick={() => void copy()}><Copy aria-hidden /> {copied ? t("copied") : t("copy")}</Button>
      </div>
    </div>
  );
}
