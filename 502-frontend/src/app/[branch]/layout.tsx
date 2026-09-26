import { cookies } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";

export default async function BranchLayout({ children }: { children: React.ReactNode }) {
  // Keep the sidebar open/collapsed as the user left it (cookie set by SidebarProvider).
  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";
  return <AppShell defaultOpen={defaultOpen}>{children}</AppShell>;
}
