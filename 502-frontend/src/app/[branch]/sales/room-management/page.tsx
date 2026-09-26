import { redirect } from "next/navigation";

// Old address; the screen now lives at /sales/rooms.
export default async function Page({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params;
  redirect(`/${branch}/sales/rooms`);
}
