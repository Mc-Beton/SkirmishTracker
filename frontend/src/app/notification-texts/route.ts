// Notification texts for the service worker (push messages are formatted on the device, in the user's language).
import en from "../../../messages/en.json";
import pl from "../../../messages/pl.json";

export const dynamic = "force-static";

export function GET() {
  const pick = (m: typeof pl) => ({ title: m.app.name, types: { ...m.notifications.types, TEST: m.push.testMessage } });
  return Response.json({ pl: pick(pl), en: pick(en as typeof pl) }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
