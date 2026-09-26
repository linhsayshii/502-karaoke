"use client";

import { usePathname } from "next/navigation";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { PageTitleProvider } from "@/components/layout/page-title";
import { SiteHeader } from "@/components/layout/site-header";
import { RouteGuard } from "@/components/route-guard";

// Signed-in layout (dashboard-01 / sidebar-07 pattern): collapsible inset
// sidebar, header with breadcrumb, and the page. Each page fades in when the
// path changes.
export function AppShell({ defaultOpen, children }: { defaultOpen: boolean; children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <SidebarProvider
      defaultOpen={defaultOpen}
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 14)",
        } as React.CSSProperties
      }
    >
      <AppSidebar variant="inset" />
      <SidebarInset className="min-w-0">
        <PageTitleProvider>
          <SiteHeader />
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
    </SidebarProvider>
  );
}
