"use client";

import { InfoPopover } from "@/components/info-popover";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  /** Short context shown under the title (branch, live session details). */
  description?: React.ReactNode;
  /** How the page works; hidden behind the ⓘ button next to the title. */
  info?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

// Title row of a page: heading with its ⓘ explanation, one line of context, main actions.
export function PageHeader({ title, description, info, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 md:flex-row md:items-end md:justify-between", className)}>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex items-center gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {info && <InfoPopover>{info}</InfoPopover>}
        </div>
        {description && <p className="text-sm text-pretty text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:flex-nowrap">{actions}</div>}
    </div>
  );
}
