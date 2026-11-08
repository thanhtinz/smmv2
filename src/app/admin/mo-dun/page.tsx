import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, I } from "@/components/ui";
import { saveModulesAction } from "@/app/actions/admin-features";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

type Mod = { key: string; name: string; desc: string; icon: React.ReactNode };

const MODULES: Mod[] = [
  { key: "module_smm", name: "Đặt đơn SMM", desc: "Bán dịch vụ SMM cho khách.", icon: I.cart },
  { key: "module_premium", name: "Tài khoản Premium", desc: "Bán tài khoản Premium cho khách.", icon: I.gem },
  { key: "module_register", name: "Đăng ký tài khoản", desc: "Cho khách đăng ký tài khoản mới.", icon: I.users },
  { key: "module_bulk", name: "Đặt hàng loạt", desc: "Đặt nhiều đơn cùng lúc.", icon: I.layers },
  { key: "module_promo", name: "Mã giảm giá", desc: "Áp mã giảm giá khi đặt đơn.", icon: I.gift },
  { key: "module_affiliate", name: "Giới thiệu (Affiliate)", desc: "Hoa hồng cho người giới thiệu.", icon: I.money },
  { key: "module_tickets", name: "Hỗ trợ / Ticket", desc: "Khách mở ticket hỗ trợ.", icon: I.ticket },
  { key: "module_api", name: "API đại lý", desc: "API /api/v2 cho đại lý.", icon: I.key },
  { key: "module_blog", name: "Bài viết", desc: "Tin tức, hướng dẫn trên website.", icon: I.file },
  { key: "livechat_enabled", name: "Tư vấn nổi (AI)", desc: "Nút tư vấn nổi gợi ý dịch vụ.", icon: I.cpu },
  { key: "support_widget_enabled", name: "Widget liên hệ nổi", desc: "Nút liên hệ Zalo / Telegram / Facebook / Hotline.", icon: I.bell },
];

/** Mô-đun — chỗ bật/tắt từng mảng chức năng của hệ thống, danh sách phẳng một thẻ.
 *  Panel con còn có công tắc riêng cho khách của panel đó ở trang Mô-đun của panel. */
export default async function AdminModules({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const s = await getSettings();
  return (
    <div>
      <PageHead title={L("Mô-đun")} desc={L("Bật / tắt từng mảng chức năng của hệ thống.")}>
        <button className="btn-primary !py-2.5" form="modules-form" type="submit">{L("Lưu thay đổi")}</button>
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form id="modules-form" action={saveModulesAction}>
        <div className="card divide-y divide-slate-100 p-0">
          {MODULES.map((m) => {
            const on = (s as Record<string, string>)[m.key] !== "0";
            return (
              <label key={m.key} className="flex cursor-pointer items-center gap-4 px-6 py-4 transition hover:bg-slate-50">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${on ? "bg-brand-50 text-brand-600" : "bg-slate-100 text-slate-400"}`}>{m.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-900">{L(m.name)}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">{L(m.desc)}</span>
                </span>
                <span className={`shrink-0 text-sm font-semibold ${on ? "text-emerald-600" : "text-slate-400"}`}>{on ? L("Đang bật") : L("Đang tắt")}</span>
                <input type="checkbox" name={m.key} defaultChecked={on} className="h-5 w-5 shrink-0 accent-brand-600" />
              </label>
            );
          })}
        </div>
        <button className="btn-primary mt-5 w-full !py-3 md:w-auto">{L("Lưu thay đổi")}</button>
      </form>
    </div>
  );
}
