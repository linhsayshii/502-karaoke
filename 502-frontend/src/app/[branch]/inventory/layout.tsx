import { InventoryNavBar } from "@/components/layout/InventoryNavBar";

export default function InventoryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <InventoryNavBar />
      <main className="flex-1 bg-slate-50 p-6">{children}</main>
    </>
  );
}
