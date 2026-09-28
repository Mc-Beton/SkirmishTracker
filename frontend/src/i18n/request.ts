import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

// Locale comes from a cookie (set by the language switcher), falling back to the browser language.
export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  let locale: Locale = defaultLocale;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    const accept = (await headers()).get("accept-language") ?? "";
    if (/^en\b/i.test(accept)) locale = "en";
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
