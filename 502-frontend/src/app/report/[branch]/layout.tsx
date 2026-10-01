import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";

// The report site's signed-in shell (spec 2026-10-02-trang-bao-cao-hddt §7.3).
export default async function ReportBranchLayout({ children }: { children: React.ReactNode }) {
  // Keep the sidebar open/collapsed as the user left it (cookie set by SidebarProvider).
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return (
    <AppShell defaultOpen={defaultOpen} site="report">
      {children}
    </AppShell>
  );
}
