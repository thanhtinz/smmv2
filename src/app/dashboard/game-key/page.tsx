import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { I, Empty } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";
import { GkFavFilterButton } from "@/components/game-key";
import { InfoChip } from "@/components/catalog-chips";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

/** Danh mục Game Key (nhóm FZR gamekeys) — dựng theo ảnh mẫu của chủ site:
 *  thẻ header -> thẻ tìm kiếm (tìm theo tên + lọc Nền tảng/Vùng + nút sao lọc
 *  yêu thích) -> lưới thẻ game (bìa dọc + tên + chip nền tảng/vùng). Catalog
 *  rất nhiều game nên PHÂN TRANG phía máy chủ, bộ lọc đi qua query. Nền
 *  tảng/vùng là dữ liệu thật phía FZR đã đồng bộ (providerPlatform/
 *  providerRegion) — danh sách lọc lấy từ chính các giá trị đang có. */
export default async function GameKeyCatalogPage({ searchParams }: {
  searchParams: { q?: string; platform?: string; region?: string; page?: string; fav?: string; ids?: string };
}) {
  await getCurrentUser();
  const { L } = await getServerI18n();

  const GK_SOME = { variants: { some: { providerGroup: "gamekeys", active: true } } } as const;
  const [platformRows, regionRows] = await Promise.all([
    prisma.premiumProduct.findMany({ where: { active: true, panelId: null, providerPlatform: { not: null }, ...GK_SOME }, distinct: ["providerPlatform"], select: { providerPlatform: true }, orderBy: { providerPlatform: "asc" } }),
    prisma.premiumProduct.findMany({ where: { active: true, panelId: null, providerRegion: { not: null }, ...GK_SOME }, distinct: ["providerRegion"], select: { providerRegion: true }, orderBy: { providerRegion: "asc" } }),
  ]);
  const platforms = platformRows.map((r) => r.providerPlatform!).filter(Boolean);
  const regions = regionRows.map((r) => r.providerRegion!).filter(Boolean);

  const q = (searchParams.q || "").trim();
  const platform = platforms.includes(searchParams.platform || "") ? searchParams.platform! : "";
  const region = regions.includes(searchParams.region || "") ? searchParams.region! : "";
  const favActive = searchParams.fav === "1";
  const favIds = favActive ? (searchParams.ids || "").split(",").map((x) => parseInt(x) || 0).filter((x) => x > 0) : [];

  const where: any = {
    active: true, panelId: null, ...GK_SOME,
    ...(platform ? { providerPlatform: platform } : {}),
    ...(region ? { providerRegion: region } : {}),
    ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    ...(favActive ? { id: { in: favIds.length ? favIds : [-1] } } : {}),
  };
  const totalCatalog = await prisma.premiumProduct.count({ where: { active: true, panelId: null, ...GK_SOME } });
  const filtered = await prisma.premiumProduct.count({ where });
  const pages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(searchParams.page || "1") || 1));
  const games = await prisma.premiumProduct.findMany({
    where, orderBy: { name: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE,
    select: { id: true, name: true, imageUrl: true, images: true, providerPlatform: true, providerRegion: true, description: true },
  });
  const cover = (p: { imageUrl: string | null; images: string | null }): string | null => {
    if (p.imageUrl) return p.imageUrl;
    if (p.images) { try { const arr = JSON.parse(p.images); if (Array.isArray(arr) && arr[0]) return String(arr[0]); } catch { /* ảnh hỏng -> ô trung tính */ } }
    return null;
  };
  const hasFilter = !!(q || platform || region || favActive);
  const qs = (patch: Record<string, string | number>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { q, platform, region, page: String(page), fav: favActive ? "1" : "", ids: favActive ? favIds.join(",") : "" };
    for (const [k, v] of Object.entries({ ...cur, ...patch })) if (v) p.set(k, String(v));
    const s = p.toString();
    return s ? `/dashboard/game-key?${s}` : "/dashboard/game-key";
  };
  const filterBase = qs({ page: 1 });

  return (
    <div>
      {/* Thẻ header như ảnh mẫu */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-brand-50/60 to-white px-6 py-6 sm:px-7">
        <h1 className="text-[22px] font-black leading-tight text-slate-900">Game Keys</h1>
        <p className="mt-1 text-sm text-slate-500">{L("Danh mục key game — chọn game để xem các phiên bản và giá.")}</p>
      </div>

      {/* Thẻ tìm kiếm + lọc */}
      <form method="get" className="card mt-5 p-4 sm:p-5">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{L("Tìm trong danh mục")}</div>
        {/* Khối lọc gọn 1 khối thẳng mép (Tín 2026-11-08 13:58): mọi control
            gói trong khối max-w-680px — hàng 1: ô tìm (flex-1) + nút sao ở
            cuối; hàng 2: 2 select bằng nhau + nút Lọc ở CUỐI cùng hàng, cao
            42px bằng đúng ô select, không còn hàng nút mồ côi bên dưới.
            Mobile giữ xếp chồng như cũ, Lọc cũng ở cuối hàng select. */}
        <div className="max-w-[680px]">
          <div className="mt-2.5 flex gap-2">
            <input className="inp flex-1" name="q" defaultValue={q} placeholder={L("Tìm game theo tên")} />
            <GkFavFilterButton active={favActive} basePath={filterBase} />
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-28">
              <label className="lbl">{L("Nền tảng")}</label>
              <select className="inp" name="platform" defaultValue={platform}>
                <option value="">{L("Tất cả")}</option>
                {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div className="min-w-0 flex-1 basis-28">
              <label className="lbl">{L("Vùng")}</label>
              <select className="inp" name="region" defaultValue={region}>
                <option value="">{L("Tất cả")}</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <button className="btn-primary h-[42px] shrink-0 px-5">{L("Lọc")}</button>
            {hasFilter && <Link href="/dashboard/game-key" className="btn-ghost h-[42px] shrink-0 px-4">{L("Xoá lọc")}</Link>}
          </div>
        </div>
      </form>

      {/* Lưới game */}
      <div className="mt-5">
        {totalCatalog === 0 ? (
          <div className="card p-8 text-center">
            <div className="text-lg font-bold text-slate-900">{L("Chưa có dữ liệu Game Key")}</div>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{L("Danh mục Game Key chưa được đồng bộ — vui lòng quay lại sau.")}</p>
          </div>
        ) : games.length === 0 ? (
          <div className="card"><Empty text={favActive && !favIds.length ? L("Bạn chưa có game yêu thích nào — mở một game và bấm sao để lưu") : L("Không có game nào khớp bộ lọc")} /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {games.map((g) => {
              const img = cover(g);
              return (
                <Link key={g.id} href={`/dashboard/game-key/${g.id}`} className="card group overflow-hidden transition hover:shadow-md">
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-slate-100">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={g.name} loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-600 to-brand-800 text-white [&>svg]:h-12 [&>svg]:w-12">{I.gamepad}</span>
                    )}
                    {g.description?.trim() ? (
                      <span className="absolute left-2.5 top-2.5"><InfoChip text={g.description} /></span>
                    ) : null}
                  </div>
                  <div className="p-3">
                    <div className="truncate text-sm font-bold text-slate-900" title={g.name}>{g.name}</div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] font-bold text-slate-600 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0">
                        {I.gamepad}<span className="truncate">{g.providerPlatform || "—"}</span>
                      </span>
                      <span className="inline-flex min-w-0 items-center gap-1 rounded-md border border-slate-200 px-1.5 py-1 text-[11px] font-bold text-slate-600 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0">
                        {I.globe}<span className="truncate">{g.providerRegion || "—"}</span>
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">{L("Trang")} {page}/{pages} · {filtered} {L("game")}</span>
          <span className="flex gap-2">
            {page > 1 && <Link className="btn-ghost btn-sm" href={qs({ page: page - 1 })}>{L("Trang trước")}</Link>}
            {page < pages && <Link className="btn-ghost btn-sm" href={qs({ page: page + 1 })}>{L("Trang sau")}</Link>}
          </span>
        </div>
      )}
    </div>
  );
}
