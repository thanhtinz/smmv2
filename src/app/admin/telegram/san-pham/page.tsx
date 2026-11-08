import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, I } from "@/components/ui";
import { ProviderPricingCard, VariantRow, fmtVnd, AreaSyncCard, AdminPager } from "@/components/admin-families";
import { famAddStarPackage } from "@/app/actions/admin-families";
import { TelegramPremiumAddForm } from "@/components/fzr-picker";
import { AdminFamilyTabs } from "@/components/admin-tabs";
import { loadTelegramFamilies } from "@/lib/families";
import { getSettings } from "@/lib/settings";
import { fzrMarkupKey } from "@/lib/fzr-markup";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const RT = "/admin/telegram/san-pham";

/** FIX8 TASK 4 + FIX9 — Sản phẩm Telegram theo đúng 2 họ phía FZR: Gói Stars
 *  (1 gói đơn vị là neo thực thi + DANH SÁCH GÓI SAO theo số lượng mà khách
 *  chọn trên trang đặt đơn — thêm/sửa/xoá/bật tắt tại đây, ghi vào đúng các
 *  PremiumVariant telegram_stars của catalog) và Gói Premium (các gói theo
 *  tháng, giá bán = giá gói trong catalog). Hai họ tách thành 2 TAB (?tab=),
 *  form thêm gói nằm ở ĐẦU mỗi tab; thẻ đồng bộ & markup phủ cả 2 nhóm nên
 *  ở ngoài, phía trên tab. */
const PAGE_SIZE = 20;

export default async function AdminTelegramProducts({ searchParams }: { searchParams: { msg?: string; err?: string; spage?: string; ppage?: string; tab?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const { provider, stars, starsPackages, premium } = await loadTelegramFamilies();
  const activeTab = searchParams.tab === "premium" ? "premium" : "stars";
  const rtTab = `${RT}?tab=${activeTab}`;
  const rtStars = `${RT}?tab=stars`;
  const rtPremium = `${RT}?tab=premium`;
  // Phân trang phía máy chủ cho 2 danh sách gói (gói sao theo `spage`, gói
  // Premium theo `ppage`) — mỗi trang 20 gói, lật trang giữ trang của họ kia
  // và giữ nguyên tab đang mở.
  const starsPages = Math.max(1, Math.ceil(starsPackages.length / PAGE_SIZE));
  const starsPage = Math.min(starsPages, Math.max(1, parseInt(searchParams.spage || "1") || 1));
  const starsSlice = starsPackages.slice((starsPage - 1) * PAGE_SIZE, starsPage * PAGE_SIZE);
  const premiumPages = Math.max(1, Math.ceil(premium.length / PAGE_SIZE));
  const premiumPage = Math.min(premiumPages, Math.max(1, parseInt(searchParams.ppage || "1") || 1));
  const premiumSlice = premium.slice((premiumPage - 1) * PAGE_SIZE, premiumPage * PAGE_SIZE);
  const settings = await getSettings();
  const areaOverrides = { telegram_stars: settings[fzrMarkupKey("telegram_stars")] || "", telegram_premium: settings[fzrMarkupKey("telegram_premium")] || "" };

  const starsSection = (
    <section className="card mb-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <span className="text-amber-500">{I.star}</span>
        <h2 className="text-[15px] font-bold text-slate-800">Gói Stars</h2>
        <span className="text-xs text-slate-400">Mua sao Telegram theo số lượng — giá mỗi sao chốt tươi theo báo giá FZR tại lúc mua</span>
      </div>
      <form action={famAddStarPackage} className="flex flex-wrap items-end gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
        <input type="hidden" name="returnTo" value={rtStars} />
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-400">Số sao</span>
          <input name="amount" type="number" min={1} max={10000000} required placeholder="777" className="inp !w-28 !py-2 text-[13px]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-400">Tên gói (trống = “N sao”)</span>
          <input name="name" placeholder="777 sao" className="inp !w-40 !py-2 text-[13px]" />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-400">Giá hiển thị (VNĐ, trống = tự tính)</span>
          <input name="price" type="number" min={0} placeholder="11655" className="inp !w-40 !py-2 text-[13px]" />
        </label>
        <button className="btn-primary btn-sm !px-3.5 !py-2">Thêm gói sao</button>
      </form>
      {stars ? (
        <>
          <VariantRow v={stars} returnTo={rtStars} meta={`Gói đơn vị (neo thực thi của mọi đơn sao) · Giá hiển thị mỗi sao: ${fmtVnd(stars.price)} (tự cập nhật theo báo giá)`} />
          <p className="px-4 pb-4 text-xs leading-relaxed text-slate-400">
            Giá bán thật của Stars = giá mỗi sao phía FZR × tỉ giá × (1 + markup%) của nhà cung cấp ở thẻ trên — sửa markup/tỉ giá để đổi giá bán; ô giá ở hàng gói đơn vị chỉ là giá hiển thị gần nhất.
          </p>
        </>
      ) : (
        <p className="px-5 py-4 text-sm text-slate-400">Chưa có gói Stars đơn vị — đồng bộ catalog FZR để tạo gói.</p>
      )}
      <div className="border-t border-slate-100 px-5 pb-1 pt-4">
        <h3 className="text-sm font-bold text-slate-800">Danh sách gói sao</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Đây là các gói khách chọn trong mục “Chọn gói sao” của trang đặt đơn. Giá tính tiền thật của mỗi gói vẫn chốt theo
          báo giá FZR tại lúc mua (giá mỗi sao × số sao của gói) — giá ghi ở từng gói dưới đây chỉ là giá hiển thị.
        </p>
      </div>
      {starsPackages.length ? (
        <>
          {starsSlice.map((v) => (
            <VariantRow key={v.id} v={v} returnTo={rtStars} meta={`Gói ${v.providerItemId} sao · giá hiển thị`} deletable />
          ))}
          <div className="px-4">
            <AdminPager basePath={RT} page={starsPage} pages={starsPages} total={starsPackages.length} unit="gói sao" param="spage" params={{ ppage: String(premiumPage), tab: "stars" }} />
          </div>
        </>
      ) : (
        <p className="px-5 py-4 text-sm text-slate-400">Chưa có gói sao nào trong catalog — trang đặt đơn đang dùng danh sách mặc định. Đồng bộ catalog FZR hoặc thêm gói ở trên để tự quản lý danh sách.</p>
      )}
    </section>
  );

  const premiumSection = (
    <section className="card mb-4 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
        <span className="text-brand-600">{I.gem}</span>
        <h2 className="text-[15px] font-bold text-slate-800">Gói Premium</h2>
        <span className="text-xs text-slate-400">Các gói theo tháng — giá bán sửa ở đây là giá trang khách tính tiền</span>
      </div>
      <TelegramPremiumAddForm returnTo={rtPremium} />
      {premium.length ? (
        <>
          {premiumSlice.map((v) => (
            <VariantRow key={v.id} v={v} returnTo={rtPremium} meta={`Thời hạn: ${v.providerCycle ?? v.providerItemId ?? "—"} tháng`} />
          ))}
          <div className="px-4">
            <AdminPager basePath={RT} page={premiumPage} pages={premiumPages} total={premium.length} unit="gói" param="ppage" params={{ spage: String(starsPage), tab: "premium" }} />
          </div>
        </>
      ) : (
        <p className="px-5 py-4 text-sm text-slate-400">Chưa có gói Premium — đồng bộ catalog FZR hoặc thêm gói ở trên.</p>
      )}
    </section>
  );

  return (
    <div>
      <PageHead
        title={L("Sản phẩm Telegram")}
        desc={L("Hai họ gói Telegram theo nhà cung cấp: Stars và Premium. Sửa giá/tên/bật tắt tại đây áp dụng ngay cho trang đặt đơn Telegram.")}
      />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      {!provider && (
        <div className="card mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Chưa cấu hình nhà cung cấp FZR cho Telegram — vào Admin → Nhà cung cấp để chọn nhà cung cấp phục vụ Telegram, rồi đồng bộ catalog tại đó.
        </div>
      )}
      {provider && <ProviderPricingCard provider={provider} returnTo={rtTab} />}
      {provider && <AreaSyncCard provider={provider} groups={["telegram_stars", "telegram_premium"]} overrides={areaOverrides} returnTo={rtTab} />}

      <AdminFamilyTabs
        key={activeTab}
        initial={activeTab}
        tabs={[
          { id: "stars", label: "Gói Sao", content: starsSection },
          { id: "premium", label: "Gói Premium", content: premiumSection },
        ]}
      />

      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Quyền sở hữu khi đồng bộ FZR: gói do đồng bộ tạo có thể bị ghi đè giá (khi nhà cung cấp bật Tự cập nhật giá), ghi đè tên (khi bật Đồng bộ nội dung) và được bật lại nếu FZR còn bán; gói gắn nhãn “Tự thêm” do admin tạo thì đồng bộ không đụng vào. Tắt bán ở đây chặn mua ngay lập tức.
      </p>
    </div>
  );
}
