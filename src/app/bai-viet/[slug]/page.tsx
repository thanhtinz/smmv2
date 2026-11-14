import { redirect } from "next/navigation";

export default async function Page( { params: paramsPromise }: { params: Promise<{ slug: string }> }) {
  const params = await paramsPromise;
  redirect(`/dashboard/bai-viet/${params.slug}`);
}
