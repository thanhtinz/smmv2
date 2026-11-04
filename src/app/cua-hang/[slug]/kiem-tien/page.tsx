import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PanelShell } from "@/components/panelshell";
import { KiemTienView } from "@/components/kiemtien";

export const dynamic = "force-dynamic";

export default async function PanelEarn({ params }: { params: { slug: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return (
    <PanelShell panel={panel} user={user}>
      <KiemTienView userId={user.id} linkBase={`${proto}://${host}/cua-hang/${panel.slug}/dang-ky`} />
    </PanelShell>
  );
}
