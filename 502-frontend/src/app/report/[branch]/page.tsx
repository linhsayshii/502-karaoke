import { redirect } from "next/navigation";

// A browser path, without /report: the host keeps it on the report site.
export default async function ReportBranchHome({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/sales/bills`);
}
