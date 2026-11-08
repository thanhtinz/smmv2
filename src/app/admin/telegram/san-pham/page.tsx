import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, I } from "@/components/ui";
import { ProviderPricingCard, VariantRow, fmtVnd } from "@/components/admin-families";
import { famAddTelegramPlan } from "@/app/actions/admin-families";
import { loadTelegramFamilies } from "@/lib/families";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const RT = "/admin/telegram/san-pham";

/** FIX8 TASK 4 — Sản phẩm Telegram theo đúng 2 họ phía FZR: Gói Stars (1 gói
 *  đơn vị, giá chốt tươi theo báo giá /telegram/stars mỗi đơn) và Gói Premium
 *  (các gói theo tháng, giá bán = giá gói trong catalog). Sửa ở đây ghi vào
 *  đúng PremiumVariant mà trang khách đọc và đơn hàng tính tiền. */
export default async function AdminTelegramProducts({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const { provider, stars, premium } = await loadTelegramFamilies();
  return (
    <div>
      <PageHead
        title={L("Sản phẩm Telegram")}
        desc={L("Hai họ gói Telegram theo nhà cung cấp: Stars và Premium. Sửa giá/tên/bật tắt tại đây áp dụng ngay cho trang đặt đơn Telegram.")}
      />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      {!provider && (
        <div className="card mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Chưa cấu hình nhà cung cấp FZR cho Telegram — vào Admin → Telegram → Cài đặt để chọn nhà cung cấp, rồi đồng bộ catalog ở trang Nhà cung cấp.
        </div>
      )}
      {provider && <ProviderPricingCard provider={provider} returnTo={RT} />}

      {/* Họ Stars */}
      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="text-amber-500">{I.star}</span>
          <h2 className="text-[15px] font-bold text-slate-800">Gói Stars</h2>
          <span className="text-xs text-slate-400">Mua sao Telegram theo số lượng — giá mỗi sao chốt tươi theo báo giá FZR tại lúc mua</span>
        </div>
        {stars ? (
          <>
            <VariantRow v={stars} returnTo={RT} meta={`Giá hiển thị mỗi sao: ${fmtVnd(stars.price)} (tự cập nhật theo báo giá)`} />
            <p className="px-4 pb-4 text-xs leading-relaxed text-slate-400">
              Giá bán thật của Stars = giá mỗi sao phía FZR × tỉ giá × (1 + markup%) của nhà cung cấp ở thẻ trên — sửa markup/tỉ giá để đổi giá bán; ô giá ở hàng gói chỉ là giá hiển thị gần nhất.
            </p>
          </>
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">Chưa có gói Stars — đồng bộ catalog FZR để tạo gói.</p>
        )}
      </section>

      {/* Họ Premium */}
      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="text-brand-600">{I.gem}</span>
          <h2 className="text-[15px] font-bold text-slate-800">Gói Premium</h2>
          <span className="text-xs text-slate-400">Các gói theo tháng — giá bán sửa ở đây là giá trang khách tính tiền</span>
        </div>
        {premium.length ? (
          premium.map((v) => (
            <VariantRow key={v.id} v={v} returnTo={RT} meta={`Thời hạn: ${v.providerCycle ?? v.providerItemId ?? "—"} tháng`} />
          ))
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">Chưa có gói Premium — đồng bộ catalog FZR hoặc thêm gói ở dưới.</p>
        )}
        <form action={famAddTelegramPlan} className="flex flex-wrap items-end gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3.5">
          <input type="hidden" name="returnTo" value={RT} />
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-400">Số tháng</span>
            <input name="months" type="number" min={1} max={36} required placeholder="24" className="inp !w-24 !py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-400">Tên gói (trống = “N tháng”)</span>
            <input name="name" placeholder="24 tháng" className="inp !w-44 !py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold text-slate-400">Giá bán (VNĐ)</span>
            <input name="price" type="number" min={1} required placeholder="699000" className="inp !w-36 !py-2 text-[13px]" />
          </label>
          <button className="btn-primary btn-sm !px-3.5 !py-2">Thêm gói</button>
        </form>
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Quyền sở hữu khi đồng bộ FZR: gói do đồng bộ tạo có thể bị ghi đè giá (khi nhà cung cấp bật Tự cập nhật giá), ghi đè tên (khi bật Đồng bộ nội dung) và được bật lại nếu FZR còn bán; gói gắn nhãn “Tự thêm” do admin tạo thì đồng bộ không đụng vào. Tắt bán ở đây chặn mua ngay lập tức.
      </p>
    </div>
  );
}
