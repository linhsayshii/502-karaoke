"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDaysIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/components/auth-provider";
import { useCurrentPageTitle } from "@/components/layout/page-title";
import { ThemeToggle } from "@/components/theme-toggle";
import { useBranchCode } from "@/lib/branch";
import { businessDate } from "@/lib/format";
import { findNav } from "@/lib/navigation";

// The business day on screen changes at 06:00, not at midnight.
function useBusinessDay() {
  const [day, setDay] = useState(() => businessDate());
  useEffect(() => {
    const timer = setInterval(() => setDay(businessDate()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const [year, month, date] = day.split("-");
  return { short: `${date}/${month}`, full: `${date}/${month}/${year}` };
}

// Pinned to the top while the page scrolls.
export function SiteHeader() {
  const { user } = useAuth();
  const branch = useBranchCode();
  const pathname = usePathname();
  const pageTitle = useCurrentPageTitle();
  const nav = findNav(pathname.replace(/^\/[^/]+/, ""), user);
  const day = useBusinessDay();

  return (
    <header className="sticky top-0 z-20 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 transition-[width,height] ease-linear md:rounded-t-xl">
      <div className="flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
        {nav && (
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap">
              <BreadcrumbItem className="hidden md:block">{nav.group.label}</BreadcrumbItem>
              <BreadcrumbSeparator className="hidden md:block" />
              {pageTitle ? (
                <>
                  <BreadcrumbItem className="hidden sm:block">
                    <BreadcrumbLink asChild>
                      <Link href={`/${branch}${nav.item.path}`}>{nav.item.title}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden sm:block" />
                  <BreadcrumbItem className="min-w-0">
                    <BreadcrumbPage className="truncate">{pageTitle}</BreadcrumbPage>
                  </BreadcrumbItem>
                </>
              ) : (
                <BreadcrumbItem className="min-w-0">
                  <BreadcrumbPage className="truncate">{nav.item.title}</BreadcrumbPage>
                </BreadcrumbItem>
              )}
            </BreadcrumbList>
          </Breadcrumb>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <Badge
            variant="outline"
            className="hidden gap-1.5 sm:inline-flex"
            title={`Ngày kinh doanh ${day.full} (06:00 → 06:00 sáng hôm sau)`}
          >
            <CalendarDaysIcon />
            Ngày KD {day.short}
          </Badge>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
