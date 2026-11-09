import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { I, Empty } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { MsFavFilterButton } from "@/components/manual-services";
import { InfoChip, KindChip } from "@/components/catalog-chips";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

/** Danh mục Manual Services (nhóm FZR manual-services) — dựng theo ảnh
 *  mẫu của chủ site: thẻ header -> thẻ tìm kiếm (tìm theo tên + nút sao
 *  lọc yêu thích, cùng khối gọn 680px như các catalog khác) -> thẻ RỘNG
 *  nằm ngang (bìa + hai chip góc trái trên: chip file mở popover info của
 *  NCC, chip loại giao theo kind của category; tên dưới bìa). Dịch vụ
 *  KHÔNG còn gói nào đang bán thì hiện dải cam "Tạm thời không khả dụng"
 *  như ảnh mẫu (tài liệu FZR: category không có offer khả dụng vốn bị
 *  lược khỏi danh sách nguồn — dải này bắt trường hợp gói bị tắt về sau).
 *  Phân trang phía máy chủ 24/trang. 1 category = 1 sản phẩm. */
export default async function ManualCatalogPage({ searchParams }: {
  searchParams: { q?: string; page?: string; fav?: string; ids?: string };
}) {
  await getCurrentUser();
  const { L } = await getServerI18n();

  const MS_SOME = { variants: { some: { providerGroup: "manual" } } } as const;
  const q = (searchParams.q || "").trim();
  const favActive = searchParams.fav === "1";
  const favIds = favActive ? (searchParams.ids || "").split(",").map((x) => parseInt(x) || 0).filter((x) => x > 0) : [];

  const where: any = {
    active: true, panelId: null, ...MS_SOME,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(favActive ? { id: { in: favIds.length ? favIds : [-1] } } : {}),
  };
  const totalCatalog = await prisma.premiumProduct.count({ where: { active: true, panelId: null, ...MS_SOME } });
  const filtered = await prisma.premiumProduct.count({ where });
  const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(searchParams.page || "1") || 1));
  const cats = await prisma.premiumProduct.findMany({
    where, orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    select: {
      id: true, name: true, imageUrl: true, images: true, description: true, providerKind: true,
      variants: { where: { providerGroup: "manual" }, select: { active: true } },
    },
  });
  const cover = (p: { imageUrl: string | null; images: string | null }): string | null => {
    if (p.imageUrl) return p.imageUrl;
    if (p.images) { try { const arr = JSON.parse(p.images); if (Array.isArray(arr) && arr[0]) return String(arr[0]); } catch { /* ảnh hỏng -> ô trung tính */ } }
    return null;
  };
  const hasFilter = !!(q || favActive);
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { q, page: String(page), fav: favActive ? "1" : "", ids: favActive ? favIds.join(",") : "" };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/dashboard/manual-services?${s}` : "/dashboard/manual-services";
  };
  const filterBase = qs({ page: 1 });

  return (
    <div>
      {/* Thẻ header như ảnh mẫu */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">Manual Services</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Duyệt và đặt các dịch vụ xử lý thủ công.")}</p>
      </div>

      {/* Thẻ tìm kiếm — cùng khối gọn 680px như các catalog khác */}
      <form method="get" className="card mt-5 p-4 sm:p-5">
        <div className="max-w-[680px]">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{L("Tìm trong danh mục")}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{L("Yêu thích")}</div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <input className="inp min-w-0 flex-1" name="q" defaultValue={q} placeholder={L("Tìm dịch vụ theo tên")} />
            <MsFavFilterButton active={favActive} basePath={filterBase} />
            {hasFilter && <Link href="/dashboard/manual-services" className="btn-ghost h-[42px] shrink-0 px-4">{L("Xoá lọc")}</Link>}
          </div>
        </div>
      </form>

      {/* Lưới dịch vụ — thẻ rộng nằm ngang như ảnh mẫu */}
      <div className="mt-5">
        {totalCatalog === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-lg font-bold text-slate-900">{L("Chưa có dữ liệu Manual Services")}</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{L("Danh mục dịch vụ chưa được đồng bộ — vui lòng quay lại sau.")}</p>
          </div>
        ) : cats.length === 0 ? (
          <div className="card"><Empty text={favActive && !favIds.length ? L("Bạn chưa có dịch vụ yêu thích nào — mở một dịch vụ và bấm sao để lưu") : L("Không có dịch vụ nào khớp bộ lọc")} /></div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {cats.map((c) => {
              const img = cover(c);
              const available = c.variants.some((v) => v.active);
              return (
                <Link key={c.id} href={`/dashboard/manual-services/${c.id}`} className="card group overflow-hidden transition hover:shadow-md">
                  <div className="relative aspect-[16/8] w-full overflow-hidden bg-slate-100">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={c.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 text-white [&>svg]:h-12 [&>svg]:w-12">{I.box}</span>
                    )}
                    <span className="absolute left-2.5 top-2.5 flex gap-1.5">
                      {c.description?.trim() ? <InfoChip text={c.description} /> : null}
                      {c.providerKind ? <KindChip kind={c.providerKind} /> : null}
                    </span>
                  </div>
                  {!available && (
                    <div className="bg-amber-600 px-3 py-1.5 text-center text-[13px] font-bold text-white">
                      {L("Tạm thời không khả dụng")}
                    </div>
                  )}
                  <div className="p-3.5">
                    <div className="line-clamp-2 min-h-[2.5rem] text-sm font-bold leading-snug text-slate-900" title={c.name}>{c.name}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">{L("Trang")} {page}/{pages} · {filtered} {L("dịch vụ")}</span>
          <span className="flex gap-2">
            {page > 1 && <Link className="btn-ghost btn-sm" href={qs({ page: page - 1 })}>{L("Trang trước")}</Link>}
            {page < pages && <Link className="btn-ghost btn-sm" href={qs({ page: page + 1 })}>{L("Trang sau")}</Link>}
          </span>
        </div>
      )}
    </div>
  );
}
