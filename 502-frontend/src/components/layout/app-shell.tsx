"use client";

import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { LiveEventsProvider } from "@/components/live-events-provider";
import { PageTitleProvider } from "@/components/layout/page-title";
import { SiteProvider } from "@/components/layout/site-context";
import { SiteHeader } from "@/components/layout/site-header";
import { RouteGuard } from "@/components/route-guard";
import type { Site } from "@/lib/site";

// Signed-in layout (dashboard-01 / sidebar-07 pattern): collapsible inset
// sidebar, header with breadcrumb, and the page. Each page fades in when the
// path changes.
// A room (/<branch>/sales/rooms/<id>) is the cashier's work screen: it takes
// the whole window, without the sidebar and the header (the page has its own
// way back to the room map).
const FULL_SCREEN = /^\/[^/]+\/sales\/rooms\/[^/]+$/;

export function AppShell({
  defaultOpen,
  site = "main",
  children,
}: {
  defaultOpen: boolean;
  site?: Site;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const fullScreen = FULL_SCREEN.test(pathname);
  const shell = (
    <>
      {!fullScreen && <AppSidebar variant="inset" />}
      <SidebarInset className="min-w-0">
        <PageTitleProvider>
          {!fullScreen && <SiteHeader />}
          <div className="@container/main flex flex-1 flex-col">
            <RouteGuard>
              <div
                key={pathname}
                className="flex flex-1 flex-col gap-4 p-4 animate-in duration-300 ease-out fade-in-0 slide-in-from-bottom-2 motion-reduce:animate-none md:gap-6 md:p-6"
              >
                {children}
              </div>
            </RouteGuard>
          </div>
        </PageTitleProvider>
      </SidebarInset>
    </>
  );

  return (
    <SiteProvider value={site}>
      <SidebarProvider
        defaultOpen={defaultOpen}
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 64)",
            "--header-height": "calc(var(--spacing) * 14)",
          } as React.CSSProperties
        }
      >
        {/* The report site has no live screen (spec 2026-10-02 §7.3): no socket. */}
        {site === "main" ? <LiveEventsProvider>{shell}</LiveEventsProvider> : shell}
      </SidebarProvider>
    </SiteProvider>
  );
}
