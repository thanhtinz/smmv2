import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, Badge } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { BannerForm } from "@/components/banner-form";
import { saveBannerAction, deleteBannerAction, toggleBannerAction } from "@/app/actions/banners";

export const dynamic = "force-dynamic";

/** Banner trang chủ — mỗi banner gắn một ngôn ngữ (VI/EN): khách chọn ngôn
 *  ngữ nào, hero trang chủ chạy banner của ngôn ngữ đó; ngôn ngữ chưa có
 *  banner thì tạm dùng bộ của ngôn ngữ còn lại, chưa có banner nào thì
 *  trang chủ giữ slide tự tạo từ danh mục. */
export default async function AdminBannerPage( { searchParams: searchParamsPromise }: { searchParams: Promise<{ msg?: string; err?: string; edit?: string }> }) {
  const searchParams = await searchParamsPromise;
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const banners = await prisma.homeBanner.findMany({ orderBy: [{ sort: "asc" }, { id: "asc" }] });
  const editId = parseInt(searchParams.edit || "") || 0;
  const editing = editId ? banners.find((b) => b.id === editId) : undefined;

  return (
    <div>
      <PageHead title={L("Banner trang chủ")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      <BannerForm
        key={editing ? `edit-${editing.id}` : "new"}
        action={saveBannerAction}
        initial={editing ? { id: editing.id, image: editing.image, href: editing.href || "", lang: editing.lang, sort: editing.sort } : { image: "", href: "", lang: "vi", sort: 0 }}
      />
      {editing && (
        <div className="mt-3">
          <Link href="/admin/banner" className="text-sm font-semibold text-slate-500 hover:text-slate-700">{L("Huỷ")}</Link>
        </div>
      )}

      <div className="card mt-6 p-6">
        <div className="font-bold text-slate-900">{L("Danh sách banner")} ({banners.length})</div>
        {banners.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{L("Chưa có banner nào")}. {L("Khi chưa có banner, trang chủ dùng slide tự tạo từ danh mục sản phẩm.")}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {banners.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.image} alt="" className="h-14 w-28 shrink-0 rounded-lg object-cover" />
                <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold ${b.lang === "en" ? "bg-sky-100 text-sky-700" : "bg-rose-100 text-rose-700"}`}>
                  {b.lang === "en" ? "EN" : "VI"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-800">{b.href || "—"}</div>
                  <div className="text-xs text-slate-400">{L("Thứ tự")} {b.sort}</div>
                </div>
                {b.active ? <Badge cls="bg-emerald-100 text-emerald-700">{L("Đang hiện")}</Badge> : <Badge cls="bg-slate-200 text-slate-500">{L("Đang ẩn")}</Badge>}
                <div className="flex shrink-0 items-center gap-2">
                  <Link href={`/admin/banner?edit=${b.id}`} className="btn-ghost !px-3.5 text-sm font-semibold">{L("Chỉnh sửa")}</Link>
                  <form action={toggleBannerAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="btn-ghost !px-3.5 text-sm font-semibold">{b.active ? L("Ẩn") : L("Hiện")}</button>
                  </form>
                  <form action={deleteBannerAction}>
                    <input type="hidden" name="id" value={b.id} />
                    <button className="btn-ghost !px-3.5 text-sm font-semibold !text-rose-600">{L("Xoá")}</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
