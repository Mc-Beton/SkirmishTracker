"use server";

import { cookies } from "next/headers";
import { isGameSystem, SYSTEM_COOKIE } from "./game-system";

/** Remembers the chosen game system for a year (not a secret: readable by the page, SameSite=Lax). */
export async function setGameSystem(system: string) {
  if (!isGameSystem(system)) return;
  (await cookies()).set(SYSTEM_COOKIE, system, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
