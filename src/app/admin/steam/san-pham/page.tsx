import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, I } from "@/components/ui";
import { VariantRow, fmtVnd, AreaSyncCard, AdminPager } from "@/components/admin-families";
import { famAddTopupDenom, famSaveGiftProduct } from "@/app/actions/admin-families";
import { SteamGiftAddForm } from "@/components/fzr-picker";
import { loadSteamFamilies } from "@/lib/families";
import { getSettings } from "@/lib/settings";
import { fzrMarkupKey } from "@/lib/fzr-markup";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const RT = "/admin/steam/san-pham";

/** FIX8 TASK 4 — Sản phẩm Steam theo đúng 2 họ phía FZR: Gói Top-Up (mệnh giá
 *  USD cố định, giá bán = giá gói trong catalog) và Game gift (mỗi game 1 sản
 *  phẩm theo appid + gói "Bản gift"; giá bán chốt tươi theo offer rẻ nhất tại
 *  lúc mua nên giá hiển thị chỉ là giá gần nhất; tỉ giá + markup chung nằm ở
 *  form nhà cung cấp — Admin → Nhà cung cấp, markup riêng khu ở AreaSyncCard).
 *  Sửa ở đây ghi vào đúng PremiumProduct/PremiumVariant trang khách đọc. */
const PAGE_SIZE = 10;

export default async function AdminSteamProducts({ searchParams }: { searchParams: { msg?: string; err?: string; tpage?: string; gpage?: string; gq?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const { providers, topup, giftGroups } = await loadSteamFamilies();
  // Phân trang phía máy chủ: mệnh giá Top-Up theo `tpage`; game gift lọc
  // theo tên (`gq`) rồi phân trang theo `gpage` (danh sách game phía FZR
  // giới hạn sẵn nên cắt trang tại đây là đủ, không nạp thêm xuống khách).
  const topupPages = Math.max(1, Math.ceil(topup.length / PAGE_SIZE));
  const topupPage = Math.min(topupPages, Math.max(1, parseInt(searchParams.tpage || "1") || 1));
  const topupSlice = topup.slice((topupPage - 1) * PAGE_SIZE, topupPage * PAGE_SIZE);
  const gq = (searchParams.gq || "").trim();
  const giftFiltered = gq ? giftGroups.filter((g) => g.product.name.toLowerCase().includes(gq.toLowerCase())) : giftGroups;
  const giftPages = Math.max(1, Math.ceil(giftFiltered.length / PAGE_SIZE));
  const giftPage = Math.min(giftPages, Math.max(1, parseInt(searchParams.gpage || "1") || 1));
  const giftSlice = giftFiltered.slice((giftPage - 1) * PAGE_SIZE, giftPage * PAGE_SIZE);
  const settings = await getSettings();
  const areaOverrides = { steam_topup: settings[fzrMarkupKey("steam_topup")] || "", steam_gift: settings[fzrMarkupKey("steam_gift")] || "" };
  return (
    <div>
      <PageHead
        title={L("Sản phẩm Steam")}
        desc={L("Hai họ gói Steam theo nhà cung cấp: Top-Up theo mệnh giá và Game gift theo appid. Sửa giá/tên/bật tắt tại đây áp dụng ngay cho trang đặt hàng Steam.")}
      />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      {providers.length === 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Chưa có nhà cung cấp FZR đang bật — thêm nhà cung cấp ở Admin → Nhà cung cấp (API) rồi đồng bộ catalog để có gói Steam.
        </div>
      )}
      {providers[0] && <AreaSyncCard provider={providers[0]} groups={["steam_topup", "steam_gift"]} overrides={areaOverrides} returnTo={RT} />}

      {/* Họ Top-Up */}
      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="text-brand-600">{I.wallet}</span>
          <h2 className="text-[15px] font-bold text-slate-800">Gói Top-Up</h2>
          <span className="text-xs text-slate-400">Mệnh giá USD cố định — giá bán sửa ở đây là giá trang khách tính tiền</span>
        </div>
        <form action={famAddTopupDenom} className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
          <input type="hidden" name="returnTo" value={RT} />
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-400">Mệnh giá (USD)</span>
            <input name="amount" type="number" min={1} required placeholder="15" className="inp !w-28 !py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-400">Giá bán (VNĐ)</span>
            <input name="price" type="number" min={1} required placeholder="15000" className="inp !w-36 !py-2 text-[13px]" />
          </label>
          <button className="btn-primary btn-sm !px-3.5 !py-2">Thêm mệnh giá</button>
        </form>
        {topup.length ? (
          <>
            {topupSlice.map((v) => (
              <VariantRow key={v.id} v={v} returnTo={RT} meta={`Mệnh giá: ${v.providerItemId || "—"} USD`} />
            ))}
            <div className="px-4">
              <AdminPager basePath={RT} page={topupPage} pages={topupPages} total={topup.length} unit="mệnh giá" param="tpage" params={{ gq, gpage: String(giftPage) }} />
            </div>
          </>
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">Chưa có mệnh giá Top-Up — đồng bộ catalog FZR hoặc thêm mệnh giá ở trên.</p>
        )}
      </section>

      {/* Họ Game gift */}
      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="text-brand-600">{I.gamepad}</span>
          <h2 className="text-[15px] font-bold text-slate-800">Game gift</h2>
          <span className="text-xs text-slate-400">Mỗi game 1 sản phẩm theo App ID — giá bán chốt tươi theo offer rẻ nhất phía FZR tại lúc mua</span>
        </div>
        <SteamGiftAddForm returnTo={RT} />
        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <input type="hidden" name="tpage" value={topupPage} />
          <input name="gq" defaultValue={gq} placeholder="Tìm game gift theo tên..." className="inp min-w-[220px] flex-1 !py-2 text-[13px] sm:max-w-[400px]" />
          <button className="btn-primary btn-sm h-[38px] !px-3.5">Tìm kiếm</button>
          {gq && <a href={`${RT}?tpage=${topupPage}`} className="btn-ghost btn-sm h-[38px] !px-3.5">Xoá lọc</a>}
        </form>
        {giftFiltered.length ? (
          giftSlice.map(({ product, variants }) => (
            <div key={product.id} className="border-b border-slate-100 last:border-0">
              <div className="flex flex-wrap items-center gap-3 px-4 pt-3.5">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt="" className="h-11 w-[92px] shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-11 w-[92px] shrink-0 items-center justify-center rounded-lg bg-brand-600 text-lg font-black text-white">
                    {(product.name || "S").slice(0, 1)}
                  </span>
                )}
                <form action={famSaveGiftProduct} className="flex flex-1 flex-wrap items-end gap-2">
                  <input type="hidden" name="productId" value={product.id} />
                  <input type="hidden" name="returnTo" value={RT} />
                  <label className="block min-w-[180px] flex-1">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-400">Tên game</span>
                    <input name="name" defaultValue={product.name} className="inp !py-2 text-[13px]" />
                  </label>
                  <label className="block min-w-[200px] flex-1">
                    <span className="mb-1 block text-[11px] font-semibold text-slate-400">Ảnh bìa (URL)</span>
                    <input name="imageUrl" defaultValue={product.imageUrl || ""} placeholder="https://…" className="inp !py-2 text-[13px]" />
                  </label>
                  <button className="btn-primary btn-sm !px-3.5 !py-2">Lưu game</button>
                </form>
              </div>
              {variants.map((v) => (
                <VariantRow key={v.id} v={v} returnTo={RT} meta={`App ID: ${v.providerItemId || "—"} · Giá hiển thị gần nhất: ${fmtVnd(v.price)}`} />
              ))}
            </div>
          ))
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">{gq ? `Không có game gift nào khớp “${gq}”.` : "Chưa có game gift — bấm đồng bộ Steam Gifts ở trang Nhà cung cấp hoặc thêm game ở trên."}</p>
        )}
        {giftFiltered.length > 0 && (
          <div className="px-4">
            <AdminPager basePath={RT} page={giftPage} pages={giftPages} total={giftFiltered.length} unit="game gift" param="gpage" params={{ gq, tpage: String(topupPage) }} />
          </div>
        )}
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Quyền sở hữu khi đồng bộ FZR: gói do đồng bộ tạo có thể bị ghi đè giá (khi nhà cung cấp bật Tự cập nhật giá), ghi đè tên/ảnh (khi bật Đồng bộ nội dung) và được bật lại nếu FZR còn bán; gói gắn nhãn “Tự thêm” do admin tạo thì đồng bộ không đụng vào. Danh sách game gift phía FZR giới hạn 1 lần gọi mỗi 3 phút nên chỉ đồng bộ khi admin bấm tay ở trang Nhà cung cấp.
      </p>
    </div>
  );
}
