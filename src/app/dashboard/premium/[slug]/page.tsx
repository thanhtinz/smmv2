import { PremiumDetailView } from "@/components/premium-views";

export const dynamic = "force-dynamic";

/** Chi tiết Premium trong khu khách — cùng khung dashboard với SMM. */
export default async function DashboardPremiumDetail({ params, searchParams }: { params: { slug: string }; searchParams: { msg?: string; err?: string } }) {
  return <PremiumDetailView slug={params.slug} searchParams={searchParams} base="/dashboard/premium" />;
}
