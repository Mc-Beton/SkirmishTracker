import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { APP_VERSION } from "@/lib/version";

/** Fan-project notice, support and terms links, app version – on every page. */
export async function SiteFooter() {
  const t = await getTranslations("footer");
  const link = "text-primary/90 underline underline-offset-2 hover:text-primary";
  return (
    <footer className="mt-auto border-t bg-[#070b18]/80">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-4 text-xs text-muted-foreground">
        <p className="w-full sm:w-auto">{t("disclaimer")}</p>
        <Link href="/support" className={link}>{t("support")}</Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className={link}>{t("terms")}</Link>
        <span aria-hidden>·</span>
        <span>v{APP_VERSION}</span>
      </div>
    </footer>
  );
}
