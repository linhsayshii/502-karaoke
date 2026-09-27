"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { businessDate, firstDayOfMonth } from "@/lib/format";
import { can } from "@/lib/permissions";
import { GROUP_BYS } from "@/lib/reports";
import type { GroupBy } from "@/lib/types";

export interface ReportFilters {
  from: string;
  to: string;
  groupBy: GroupBy;
  compare: boolean;
  chain: boolean; // whole chain (chain manager only)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Report filters kept in the URL (?from&to&groupBy&compare=1&scope=chain), so
// a report can be shared as a link and survives a reload. Default: this
// month by day, this branch.
export function useReportFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();

  const filters = useMemo<ReportFilters>(() => {
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const validRange = !!from && !!to && DATE_RE.test(from) && DATE_RE.test(to) && from <= to;
    const groupBy = searchParams.get("groupBy") as GroupBy | null;
    return {
      from: validRange ? from : firstDayOfMonth(),
      to: validRange ? to : businessDate(),
      groupBy: groupBy && GROUP_BYS.includes(groupBy) ? groupBy : "day",
      compare: searchParams.get("compare") === "1",
      chain: can(user, "reports.chain") && searchParams.get("scope") === "chain",
    };
  }, [searchParams, user]);

  const setFilters = useCallback(
    (patch: Partial<ReportFilters>) => {
      const next = { ...filters, ...patch };
      const params = new URLSearchParams({ from: next.from, to: next.to, groupBy: next.groupBy });
      if (next.compare) params.set("compare", "1");
      if (next.chain) params.set("scope", "chain");
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [filters, pathname, router],
  );

  return { filters, setFilters };
}

// Query of a report request: no branch means the whole chain.
export function reportParams(branch: string, filters: ReportFilters): Record<string, string> {
  return {
    ...(filters.chain ? {} : { branch }),
    from: filters.from,
    to: filters.to,
    groupBy: filters.groupBy,
    ...(filters.compare ? { compare: "1" } : {}),
  };
}
