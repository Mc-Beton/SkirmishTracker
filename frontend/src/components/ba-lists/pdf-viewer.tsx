"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Download, Loader2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Pages rendered at most (a list is a few pages; a huge file should be downloaded instead). */
const MAX_PAGES = 12;
const ZOOMS = [1, 1.5, 2] as const;

type PdfDoc = import("pdfjs-dist").PDFDocumentProxy;

/**
 * In-app PDF preview with pdf.js (same on Android, iOS and desktop). The bytes come through the API with the
 * caller's rights; pages are drawn on canvases – the file is never opened by the browser itself, scripts in the PDF
 * never run, and the strict download headers of the API stay as they are. pdf.js loads only when a preview opens.
 */
export function PdfViewer({ src, fileName }: { src: string; fileName: string | null }) {
  const t = useTranslations("baLists");
  const host = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const [width, setWidth] = useState(0);

  // Load the library and the document once per file.
  useEffect(() => {
    let active = true;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      const pdfjs = await import("pdfjs-dist");
      if (!pdfjs.GlobalWorkerOptions.workerPort) {
        // The worker is bundled with the app (same origin, allowed by the CSP).
        pdfjs.GlobalWorkerOptions.workerPort = new Worker(
          new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
      }
      const res = await fetch(src, { credentials: "same-origin" });
      if (!res.ok) throw new Error(String(res.status));
      const data = new Uint8Array(await res.arrayBuffer());
      // pdf.js 6 uses no eval; WebAssembly decoders stay off (the CSP has no 'wasm-unsafe-eval').
      const loading = pdfjs.getDocument({ data, useWasm: false });
      task = loading;
      const loaded = await loading.promise;
      if (active) setDoc(loaded);
      else void loading.destroy();
    })().catch(() => active && setError(true));
    return () => {
      active = false;
      if (task) void task.destroy();
    };
  }, [src]);

  // Fit the pages to the available width (re-render on rotation / resize).
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Draw every page on its own canvas at the current zoom.
  useEffect(() => {
    const el = host.current;
    if (!doc || !el || width === 0) return;
    let cancelled = false;
    const tasks: { cancel: () => void }[] = [];
    el.replaceChildren();
    (async () => {
      const ratio = window.devicePixelRatio || 1;
      for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && !cancelled; n++) {
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const scale = (width / base.width) * zoom;
        const viewport = page.getViewport({ scale: scale * ratio });
        const canvas = document.createElement("canvas");
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / ratio)}px`;
        canvas.style.height = `${Math.floor(viewport.height / ratio)}px`;
        canvas.className = "mx-auto mb-3 block rounded border bg-white shadow-sm last:mb-0";
        canvas.setAttribute("aria-label", t("pdfPage", { n, of: doc.numPages }));
        canvas.setAttribute("role", "img");
        el.appendChild(canvas);
        const context = canvas.getContext("2d");
        if (!context) continue;
        const task = page.render({ canvas, canvasContext: context, viewport });
        tasks.push(task);
        await task.promise.catch(() => undefined);
      }
    })().catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
      tasks.forEach((task) => task.cancel());
    };
  }, [doc, width, zoom, t]);

  const zoomIndex = ZOOMS.indexOf(zoom);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label={t("zoomOut")} disabled={zoomIndex === 0}
          onClick={() => setZoom(ZOOMS[Math.max(0, zoomIndex - 1)])}><Minus aria-hidden /></Button>
        <span className="w-12 text-center text-sm tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button type="button" variant="outline" size="icon" aria-label={t("zoomIn")} disabled={zoomIndex === ZOOMS.length - 1}
          onClick={() => setZoom(ZOOMS[Math.min(ZOOMS.length - 1, zoomIndex + 1)])}><Plus aria-hidden /></Button>
        {doc && doc.numPages > MAX_PAGES && (
          <span className="text-xs text-muted-foreground">{t("pdfTruncated", { n: MAX_PAGES, of: doc.numPages })}</span>
        )}
        <Button variant="outline" size="sm" asChild className="ml-auto">
          <a href={src} download><Download aria-hidden /> {t("downloadPdf", { name: fileName ?? "PDF" })}</a>
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-muted-foreground">{t("pdfPreviewFailed")}</p>
      ) : !doc ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden /> {t("pdfLoading")}</p>
      ) : null}
      {/* Wide pages (zoomed in) scroll sideways inside this box only, never the whole page. */}
      <div className="max-h-[80vh] overflow-auto rounded-md border bg-muted p-2">
        <div ref={host} className="w-full" />
      </div>
    </div>
  );
}
