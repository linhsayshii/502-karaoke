import { AdminNavBar } from "@/components/layout/AdminNavBar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminNavBar />
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </>
  );
}
