import { TopBar } from "@/components/layout/TopBar";
import { RouteGuard } from "@/components/route-guard";

export default function BranchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 flex flex-col">
        <RouteGuard>{children}</RouteGuard>
      </div>
    </div>
  );
}
