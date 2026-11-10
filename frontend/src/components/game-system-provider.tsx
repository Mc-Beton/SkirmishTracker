"use client";

import { createContext, useCallback, useContext, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { setGameSystem } from "@/lib/game-system-actions";
import { isEldfallOnlyPath, themeColorOf, themeOf, type GameSystem } from "@/lib/game-system";

type Ctx = { system: GameSystem; switching: boolean; switchTo: (next: GameSystem) => void };

const GameSystemContext = createContext<Ctx | null>(null);

/** The game system chosen under the logo; pages filter tournaments, leagues and the ranking by it. */
export function GameSystemProvider({ initial, children }: { initial: GameSystem; children: React.ReactNode }) {
  const [system, setSystem] = useState<GameSystem>(initial);
  const [switching, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  const switchTo = useCallback((next: GameSystem) => {
    if (next === system) return;
    setSystem(next);
    // Swap the theme at once; the cookie keeps it for the next visit and the server render.
    const html = document.documentElement;
    html.dataset.system = themeOf(next);
    html.classList.toggle("dark", next === "ELDFALL");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", themeColorOf(next));
    startTransition(async () => {
      await setGameSystem(next);
      if (next !== "ELDFALL" && isEldfallOnlyPath(pathname)) router.push("/tournaments");
      else router.refresh();
    });
  }, [system, pathname, router]);

  return <GameSystemContext.Provider value={{ system, switching, switchTo }}>{children}</GameSystemContext.Provider>;
}

export function useGameSystem(): Ctx {
  const ctx = useContext(GameSystemContext);
  if (!ctx) throw new Error("useGameSystem outside GameSystemProvider");
  return ctx;
}
