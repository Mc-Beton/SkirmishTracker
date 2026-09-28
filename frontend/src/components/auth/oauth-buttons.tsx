import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

// Plain links: the browser must navigate (full page) so the backend can redirect to the provider.
export function OAuthButtons() {
  const t = useTranslations("auth");
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        {t("orContinueWith")}
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" asChild>
          <a href="/oauth2/authorization/google">{t("google")}</a>
        </Button>
        <Button variant="outline" asChild>
          <a href="/oauth2/authorization/discord">{t("discord")}</a>
        </Button>
      </div>
    </div>
  );
}
