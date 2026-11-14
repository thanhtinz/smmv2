import { PremiumDetailView } from "@/components/premium-views";

export const dynamic = "force-dynamic";

/** Chi tiết Premium trong khu khách — cùng khung dashboard với SMM. */
export default async function DashboardPremiumDetail( { params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ slug: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const params = await paramsPromise;
  const searchParams = await searchParamsPromise;
  return <PremiumDetailView slug={params.slug} searchParams={searchParams} base="/dashboard/premium" />;
}
