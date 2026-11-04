import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PanelShell } from "@/components/panelshell";
import { SmmOrdersView } from "@/components/orders";

export const dynamic = "force-dynamic";

export default async function PanelSmmOrders({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <PanelShell panel={panel} user={user}>
      <SmmOrdersView userId={user.id} sp={searchParams} />
    </PanelShell>
  );
}
