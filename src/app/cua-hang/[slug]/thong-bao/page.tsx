import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PublicHeader, SiteFooter } from "@/components/site";
import { getAnnouncementsFor, groupAnnouncements } from "@/lib/announcements";
import { AnnouncementTimeline } from "@/components/announcement-timeline";

export const dynamic = "force-dynamic";

/** Trang Thông báo của gian hàng con — thông báo của panel, chưa có thì hiện của web mẹ. */
export default async function PanelStoreAnnouncements({ params }: { params: { slug: string } }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const groups = groupAnnouncements(await getAnnouncementsFor(panel.id, 100));
  return (
    <div data-accent={panel.accent} className="dark pub-dark flex min-h-screen flex-col bg-[#07090d] text-slate-300">
      <PublicHeader panel={{ name: panel.name, slug: panel.slug }} announcement={panel.announcement} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-6">
        <h1 className="text-3xl font-extrabold text-white">Thông báo</h1>
        <p className="mt-2 text-slate-400">Cập nhật mới nhất từ {panel.name}, xếp theo ngày đăng.</p>
        {groups.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-12 text-center text-slate-400">Chưa có thông báo nào.</div>
        ) : (
          <div className="mt-10">
            <AnnouncementTimeline groups={groups} />
          </div>
        )}
      </main>
      <SiteFooter brand={{ slug: panel.slug, name: panel.name, tagline: panel.tagline, zalo: panel.supportZalo, telegram: panel.supportTelegram, facebook: panel.supportFacebook, hotline: panel.supportHotline }} />
    </div>
  );
}
