import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PanelShell } from "@/components/panelshell";
import { PremiumOrdersView } from "@/components/orders";

export const dynamic = "force-dynamic";

export default async function PanelPremiumOrders({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <PanelShell panel={panel} user={user}>
      <PremiumOrdersView userId={user.id} sp={searchParams} base={`/cua-hang/${panel.slug}/don-premium`} />
    </PanelShell>
  );
}
