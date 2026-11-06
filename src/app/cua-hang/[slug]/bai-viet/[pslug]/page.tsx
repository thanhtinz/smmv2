import { redirect } from "next/navigation";

export default function Page({ params }: { params: { pslug: string } }) {
  redirect(`/dashboard/bai-viet/${params.pslug}`);
}
