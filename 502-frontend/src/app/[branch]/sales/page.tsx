import { redirect } from "next/navigation";

export default async function SalesPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/sales/rooms`);
}
