import { getTranslations } from "next-intl/server";
import { CalendarView } from "./calendar-view";

export async function generateMetadata() {
  const t = await getTranslations("calendar");
  return { title: t("title") };
}

export default function CalendarPage() {
  return <CalendarView />;
}
