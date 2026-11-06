import { SiteFooter, PublicHeader } from "@/components/site";
import { getSettings } from "@/lib/settings";
import { getAnnouncementsFor, groupAnnouncements } from "@/lib/announcements";
import { AnnouncementTimeline } from "@/components/announcement-timeline";

export const dynamic = "force-dynamic";

/** Trang Thông báo công khai của web mẹ — toàn bộ thông báo dạng timeline theo ngày. */
export default async function AnnouncementsPage() {
  const s = await getSettings();
  const groups = groupAnnouncements(await getAnnouncementsFor(null, 100));
  return (
    <div className="dark pub-dark flex min-h-screen flex-col bg-[#07090d] text-slate-300">
      <PublicHeader />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 pb-20 pt-6">
        <h1 className="text-3xl font-extrabold text-white">Thông báo</h1>
        <p className="mt-2 text-slate-400">Cập nhật mới nhất từ {s.site_name}, xếp theo ngày đăng.</p>
        {groups.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-12 text-center text-slate-400">Chưa có thông báo nào.</div>
        ) : (
          <div className="mt-10">
            <AnnouncementTimeline groups={groups} />
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
