"use client";

import { usePathname } from "next/navigation";
import { canOpenBranch, useAuth } from "@/components/auth-provider";
import { useSite } from "@/components/layout/site-context";
import { canUseReportSite, canVisit } from "@/lib/permissions";
import { Forbidden } from "@/components/forbidden";

// Renders a /[branch]/... page only when the account may open that branch
// and that page. (AuthProvider redirects wrong-branch URLs.)
export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const site = useSite();
  const { user, branches } = useAuth();
  if (!user) return null;
  // AuthProvider signs out an account that may not use the report site.
  if (site === "report" && !canUseReportSite(user)) return null;

  const [, code, ...rest] = pathname.split("/");
  if (!canOpenBranch(user, branches, code)) return null;
  if (!canVisit(user, `/${rest.join("/")}`, site)) return <Forbidden />;
  return <>{children}</>;
}
