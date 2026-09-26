import { redirect } from "next/navigation";

// Old overview screen; revenue now lives under Thống kê.
export default async function OverviewPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/sales/statistics`);
}
