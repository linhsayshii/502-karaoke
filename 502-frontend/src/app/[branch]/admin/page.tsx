import { redirect } from "next/navigation";

export default async function AdminPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/admin/users`);
}
