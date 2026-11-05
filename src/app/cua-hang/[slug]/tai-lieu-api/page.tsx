import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { PanelShell } from "@/components/panelshell";
import { ApiDocsView } from "@/components/apidocs";

export const dynamic = "force-dynamic";

export default async function PanelApiDocs({ params }: { params: { slug: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  if (!(await moduleOn("api", panel.id))) notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <PanelShell panel={panel} user={user}>
      <ApiDocsView apiKey={user.apiKey} />
    </PanelShell>
  );
}
