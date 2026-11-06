import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, I } from "@/components/ui";
import { saveModulesAction } from "@/app/actions/admin-features";

export const dynamic = "force-dynamic";

type Mod = { key: string; name: string; desc: string; icon: React.ReactNode };

const MODULES: Mod[] = [
  { key: "module_smm", name: "Đặt đơn SMM", desc: "Tắt là khách không đặt đơn SMM mới được (cả web và API).", icon: I.cart },
  { key: "module_premium", name: "Tài khoản Premium", desc: "Tắt là khách không mua Premium mới được.", icon: I.gem },
  { key: "module_panels", name: "Website con", desc: "Tắt là không mở website con mới, khách không đăng ký qua panel và gian hàng con ngừng hiển thị.", icon: I.panels },
  { key: "module_register", name: "Đăng ký tài khoản", desc: "Tắt là không ai đăng ký tài khoản mới được (cả web chính lẫn qua website con).", icon: I.users },
  { key: "module_bulk", name: "Đặt hàng loạt", desc: "Trang dán nhiều dòng đơn cùng lúc trong khu khách hàng.", icon: I.layers },
  { key: "module_subscriptions", name: "Đăng ký định kỳ", desc: "Đơn hẹn giờ / lặp lại: tắt là khách không tạo gói mới và các gói đang chạy ngừng đặt tiếp.", icon: I.clock },
  { key: "module_campaigns", name: "Chiến dịch", desc: "Gom đơn theo chiến dịch có trần ngân sách trong khu khách hàng.", icon: I.megaphone },
  { key: "module_promo", name: "Mã giảm giá", desc: "Tắt là mọi mã giảm giá ngừng áp dụng khi đặt đơn (kể cả mã riêng của panel con).", icon: I.gift },
  { key: "module_affiliate", name: "Giới thiệu (Affiliate)", desc: "Tắt là hệ thống ngừng cộng hoa hồng giới thiệu cho các đơn mới.", icon: I.money },
  { key: "module_tickets", name: "Hỗ trợ / Ticket", desc: "Tắt là khách không mở ticket mới được và mục Hỗ trợ ẩn khỏi khu khách hàng.", icon: I.ticket },
  { key: "module_api", name: "API đại lý", desc: "Tắt là API /api/v2 ngừng phục vụ mọi key và trang tài liệu API trong khu khách hàng bị ẩn.", icon: I.key },
  { key: "module_blog", name: "Bài viết", desc: "Tắt là mục Bài viết (tin tức / hướng dẫn) ngừng hiển thị ở web chính và các gian hàng con.", icon: I.file },
  { key: "livechat_enabled", name: "Tư vấn nổi (AI)", desc: "Nút Tư vấn nổi ở góc trang — gợi ý dịch vụ theo nhu cầu khách (dùng AI khi đã cấu hình).", icon: I.cpu },
  { key: "support_widget_enabled", name: "Widget liên hệ nổi", desc: "Nút liên hệ nổi (Zalo / Telegram / Facebook / Hotline) ở góc trang khách.", icon: I.bell },
];

/** Mô-đun — chỗ bật/tắt từng mảng chức năng của hệ thống, danh sách phẳng một thẻ.
 *  Panel con còn có công tắc riêng cho khách của panel đó ở trang Mô-đun của panel. */
export default async function AdminModules({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  return (
    <div>
      <PageHead title="Mô-đun" desc="Bật / tắt từng mảng chức năng của hệ thống. Thay đổi áp dụng ngay khi lưu; panel con còn có công tắc riêng cho khách của panel đó.">
        <button className="btn-primary !py-2.5" form="modules-form" type="submit">Lưu thay đổi</button>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form id="modules-form" action={saveModulesAction}>
        <div className="card divide-y divide-slate-100 p-0">
          {MODULES.map((m) => {
            const on = (s as Record<string, string>)[m.key] !== "0";
            return (
              <label key={m.key} className="flex cursor-pointer items-center gap-4 px-6 py-4 transition hover:bg-slate-50">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"}`}>{m.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-900">{m.name}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">{m.desc}</span>
                </span>
                <span className={`shrink-0 text-sm font-semibold ${on ? "text-emerald-600" : "text-slate-400"}`}>{on ? "Đang bật" : "Đang tắt"}</span>
                <input type="checkbox" name={m.key} defaultChecked={on} className="h-5 w-5 shrink-0 accent-brand-600" />
              </label>
            );
          })}
        </div>
        <button className="btn-primary mt-5 w-full !py-3 md:w-auto">Lưu thay đổi</button>
      </form>
    </div>
  );
}
