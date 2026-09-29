"use client";

import { InfoIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// ⓘ button next to a title that opens its explanation, so long help text stays out of the layout.
export function InfoPopover({ children }: { children: React.ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground">
          <InfoIcon />
          <span className="sr-only">Thông tin</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)] text-sm text-pretty">
        {children}
      </PopoverContent>
    </Popover>
  );
}
