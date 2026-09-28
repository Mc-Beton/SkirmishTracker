"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A card whose body folds away under its title (native details/summary: keyboard and screen-reader friendly).
 * The open state is kept by the component; `defaultOpen` only sets the starting state.
 */
export function CollapsibleCard({ title, meta, defaultOpen = false, className, contentClassName, children }: {
  title: React.ReactNode;
  /** Extra line next to / under the title (status, timer…), visible also when folded. */
  meta?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}
      className={cn("group rounded-xl border bg-card text-card-foreground shadow-sm", className)}>
      <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 sm:px-6 sm:py-5 [&::-webkit-details-marker]:hidden">
        <span className="grid min-w-0 flex-1 gap-1.5">
          <span className="font-display text-xl leading-tight">{title}</span>
          {meta && <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">{meta}</span>}
        </span>
        <ChevronDown aria-hidden
          className="mt-1 size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className={cn("px-4 pb-5 sm:px-6 sm:pb-6", contentClassName)}>{children}</div>
    </details>
  );
}

/** The same folding for a section inside a form or a card (lighter, no card frame). */
export function CollapsibleSection({ title, defaultOpen = false, className, children }: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)} className={cn("group", className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 py-1 font-display text-lg [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">{title}</span>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="grid gap-4 pt-3">{children}</div>
    </details>
  );
}
