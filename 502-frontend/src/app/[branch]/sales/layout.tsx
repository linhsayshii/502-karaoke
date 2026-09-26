import { SalesNavBar } from "@/components/layout/SalesNavBar";

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SalesNavBar />
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </>
  );
}
