import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { I, Empty } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { GcFavFilterButton } from "@/components/gift-card";
import { InfoChip } from "@/components/catalog-chips";
import { catalogPageSize } from "@/lib/settings";

export const dynamic = "force-dynamic";


/** Danh mục Gift Card (nhóm FZR giftcards) — dựng theo ảnh mẫu của chủ site:
 *  thẻ header -> thẻ tìm kiếm (tìm theo tên danh mục + nút sao lọc yêu thích)
 *  -> lưới thẻ danh mục (ảnh bìa + tên bên dưới). Catalog rất nhiều danh mục
 *  nên PHÂN TRANG phía máy chủ, bộ lọc đi qua query. 1 danh mục FZR = 1 sản
 *  phẩm (providerProductId = category_id), mệnh giá là các gói giftcards. */
export default async function GiftCardCatalogPage({ searchParams }: {
  searchParams: { q?: string; page?: string; fav?: string; ids?: string };
}) {
  const PAGE_SIZE = await catalogPageSize();
  await getCurrentUser();
  const { L } = await getServerI18n();

  const GC_SOME = { variants: { some: { providerGroup: "giftcards", active: true } } } as const;
  const q = (searchParams.q || "").trim();
  const favActive = searchParams.fav === "1";
  const favIds = favActive ? (searchParams.ids || "").split(",").map((x) => parseInt(x) || 0).filter((x) => x > 0) : [];

  const where: any = {
    active: true, panelId: null, ...GC_SOME,
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(favActive ? { id: { in: favIds.length ? favIds : [-1] } } : {}),
  };
  const totalCatalog = await prisma.premiumProduct.count({ where: { active: true, panelId: null, ...GC_SOME } });
  const filtered = await prisma.premiumProduct.count({ where });
  const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(searchParams.page || "1") || 1));
  const cats = await prisma.premiumProduct.findMany({
    where, orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    select: { id: true, name: true, imageUrl: true, images: true, description: true },
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
    return s ? `/dashboard/gift-card?${s}` : "/dashboard/gift-card";
  };
  const filterBase = qs({ page: 1 });

  return (
    <div>
      {/* Thẻ header như ảnh mẫu */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">Gift Cards &amp; Codes</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Danh mục thẻ quà tặng và mã nạp — chọn danh mục để xem các mệnh giá và giá.")}</p>
      </div>

      {/* Thẻ tìm kiếm — cùng khối gọn thẳng mép như Game Key: hàng nhãn +
          hàng ô tìm đều NẰM TRONG khối max-w-680px (nhãn "Yêu thích" đứng
          ngay trên nút sao), nút Xoá lọc nằm CÙNG hàng ô tìm, cao 42px. */}
      <form method="get" className="card mt-5 p-4 sm:p-5">
        <div className="max-w-[680px]">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{L("Tìm trong danh mục")}</div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{L("Yêu thích")}</div>
          </div>
          <div className="mt-2.5 flex gap-2">
            <input className="inp min-w-0 flex-1" name="q" defaultValue={q} placeholder={L("Tìm theo tên danh mục...")} />
            <GcFavFilterButton active={favActive} basePath={filterBase} />
            {hasFilter && <Link href="/dashboard/gift-card" className="btn-ghost h-[42px] shrink-0 px-4">{L("Xoá lọc")}</Link>}
          </div>
        </div>
      </form>

      {/* Lưới danh mục */}
      <div className="mt-5">
        {totalCatalog === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-lg font-bold text-slate-900">{L("Chưa có dữ liệu Gift Card")}</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{L("Danh mục Gift Card chưa được đồng bộ — vui lòng quay lại sau.")}</p>
          </div>
        ) : cats.length === 0 ? (
          <div className="card"><Empty text={favActive && !favIds.length ? L("Bạn chưa có danh mục yêu thích nào — mở một danh mục và bấm sao để lưu") : L("Không có danh mục nào khớp bộ lọc")} /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {cats.map((c) => {
              const img = cover(c);
              return (
                <Link key={c.id} href={`/dashboard/gift-card/${c.id}`} className="card group overflow-hidden transition hover:shadow-md">
                  <div className="relative aspect-square w-full overflow-hidden bg-slate-100">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={c.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <span className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-700 to-slate-900 text-white">
                        <span className="[&>svg]:h-12 [&>svg]:w-12">{I.gift}</span>
                        {c.description?.trim() ? (
                          <span className="absolute left-2.5 top-2.5"><InfoChip text={c.description} /></span>
                        ) : null}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
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
          <span className="text-slate-500">{L("Trang")} {page}/{pages} · {filtered} {L("danh mục")}</span>
          <span className="flex gap-2">
            {page > 1 && <Link className="btn-ghost btn-sm" href={qs({ page: page - 1 })}>{L("Trang trước")}</Link>}
            {page < pages && <Link className="btn-ghost btn-sm" href={qs({ page: page + 1 })}>{L("Trang sau")}</Link>}
          </span>
        </div>
      )}
    </div>
  );
}
