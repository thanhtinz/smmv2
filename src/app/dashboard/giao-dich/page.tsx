import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { CashflowView } from "@/components/cashflow";

export const dynamic = "force-dynamic";

export default async function TransactionsPage( { searchParams: searchParamsPromise }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const searchParams = await searchParamsPromise;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <CashflowView userId={user.id} sp={searchParams} base="/dashboard/giao-dich" />;
}
