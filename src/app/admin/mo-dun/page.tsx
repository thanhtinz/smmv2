import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, I } from "@/components/ui";
import { saveModulesAction } from "@/app/actions/admin-features";

export const dynamic = "force-dynamic";

const MODULES = [
  { key: "module_smm", name: "Đặt đơn SMM", desc: "Tắt là khách không đặt đơn SMM mới được (web). Đơn đang chạy và API đại lý không bị ảnh hưởng.", icon: I.cart },
  { key: "module_premium", name: "Tài khoản Premium", desc: "Tắt là khách không mua Premium mới được trên web.", icon: I.gem },
  { key: "module_panels", name: "Panel con", desc: "Tắt là không mở panel mới, khách không đăng ký qua panel và gian hàng con ngừng hiển thị.", icon: I.panels },
  { key: "module_affiliate", name: "Giới thiệu (Affiliate)", desc: "Tắt là hệ thống ngừng cộng hoa hồng giới thiệu cho các đơn mới.", icon: I.money },
  { key: "module_register", name: "Đăng ký tài khoản", desc: "Tắt là không ai đăng ký tài khoản mới được (cả web chính lẫn qua panel con).", icon: I.users },
] as const;

export default async function AdminModules({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  return (
    <div>
      <PageHead title="Mô-đun" desc="Bật / tắt từng mảng chức năng của hệ thống. Thay đổi áp dụng ngay cho toàn bộ khách." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form action={saveModulesAction} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((m) => {
          const on = s[m.key] !== "0";
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
        <div className="flex items-end">
          <button className="btn-primary w-full md:w-auto">Lưu trạng thái mô-đun</button>
        </div>
      </form>
    </div>
  );
}
