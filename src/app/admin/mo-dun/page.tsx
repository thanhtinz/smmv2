import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge, Stat, I } from "@/components/ui";
import { saveModulesAction } from "@/app/actions/admin-features";

export const dynamic = "force-dynamic";

type Addon = {
  key: string; name: string; desc: string; icon: React.ReactNode;
  features: string[]; tags: string[]; configHref?: string; configLabel?: string; hot?: boolean;
};

const ADDONS: Addon[] = [
  { key: "module_smm", name: "Đặt đơn SMM", desc: "Mảng bán dịch vụ tăng tương tác — mảng kinh doanh chính của website.", icon: I.cart, features: ["Đặt đơn trên web và qua API", "Đồng bộ trạng thái đơn tự động", "Hoàn tiền tự động khi đơn lỗi"], tags: ["Kinh doanh", "SMM"], configHref: "/admin/dich-vu", configLabel: "Danh sách dịch vụ", hot: true },
  { key: "module_premium", name: "Tài khoản Premium", desc: "Bán tài khoản Premium (Netflix, Spotify, ChatGPT, Canva...) giao tự động hoặc qua API.", icon: I.gem, features: ["Kho tài khoản giao tự động", "Sản phẩm đấu API hoặc xử lý tay", "Bảo hành theo gói"], tags: ["Kinh doanh", "Premium"], configHref: "/admin/premium", configLabel: "Sản phẩm & Gói", hot: true },
  { key: "module_panels", name: "Website con", desc: "Cho khách mở gian hàng riêng bằng tên miền của họ, nguồn hàng đấu về web mẹ.", icon: I.panels, features: ["Tạo website con bằng tên miền", "Giá và cấu hình riêng từng gian hàng", "Website con lồng nhau nhiều tầng"], tags: ["Kinh doanh", "Panel"], configHref: "/admin/panel-con", configLabel: "Panel con" },
  { key: "module_register", name: "Đăng ký tài khoản", desc: "Cho phép khách đăng ký tài khoản mới tại web chính và các gian hàng con.", icon: I.users, features: ["Đăng ký tại web chính + gian hàng con", "Đăng nhập Google", "Điều khoản bắt buộc khi đăng ký"], tags: ["Tài khoản"], configHref: "/admin/cau-hinh", configLabel: "Cài đặt" },
  { key: "module_bulk", name: "Đặt hàng loạt", desc: "Trang dán nhiều dòng đơn cùng lúc trong khu khách hàng.", icon: I.layers, features: ["Dán nhiều link trong một lần đặt", "Báo giá tổng trước khi đặt", "Chặn đơn trùng lặp"], tags: ["Khách hàng", "Đơn hàng"] },
  { key: "module_subscriptions", name: "Đăng ký định kỳ", desc: "Đơn hẹn giờ và đơn lặp lại tự chạy theo lịch khách đặt.", icon: I.clock, features: ["Hẹn giờ chạy một lần", "Lặp lại theo chu kỳ", "Tự dừng khi đủ số lượt"], tags: ["Khách hàng", "Đơn hàng"] },
  { key: "module_campaigns", name: "Chiến dịch", desc: "Gom đơn theo chiến dịch có trần ngân sách trong khu khách hàng.", icon: I.megaphone, features: ["Trần ngân sách mỗi chiến dịch", "Theo dõi chi tiêu theo chiến dịch"], tags: ["Khách hàng"] },
  { key: "module_promo", name: "Mã giảm giá", desc: "Mã giảm giá cho đơn SMM và Premium, dùng chung hoặc riêng từng gian hàng.", icon: I.gift, features: ["Giảm % hoặc số tiền cố định", "Giới hạn lượt dùng và thời hạn", "Mã riêng cho từng panel con"], tags: ["Khách hàng", "Khuyến mãi"], configHref: "/admin/ma-giam-gia", configLabel: "Mã giảm giá" },
  { key: "module_affiliate", name: "Giới thiệu (Affiliate)", desc: "Hoa hồng giới thiệu tính trên giao dịch mua của người được giới thiệu.", icon: I.money, features: ["Hoa hồng trên đơn mua SMM + Premium", "Thu hồi theo tỉ lệ khi hoàn tiền", "% riêng cho từng panel con"], tags: ["Khách hàng", "Hoa hồng"], configHref: "/admin/cau-hinh", configLabel: "Cài đặt" },
  { key: "module_tickets", name: "Hỗ trợ / Ticket", desc: "Khách mở ticket hỗ trợ, admin và chủ panel trả lời trong trang quản trị.", icon: I.ticket, features: ["Ticket kèm đơn hàng liên quan", "Thông báo khi có trả lời mới"], tags: ["Khách hàng", "Hỗ trợ"], configHref: "/admin/ticket", configLabel: "Ticket hỗ trợ" },
  { key: "module_api", name: "API đại lý", desc: "API /api/v2 chuẩn SMM cho đại lý và các panel con đấu nối.", icon: I.key, features: ["Đặt đơn, tra trạng thái, số dư", "Tài liệu API trong khu khách hàng", "Nhật ký gọi API"], tags: ["API", "Đại lý"], configHref: "/admin/nhat-ky", configLabel: "Nhật ký API" },
  { key: "module_blog", name: "Bài viết", desc: "Tin tức và hướng dẫn hiển thị ở web chính và các gian hàng con.", icon: I.file, features: ["Bài viết theo danh mục", "Ghim bài lên đầu", "Bài viết riêng từng gian hàng"], tags: ["Nội dung"], configHref: "/admin/bai-viet", configLabel: "Tất cả bài viết" },
  { key: "livechat_enabled", name: "Tư vấn nổi (AI)", desc: "Nút Tư vấn nổi ở góc trang — gợi ý dịch vụ theo nhu cầu của khách.", icon: I.cpu, features: ["Gợi ý dịch vụ theo giá của từng khách", "Dùng AI khi đã cấu hình key", "Giá riêng theo gian hàng con"], tags: ["Hiển thị", "AI"], configHref: "/admin/lien-he", configLabel: "Widget Liên hệ" },
  { key: "support_widget_enabled", name: "Widget liên hệ nổi", desc: "Nút liên hệ nổi (Zalo / Telegram / Facebook / Hotline) ở góc trang khách.", icon: I.bell, features: ["Nhiều kênh liên hệ tuỳ chỉnh", "Widget riêng cho từng gian hàng"], tags: ["Hiển thị", "Hỗ trợ"], configHref: "/admin/lien-he", configLabel: "Widget Liên hệ" },
];

/** Cửa hàng Addon — trình bày như panel mẫu: thẻ thống kê + thanh lọc + lưới thẻ addon,
 *  mỗi tính năng là một thẻ riêng có công tắc bật/tắt thật (không gộp nhóm). */
export default async function AdminModules({ searchParams }: { searchParams: { msg?: string; err?: string; f?: string; q?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const f = searchParams.f === "on" || searchParams.f === "off" ? searchParams.f : "all";
  const q = (searchParams.q || "").trim().toLowerCase();
  const isOn = (k: string) => (s as Record<string, string>)[k] !== "0";
  const onCount = ADDONS.filter((a) => isOn(a.key)).length;
  const items = ADDONS.filter((a) => {
    if (f === "on" && !isOn(a.key)) return false;
    if (f === "off" && isOn(a.key)) return false;
    if (q && !a.name.toLowerCase().includes(q) && !a.desc.toLowerCase().includes(q)) return false;
    return true;
  });
  const tabCls = (active: boolean) => `rounded-full px-4 py-2 text-sm font-semibold transition ${active ? "bg-brand-600 text-white" : "bg-white text-slate-600 border border-slate-200 hover:border-brand-300"}`;
  return (
    <div>
      <PageHead title="Cửa hàng Addon & Tiện Ích Mở Rộng" desc="Khám phá và bật / tắt các tính năng mở rộng cho website của bạn. Panel con còn có công tắc riêng cho khách của panel đó.">
        <button className="btn-primary !py-2.5" form="addons-form" type="submit">Lưu thay đổi</button>
      </PageHead>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Stat label="Tổng Addon" value={String(ADDONS.length)} icon={I.layers} tone="brand" />
        <Stat label="Đang bật" value={String(onCount)} icon={I.check} tone="emerald" />
        <Stat label="Đang tắt" value={String(ADDONS.length - onCount)} icon={I.bell} tone="rose" />
        <Stat label="Áp dụng" value="Web mẹ + Panel con" icon={I.panels} tone="violet" />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href="/admin/mo-dun" className={tabCls(f === "all")}>Tất cả ({ADDONS.length})</Link>
        <Link href="/admin/mo-dun?f=on" className={tabCls(f === "on")}>Đang bật ({onCount})</Link>
        <Link href="/admin/mo-dun?f=off" className={tabCls(f === "off")}>Đang tắt ({ADDONS.length - onCount})</Link>
        <form method="get" className="ml-auto flex gap-2">
          {f !== "all" && <input type="hidden" name="f" value={f} />}
          <input name="q" defaultValue={searchParams.q || ""} placeholder="Tìm addon, tính năng..." className="inp !w-64" />
          <button className="btn-ghost !py-2">Tìm</button>
        </form>
      </div>
      <form id="addons-form" action={saveModulesAction}>
        {/* Addon đang bị lọc ẩn mà đang BẬT phải giữ trạng thái bằng input ẩn,
            nếu không Lưu sẽ tắt nhầm chúng (action đọc thiếu = tắt). */}
        {ADDONS.filter((a) => !items.includes(a) && isOn(a.key)).map((a) => (
          <input key={a.key} type="hidden" name={a.key} value="on" />
        ))}
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {items.map((a) => {
            const on = isOn(a.key);
            return (
              <div key={a.key} className="card relative p-6">
                {a.hot && <span className="absolute right-4 top-4"><Badge cls="bg-rose-600 text-white">HOT</Badge></span>}
                <div className="flex items-start gap-4">
                  <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${on ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"}`}>{a.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-900">{a.name}</span>
                      {on ? <Badge cls="bg-emerald-50 text-emerald-600">Đang bật</Badge> : <Badge cls="bg-slate-100 text-slate-500">Đang tắt</Badge>}
                    </div>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500">{a.desc}</p>
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5">
                  {a.features.map((ft) => (
                    <li key={ft} className="flex items-center gap-2 text-sm text-slate-600"><span className="text-emerald-500">{I.check}</span>{ft}</li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {a.tags.map((t) => <span key={t} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">{t}</span>)}
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">v1.0</span>
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-4">
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input type="checkbox" name={a.key} defaultChecked={on} className="h-5 w-5 accent-brand-600" />
                    <span className={`text-sm font-semibold ${on ? "text-emerald-600" : "text-slate-400"}`}>{on ? "Đang bật" : "Đang tắt"}</span>
                  </label>
                  {a.configHref && <Link href={a.configHref} className="btn-ghost btn-sm">{a.configLabel}</Link>}
                </div>
              </div>
            );
          })}
        </div>
        {items.length === 0 && <div className="card mt-5 p-8 text-center text-sm text-slate-400">Không có addon nào khớp bộ lọc.</div>}
        <button className="btn-primary mt-5 w-full !py-3 md:w-auto">Lưu thay đổi</button>
      </form>
    </div>
  );
}
