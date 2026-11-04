import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { SiteHeader, SiteFooter, PanelAccountNav } from "@/components/site";
import { ApiDocsView } from "@/components/apidocs";

export const dynamic = "force-dynamic";

export default async function PanelApiDocs({ params }: { params: { slug: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return (
    <div data-accent={panel.accent} className="min-h-screen flex flex-col bg-slate-50">
      <SiteHeader />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-8">
        <PanelAccountNav slug={panel.slug} active="tai-lieu-api" />
        <ApiDocsView apiKey={user.apiKey} />
      </main>
      <SiteFooter brand={{ name: panel.name, tagline: panel.tagline, zalo: panel.supportZalo, telegram: panel.supportTelegram, facebook: panel.supportFacebook, hotline: panel.supportHotline }} />
    </div>
  );
}
