import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, I } from "@/components/ui";
import { ProviderPricingCard, VariantRow, fmtVnd } from "@/components/admin-families";
import { famAddTopupDenom, famAddGiftGame, famSaveGiftProduct } from "@/app/actions/admin-families";
import { loadSteamFamilies } from "@/lib/families";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const RT = "/admin/steam/san-pham";

/** FIX8 TASK 4 — Sản phẩm Steam theo đúng 2 họ phía FZR: Gói Top-Up (mệnh giá
 *  USD cố định, giá bán = giá gói trong catalog) và Game gift (mỗi game 1 sản
 *  phẩm theo appid + gói "Bản gift"; giá bán chốt tươi theo offer rẻ nhất tại
 *  lúc mua nên giá hiển thị chỉ là giá gần nhất, markup nằm ở thẻ nhà cung
 *  cấp). Sửa ở đây ghi vào đúng PremiumProduct/PremiumVariant trang khách đọc. */
export default async function AdminSteamProducts({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const { providers, topup, giftGroups } = await loadSteamFamilies();
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
      {providers.map((p) => <ProviderPricingCard key={p.id} provider={p} returnTo={RT} />)}

      {/* Họ Top-Up */}
      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="text-brand-600">{I.wallet}</span>
          <h2 className="text-[15px] font-bold text-slate-800">Gói Top-Up</h2>
          <span className="text-xs text-slate-400">Mệnh giá USD cố định — giá bán sửa ở đây là giá trang khách tính tiền</span>
        </div>
        {topup.length ? (
          topup.map((v) => (
            <VariantRow key={v.id} v={v} returnTo={RT} meta={`Mệnh giá: ${v.providerItemId || "—"} USD`} />
          ))
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">Chưa có mệnh giá Top-Up — đồng bộ catalog FZR hoặc thêm mệnh giá ở dưới.</p>
        )}
        <form action={famAddTopupDenom} className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3.5">
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
      </section>

      {/* Họ Game gift */}
      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="text-brand-600">{I.gamepad}</span>
          <h2 className="text-[15px] font-bold text-slate-800">Game gift</h2>
          <span className="text-xs text-slate-400">Mỗi game 1 sản phẩm theo App ID — giá bán chốt tươi theo offer rẻ nhất phía FZR tại lúc mua</span>
        </div>
        {giftGroups.length ? (
          giftGroups.map(({ product, variants }) => (
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
          <p className="px-5 py-4 text-sm text-slate-400">Chưa có game gift — bấm đồng bộ Steam Gifts ở trang Nhà cung cấp hoặc thêm game ở dưới.</p>
        )}
        <form action={famAddGiftGame} className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3.5">
          <input type="hidden" name="returnTo" value={RT} />
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-400">App ID</span>
            <input name="appid" type="number" min={1} required placeholder="1245620" className="inp !w-28 !py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-400">Tên game</span>
            <input name="name" required placeholder="ELDEN RING" className="inp !w-48 !py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-400">Ảnh bìa (URL)</span>
            <input name="imageUrl" placeholder="https://…" className="inp !w-52 !py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-400">Giá hiển thị (VNĐ)</span>
            <input name="price" type="number" min={0} placeholder="0 = báo giá khi mua" className="inp !w-40 !py-2 text-[13px]" />
          </label>
          <button className="btn-primary btn-sm !px-3.5 !py-2">Thêm game</button>
        </form>
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Quyền sở hữu khi đồng bộ FZR: gói do đồng bộ tạo có thể bị ghi đè giá (khi nhà cung cấp bật Tự cập nhật giá), ghi đè tên/ảnh (khi bật Đồng bộ nội dung) và được bật lại nếu FZR còn bán; gói gắn nhãn “Tự thêm” do admin tạo thì đồng bộ không đụng vào. Danh sách game gift phía FZR giới hạn 1 lần gọi mỗi 3 phút nên chỉ đồng bộ khi admin bấm tay ở trang Nhà cung cấp.
      </p>
    </div>
  );
}
