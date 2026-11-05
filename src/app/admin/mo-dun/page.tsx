import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, I } from "@/components/ui";
import { saveModulesAction } from "@/app/actions/admin-features";

export const dynamic = "force-dynamic";

type Mod = { key: string; name: string; desc: string; icon: React.ReactNode };

const GROUPS: { title: string; items: Mod[] }[] = [
  {
    title: "Mảng kinh doanh",
    items: [
      { key: "module_smm", name: "Đặt đơn SMM", desc: "Tắt là khách không đặt đơn SMM mới được (cả web và API).", icon: I.cart },
      { key: "module_premium", name: "Tài khoản Premium", desc: "Tắt là khách không mua Premium mới được.", icon: I.gem },
      { key: "module_panels", name: "Website con", desc: "Tắt là không mở website con mới, khách không đăng ký qua panel và gian hàng con ngừng hiển thị.", icon: I.panels },
      { key: "module_register", name: "Đăng ký tài khoản", desc: "Tắt là không ai đăng ký tài khoản mới được (cả web chính lẫn qua website con).", icon: I.users },
    ],
  },
  {
    title: "Tính năng khách hàng",
    items: [
      { key: "module_bulk", name: "Đặt hàng loạt", desc: "Trang dán nhiều dòng đơn cùng lúc trong khu khách hàng.", icon: I.layers },
      { key: "module_subscriptions", name: "Đăng ký định kỳ", desc: "Đơn hẹn giờ / lặp lại: tắt là khách không tạo gói mới và các gói đang chạy ngừng đặt tiếp.", icon: I.clock },
      { key: "module_campaigns", name: "Chiến dịch", desc: "Gom đơn theo chiến dịch có trần ngân sách trong khu khách hàng.", icon: I.megaphone },
      { key: "module_promo", name: "Mã giảm giá", desc: "Tắt là mọi mã giảm giá ngừng áp dụng khi đặt đơn (kể cả mã riêng của panel con).", icon: I.gift },
      { key: "module_affiliate", name: "Giới thiệu (Affiliate)", desc: "Tắt là hệ thống ngừng cộng hoa hồng giới thiệu cho các đơn mới.", icon: I.money },
      { key: "module_tickets", name: "Hỗ trợ / Ticket", desc: "Tắt là khách không mở ticket mới được và mục Hỗ trợ ẩn khỏi khu khách hàng.", icon: I.ticket },
      { key: "module_api", name: "API đại lý", desc: "Tắt là API /api/v2 ngừng phục vụ mọi key và trang tài liệu API trong khu khách hàng bị ẩn.", icon: I.key },
      { key: "module_blog", name: "Bài viết", desc: "Tắt là mục Bài viết (tin tức / hướng dẫn) ngừng hiển thị ở web chính và các gian hàng con.", icon: I.file },
    ],
  },
  {
    title: "Kênh hiển thị & hỗ trợ",
    items: [
      { key: "livechat_enabled", name: "Tư vấn nổi (AI)", desc: "Nút Tư vấn nổi ở góc trang — gợi ý dịch vụ theo nhu cầu khách (dùng AI khi đã cấu hình).", icon: I.cpu },
      { key: "support_widget_enabled", name: "Widget liên hệ nổi", desc: "Nút liên hệ nổi (Zalo / Telegram / Facebook / Hotline) ở góc trang khách.", icon: I.bell },
    ],
  },
];

export default async function AdminModules({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  return (
    <div>
      <PageHead title="Mô-đun" desc="Bật / tắt TẤT CẢ các mảng chức năng của hệ thống từ một chỗ. Thay đổi áp dụng ngay; panel con còn có công tắc riêng cho khách của panel đó." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form action={saveModulesAction} className="space-y-8">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-400">{g.title}</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {g.items.map((m) => {
                const on = (s as Record<string, string>)[m.key] !== "0";
                return (
                  <div key={m.key} className="card p-5">
                    <div className="flex items-start gap-3">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"}`}>{m.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900">{m.name}</div>
                        <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{m.desc}</p>
                      </div>
                    </div>
                    <label className="mt-4 flex cursor-pointer items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                      <span className={`text-sm font-semibold ${on ? "text-emerald-600" : "text-slate-400"}`}>{on ? "Đang bật" : "Đang tắt"}</span>
                      <input type="checkbox" name={m.key} defaultChecked={on} className="h-5 w-5 accent-brand-600" />
                    </label>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        <div>
          <button className="btn-primary w-full md:w-auto">Lưu trạng thái mô-đun</button>
        </div>
      </form>
    </div>
  );
}
