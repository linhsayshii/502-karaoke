"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { useBranchCode } from "@/lib/branch";
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
// month by day (or `defaults.groupBy`), this branch.
export function useReportFilters(defaults: { groupBy?: GroupBy } = {}) {
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
      groupBy: groupBy && GROUP_BYS.includes(groupBy) ? groupBy : (defaults.groupBy ?? "day"),
      compare: searchParams.get("compare") === "1",
      chain: can(user, "reports.chain") && searchParams.get("scope") === "chain",
    };
  }, [searchParams, user, defaults.groupBy]);

  const setFilters = useCallback(
    (patch: Partial<ReportFilters>) => {
      const next = { ...filters, ...patch };
      // Starts from the current URL so a report's own options (?role, ?by,
      // ?metric) are kept.
      const params = new URLSearchParams(searchParams);
      params.set("from", next.from);
      params.set("to", next.to);
      params.set("groupBy", next.groupBy);
      if (next.compare) params.set("compare", "1");
      else params.delete("compare");
      if (next.chain) params.set("scope", "chain");
      else params.delete("scope");
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [filters, pathname, router, searchParams],
  );

  return { filters, setFilters };
}

// An option of one report, kept in the URL next to the filters (?role=cskh);
// `fallback` when it is missing or unknown.
export function useReportOption<T extends string>(name: string, options: readonly T[], fallback: T) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = searchParams.get(name);
  const value = options.find((option) => option === current) ?? fallback;

  const setValue = useCallback(
    (next: T) => {
      const params = new URLSearchParams(searchParams);
      params.set(name, next);
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [name, pathname, router, searchParams],
  );

  return [value, setValue] as const;
}

// Query of a report over time: no branch means the whole chain.
export function reportParams(branch: string, filters: ReportFilters): Record<string, string> {
  return {
    ...rangeParams(branch, filters),
    groupBy: filters.groupBy,
    ...(filters.compare ? { compare: "1" } : {}),
  };
}

// Query of a report that is not a time series (no periods, no comparison).
export function rangeParams(branch: string, filters: ReportFilters): Record<string, string> {
  return { ...(filters.chain ? {} : { branch }), from: filters.from, to: filters.to };
}

// Scope of the data shown. It is read from the response, since the filters
// may already be ahead of it while a request is in flight or after it failed.
export function useReportScope(data: { branchId: number | null } | null) {
  const branch = useBranchCode();
  const { branches } = useAuth();
  const chain = data?.branchId === null;
  return {
    chain,
    name: !data ? "" : chain ? "Toàn chuỗi" : (branches.find((b) => b.code === branch)?.name ?? branch.toUpperCase()),
    // Scope part of an export's file name.
    fileScope: chain ? "toan-chuoi" : branch,
  };
}
