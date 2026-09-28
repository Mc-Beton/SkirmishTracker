import * as React from "react";
import { cn } from "@/lib/utils";

/** Styled native <select>: accessible and mobile-friendly without extra JS. */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "h-9 w-full rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
