import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PanelShell } from "@/components/panelshell";
import { CashflowView } from "@/components/cashflow";

export const dynamic = "force-dynamic";

export default async function PanelCashflow({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <PanelShell panel={panel} user={user}>
      <CashflowView userId={user.id} sp={searchParams} base={`/cua-hang/${panel.slug}/giao-dich`} />
    </PanelShell>
  );
}
