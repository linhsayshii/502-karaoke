import { redirect } from "next/navigation";

export default async function InventoryPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/inventory/documents`);
}
