import { redirect } from "next/navigation";

// Tồn kho is now a report (Báo cáo › Tồn kho).
export default async function Page({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/reports/stock`);
}
