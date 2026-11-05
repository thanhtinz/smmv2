import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { saveContactAction } from "@/app/actions/admin-features";
import { Switch } from "@/components/admin-catalog";

export const dynamic = "force-dynamic";

/** Liên hệ — kênh hỗ trợ hiện ở widget nổi + công tắc widget liên hệ và AI tư vấn (chat nổi).
 *  Công tắc ở đây là công tắc TỔNG: tắt là ẩn trên web mẹ, khu khách và mọi gian hàng con. */
export default async function AdminContactPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  const aiOn = s.ai_enabled === "1" && !!s.ai_api_key;
  return (
    <div>
      <PageHead title="Liên hệ" desc="Kênh hỗ trợ hiển thị cho khách và các widget nổi trên toàn hệ thống (web mẹ + gian hàng con)." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form action={saveContactAction} className="grid items-start gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <div className="font-bold text-slate-900">Kênh liên hệ của web chính</div>
          <p className="mt-1 text-sm text-slate-400">Hiện ở các nút nổi góc màn hình. Gian hàng con để trống kênh nào thì dùng kênh của web chính.</p>
          <div className="mt-4 space-y-4">
            <div><label className="lbl">Zalo</label><input className="inp" name="support_zalo" defaultValue={s.support_zalo} placeholder="Số Zalo hoặc link zalo.me/…" /></div>
            <div><label className="lbl">Telegram</label><input className="inp" name="support_telegram" defaultValue={s.support_telegram} placeholder="@username hoặc link t.me/…" /></div>
            <div><label className="lbl">Facebook</label><input className="inp" name="support_facebook" defaultValue={s.support_facebook} placeholder="Link fanpage / Messenger" /></div>
            <div><label className="lbl">Hotline</label><input className="inp" name="support_hotline" defaultValue={s.support_hotline} placeholder="Số điện thoại hỗ trợ" /></div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-2">
            <Switch name="support_widget_enabled" label="Hiện widget liên hệ nổi" defaultChecked={s.support_widget_enabled !== "0"} />
          </div>
        </div>
        <div className="card p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold text-slate-900">AI tư vấn (chat nổi &quot;Tư vấn&quot;)</div>
            <Badge cls={aiOn ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}>{aiOn ? "AI đã cấu hình" : "Đang dùng tìm kiếm từ khoá"}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-400">Khách bấm nút Tư vấn để được gợi ý dịch vụ theo đúng giá của họ. Chủ panel con có thể dùng key AI riêng của họ; công tắc dưới đây là công tắc tổng của toàn hệ thống.</p>
          <div className="mt-4 space-y-1.5 text-sm">
            <div className="flex justify-between gap-3"><span className="text-slate-400">Trạng thái AI</span><b className="text-slate-700">{s.ai_enabled === "1" ? "Đang bật" : "Đang tắt"}</b></div>
            <div className="flex justify-between gap-3"><span className="text-slate-400">Nhà cung cấp</span><b className="text-slate-700">{s.ai_provider || "—"}</b></div>
            <div className="flex justify-between gap-3"><span className="text-slate-400">Model</span><b className="text-slate-700">{s.ai_model || "—"}</b></div>
            <div className="flex justify-between gap-3"><span className="text-slate-400">API key</span><b className="text-slate-700">{s.ai_api_key ? "Đã nhập" : "Chưa nhập"}</b></div>
          </div>
          <div className="mt-4 border-t border-slate-100 pt-2">
            <Switch name="livechat_enabled" label="Hiện nút AI tư vấn trên toàn hệ thống" defaultChecked={s.livechat_enabled !== "0"} />
          </div>
          <Link href="/admin/cau-hinh" className="btn-ghost mt-4 inline-block">Mở Cấu hình → tab AI để nhập key</Link>
        </div>
        <div className="lg:col-span-2">
          <button className="btn-primary !py-2.5 px-8">Lưu cấu hình liên hệ</button>
        </div>
      </form>
    </div>
  );
}
