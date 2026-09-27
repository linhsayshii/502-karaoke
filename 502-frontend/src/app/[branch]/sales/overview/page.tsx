import { redirect } from "next/navigation";

// Old address; the revenue report now lives at /reports/revenue.
export default async function OverviewPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/reports/revenue`);
}
