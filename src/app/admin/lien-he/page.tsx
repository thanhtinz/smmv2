import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { saveContactAction, saveContactWidgetAction, deleteContactWidgetAction, toggleContactWidgetAction, seedContactWidgetsAction } from "@/app/actions/admin-features";
import { Switch } from "@/components/admin-catalog";
import { ContactWidgetsManager } from "@/components/contact-widgets";
import { listContactWidgets } from "@/lib/contact";

export const dynamic = "force-dynamic";

/** Widget Liên hệ — quản lý danh sách các kênh liên hệ hiển thị trên website:
 *  thêm/sửa/xoá/bật-tắt từng kênh, kèm ảnh tải lên. Bên dưới là thẻ AI tư vấn
 *  với công tắc tổng của widget liên hệ và nút chat AI trên toàn hệ thống. */
export default async function AdminContactPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const items = await listContactWidgets(null);
  const hasLegacy = !!(s.support_zalo || s.support_telegram || s.support_facebook || s.support_hotline);
  const aiOn = s.ai_enabled === "1" && !!s.ai_api_key;
  return (
    <div>
      <PageHead title="Widget Liên hệ" desc="Quản lý các kênh liên hệ hiển thị trên website" />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div>
        <ContactWidgetsManager
          items={items}
          saveAction={saveContactWidgetAction}
          deleteAction={deleteContactWidgetAction}
          toggleAction={toggleContactWidgetAction}
          seedAction={seedContactWidgetsAction}
          hasLegacy={hasLegacy}
        />
        <div className="mt-6 grid items-start gap-6 xl:grid-cols-2">
          <form action={saveContactAction} className="card p-6">
            <div className="font-bold text-slate-900">Hiển thị widget</div>
            <p className="mt-1 text-sm text-slate-400">Công tắc tổng — tắt là ẩn trên web mẹ, khu khách và mọi website con.</p>
            <div className="mt-3">
              <Switch name="support_widget_enabled" label="Hiện widget liên hệ nổi" defaultChecked={s.support_widget_enabled !== "0"} />
              <Switch name="livechat_enabled" label="Hiện nút AI tư vấn trên toàn hệ thống" defaultChecked={s.livechat_enabled !== "0"} />
            </div>
            <p className="mt-3 text-[13px] leading-relaxed text-slate-400">Thay đổi áp dụng ngay sau khi lưu cho web mẹ, khu khách và mọi website con. Panel con có thể tắt riêng từng nút cho khách của mình ở trang Mô-đun của panel.</p>
            <button className="btn-primary mt-4 w-full !py-2.5">Lưu công tắc</button>
          </form>
          <div className="card p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold text-slate-900">AI tư vấn (chat nổi &quot;Tư vấn&quot;)</div>
              <Badge cls={aiOn ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}>{aiOn ? "AI đã cấu hình" : "Đang dùng tìm kiếm từ khoá"}</Badge>
            </div>
            <p className="mt-1 text-sm text-slate-400">Khách bấm nút Tư vấn để được gợi ý dịch vụ theo đúng giá của họ. Chủ panel con có thể dùng key AI riêng của họ.</p>
            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><span className="text-slate-400">Trạng thái AI</span><b className="text-slate-700">{s.ai_enabled === "1" ? "Đang bật" : "Đang tắt"}</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Nhà cung cấp</span><b className="text-slate-700">{s.ai_provider || "—"}</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">Model</span><b className="text-slate-700">{s.ai_model || "—"}</b></div>
              <div className="flex justify-between gap-3"><span className="text-slate-400">API key</span><b className="text-slate-700">{s.ai_api_key ? "Đã nhập" : "Chưa nhập"}</b></div>
            </div>
            <Link href="/admin/cau-hinh" className="btn-ghost mt-4 inline-block">Mở Cấu hình → tab AI để nhập key</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
