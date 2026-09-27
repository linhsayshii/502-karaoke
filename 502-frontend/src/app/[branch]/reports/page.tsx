import { redirect } from "next/navigation";

// The reports start at Doanh thu.
export default async function Page({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/reports/revenue`);
}
