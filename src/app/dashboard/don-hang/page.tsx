import { getCurrentUser } from "@/lib/auth";
import { SmmOrdersView } from "@/components/orders";

export const dynamic = "force-dynamic";

export default async function MySmmOrders({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const user = (await getCurrentUser())!;
  return <SmmOrdersView userId={user.id} sp={searchParams} />;
}
