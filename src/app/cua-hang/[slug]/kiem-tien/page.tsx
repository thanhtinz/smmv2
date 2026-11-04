import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SiteHeader, SiteFooter, PanelAccountNav } from "@/components/site";
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
    <div data-accent={panel.accent} className="min-h-screen flex flex-col bg-slate-50">
      <SiteHeader />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-8">
        <PanelAccountNav slug={panel.slug} active="kiem-tien" />
        <KiemTienView userId={user.id} linkBase={`${proto}://${host}/cua-hang/${panel.slug}/dang-ky`} />
      </main>
      <SiteFooter brand={{ name: panel.name, tagline: panel.tagline, zalo: panel.supportZalo, telegram: panel.supportTelegram, facebook: panel.supportFacebook, hotline: panel.supportHotline }} />
    </div>
  );
}
