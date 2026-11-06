import { redirect } from "next/navigation";

export default function Page({ params }: { params: { slug: string } }) {
  redirect(`/dashboard/bai-viet/${params.slug}`);
}
