import { redirect } from "next/navigation";
import { SiteFooter, PublicHeader } from "@/components/site";
import { PremiumDetailView } from "@/components/premium-views";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Chi tiết Premium công khai. Đã đăng nhập -> bản trong khu khách để đồng bộ khung SMM. */
export default async function PremiumDetail({ params, searchParams }: { params: { slug: string }; searchParams: { msg?: string; err?: string } }) {
  const session = await getSession();
  if (session) redirect(`/dashboard/premium/${params.slug}`);
  return (
    <div className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 max-w-5xl mx-auto px-4 py-12 w-full">
        <PremiumDetailView slug={params.slug} searchParams={searchParams} base="/premium" />
      </main>
      <SiteFooter />
    </div>
  );
}
