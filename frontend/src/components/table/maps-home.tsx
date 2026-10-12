"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/components/auth/auth-provider";
import { MapPicker } from "@/components/table/map-picker";

export function MapsHome() {
  const t = useTranslations("table");
  const router = useRouter();
  const { me, loading } = useAuth();
  useEffect(() => {
    if (!loading && !me) router.replace("/login");
  }, [loading, me, router]);
  return (
    <div className="mx-auto grid max-w-5xl gap-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-2xl">{t("mapsTitle")}</h1>
        <Button asChild><Link href="/maps/new"><Plus aria-hidden /> {t("newMap")}</Link></Button>
      </div>
      <p className="text-sm text-muted-foreground">{t("mapsIntro")}</p>
      <Card>
        <CardContent className="p-4">
          <MapPicker actions={(m) => (
            <Button asChild size="sm" variant="outline"><Link href={`/maps/${m.id}`}>{m.mine ? t("edit") : t("open")}</Link></Button>
          )} />
        </CardContent>
      </Card>
    </div>
  );
}
