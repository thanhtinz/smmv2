import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { PremiumOrdersView } from "@/components/orders";

export const dynamic = "force-dynamic";

export default async function MyPremiumOrders({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <PremiumOrdersView userId={user.id} sp={searchParams} base="/dashboard/don-premium" />;
}
