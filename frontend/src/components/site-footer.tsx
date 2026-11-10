import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { SYSTEM_COOKIE } from "@/lib/game-system";
import { APP_VERSION } from "@/lib/version";

/** Fan-project notice, support and terms links, app version – on every page. */
export async function SiteFooter() {
  const t = await getTranslations("footer");
  const boltAction = (await cookies()).get(SYSTEM_COOKIE)?.value === "BOLT_ACTION";
  const link = "text-primary/90 underline underline-offset-2 hover:text-primary";
  return (
    <footer className="mt-auto border-t bg-[var(--chrome)]">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-4 text-xs text-muted-foreground">
        <p className="w-full sm:w-auto">{boltAction ? t("disclaimerBoltAction") : t("disclaimer")}</p>
        <Link href="/support" className={link}>{t("support")}</Link>
        <span aria-hidden>·</span>
        <Link href="/terms" className={link}>{t("terms")}</Link>
        <span aria-hidden>·</span>
        <span>v{APP_VERSION}</span>
      </div>
    </footer>
  );
}
