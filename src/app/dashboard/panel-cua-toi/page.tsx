import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, I } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { createPanelWizardAction, renewPanelAction } from "@/app/actions/user";
import { PanelWizard } from "@/components/panel-wizard";
import { PanelSitesTable } from "@/components/panel-sites-table";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Trang website con của khách: wizard tạo mới (KHÔNG giới hạn số lượng —
 *  phí tính theo tháng, tự gia hạn) + bảng danh sách các website con đã tạo
 *  ở ngay bên dưới. Bước 4/5 của wizard hiển thị tại đây khi URL có
 *  ?step=4|5&panel=<id vừa tạo>. */
export default async function ChildSiteRegisterPage({ searchParams }: { searchParams: { msg?: string; err?: string; step?: string; panel?: string } }) {
  const user = (await getCurrentUser())!;
  const settings = await getSettings();
  const panels = await prisma.childPanel.findMany({ where: { ownerId: user.id }, orderBy: { id: "asc" } });
  const ids = panels.map((x) => x.id);
  const [smmAgg, preAgg] = ids.length
    ? await Promise.all([
        prisma.smmOrder.aggregate({ where: { panelId: { in: ids } }, _count: true, _sum: { charge: true, commission: true } }),
        prisma.premiumOrder.aggregate({ where: { panelId: { in: ids } }, _count: true, _sum: { total: true, commission: true } }),
      ])
    : [null, null];
  const totalOrders = (smmAgg?._count ?? 0) + (preAgg?._count ?? 0);
  const totalRevenue = (smmAgg?._sum.charge ?? 0) + (preAgg?._sum.total ?? 0);
  const totalProfit = (smmAgg?._sum.commission ?? 0) + (preAgg?._sum.commission ?? 0);
  const ns1 = settings.child_ns1 || "";
  const ns2 = settings.child_ns2 || "";
  const parentPanel = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { panelFee: true, langConfig: true } }) : null;
  const panelLangRaw = user.panelId ? (parentPanel?.langConfig ?? null) : undefined;
  const { L, Ld, M } = await getServerI18n(panelLangRaw);
  const creationFee = parentPanel ? Math.max(0, parentPanel.panelFee || 0) : Math.max(0, parseInt(settings.panel_fee || "0") || 0);
  const stats = [
    { icon: I.panels, color: "bg-brand-50 text-brand-600", label: L("Tổng website con"), value: String(panels.length) },
    { icon: I.cart, color: "bg-blue-50 text-blue-600", label: L("Tổng đơn hàng"), value: totalOrders.toLocaleString("vi-VN") },
    { icon: I.chart, color: "bg-emerald-50 text-emerald-600", label: L("Tổng doanh thu"), value: M(totalRevenue) },
    { icon: I.money, color: "bg-amber-50 text-amber-600", label: L("Tổng lợi nhuận"), value: M(totalProfit) },
  ];
  const step = searchParams.step === "4" ? 4 : searchParams.step === "5" ? 5 : 0;
  const stepPanel = step > 0 ? panels.find((x) => x.id === parseInt(searchParams.panel || "")) || panels[panels.length - 1] : undefined;
  const adminStaff = stepPanel ? await prisma.panelStaff.findFirst({ where: { panelId: stepPanel.id, role: "ADMIN" }, include: { user: { select: { username: true } } } }) : null;

  return (
    <div>
      <PageHead title={L("Đăng ký website con")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card flex items-center gap-3.5 p-4">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl [&>svg]:h-5 [&>svg]:w-5 ${s.color}`}>{s.icon}</span>
            <div className="min-w-0">
              <div className="truncate text-xs font-medium text-slate-500">{s.label}</div>
              <div className="truncate text-xl font-extrabold text-slate-900">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      {settings.module_panels === "0" ? (
        <div className="card mt-6 p-6 text-center">
          <h3 className="font-bold text-slate-800">{L("Tính năng website con đang tạm tắt")}</h3>
          <p className="mt-1 text-sm text-slate-500">{L("Hệ thống đang bảo trì tính năng này, vui lòng quay lại sau.")}</p>
        </div>
      ) : step > 0 && stepPanel ? (
        <PostCreateSteps step={step} panel={stepPanel} ns1={ns1} ns2={ns2} adminUsername={adminStaff?.user.username || ""} L={L} Ld={Ld} />
      ) : (
        <>
          <div className="mt-6">
            <PanelWizard
              fee={creationFee}
              balance={user.balance}
              action={createPanelWizardAction}
              defaults={{ fullName: user.fullName || "", email: user.email || "", phone: user.phone || "" }}
            />
          </div>
          <PanelSitesTable
            panels={panels.map((x) => ({ id: x.id, domain: x.domain || "", name: x.name, status: x.status, createdAt: x.createdAt.toISOString(), expiresAt: x.expiresAt ? x.expiresAt.toISOString() : null }))}
            ns1={ns1}
            ns2={ns2}
            fee={creationFee}
            renewAction={renewPanelAction}
          />
        </>
      )}
    </div>
  );
}

/** Thanh 5 bước dùng cho bước 4-5 (render phía server sau khi tạo xong). */
function WizardStepsBar({ step }: { step: number }) {
  return (
    <div className="flex items-center">
      {[1, 2, 3, 4, 5].map((n, i) => {
        const done = n < step || step === 5;
        const cur = n === step && step !== 5;
        return (
          <div key={n} className={`flex items-center ${i < 4 ? "flex-1" : ""}`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 text-sm font-extrabold ${done ? "border-brand-600 bg-brand-600 text-white" : cur ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>{done ? I.check : n}</span>
            {i < 4 && <span className={`mx-2 h-0.5 flex-1 rounded ${n < step || step === 5 ? "bg-brand-600" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

/** Bước 4 (trỏ NameServer) và bước 5 (hoàn tất) của wizard Tạo Child Panel. */
function PostCreateSteps({ step, panel, ns1, ns2, adminUsername, L, Ld }: { step: number; panel: { domain: string | null; name: string }; ns1: string; ns2: string; adminUsername: string; L: (t: string) => string; Ld: (t: string) => string }) {
  const domain = panel.domain || panel.name;
  return (
    <div className="card mt-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">{L("Tạo Child Panel")}</h2>
          <p className="mt-1 text-sm text-slate-500">{L("Khởi tạo SMM Panel riêng trên domain của bạn")}</p>
        </div>
        <span className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Multi-tenant</span>
      </div>
      <div className="mt-6"><WizardStepsBar step={step} /></div>
      {step === 4 ? (
        <div className="mt-7">
          <h3 className="font-bold text-slate-900">{`${L("Trỏ NameServer cho tên miền")} ${domain}`}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">{L("Website con đã được tạo. Vào trang quản lý tên miền nơi bạn đã mua, đổi NameServer của")} <b className="text-slate-700">{domain}</b> {L("thành 2 giá trị dưới đây — website con sẽ hoạt động trên tên miền của bạn ngay khi tên miền cập nhật xong (thường 15 phút – 24 giờ).")}</p>
          <div className="mt-5 max-w-xl space-y-2.5">
            {[["NS1", ns1], ["NS2", ns2]].map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <span className="w-9 shrink-0 text-xs font-extrabold tracking-wide text-slate-400">{k}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{v || "—"}</span>
                {v ? <CopyBtn text={v} /> : null}
              </div>
            ))}
          </div>
          {!ns1 && !ns2 && <p className="mt-3 max-w-xl rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-700">{L("NameServer đang được hệ thống cập nhật. Nếu bạn cần trỏ tên miền ngay, hãy liên hệ hỗ trợ để được cấp thông tin.")}</p>}
          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <Link href="/dashboard/panel-cua-toi?step=5" className="btn-primary btn-sm !px-5 !py-2.5">{L("Tiếp tục ›")}</Link>
            <Link href="/dashboard/panel-cua-toi" className="btn-ghost btn-sm !px-4 !py-2.5">{L("Để sau")}</Link>
          </div>
        </div>
      ) : (
        <div className="mt-7">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">{I.check}</span>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">{L("Tạo Child Panel thành công!")}</h3>
              <p className="mt-0.5 text-sm text-slate-500">{L("Website con của bạn đã sẵn sàng trên tên miền")} <b className="text-slate-700">{domain}</b>.</p>
            </div>
          </div>
          <div className="mt-6 max-w-xl space-y-3 text-sm">
            <div className="flex justify-between gap-4"><span className="text-slate-500">{L("Tên miền website con")}</span><span className="font-bold text-slate-900">{domain}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">{L("Tài khoản quản trị viên")}</span><span className="font-bold text-slate-900">{adminUsername || "—"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">{L("Đăng nhập quản trị bằng")}</span><span className="text-right font-medium text-slate-800">{L("Tài khoản admin vừa tạo, hoặc chính tài khoản này (chủ panel)")}</span></div>
          </div>
          <div className="mt-7 flex flex-wrap gap-2.5 border-t border-slate-100 pt-5">
            <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="btn-primary btn-sm !py-2.5">{L("Mở website con")}</a>
            <a href={`https://${domain}/admin`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm !py-2.5">{L("Quản trị website con")}</a>
            <Link href="/panel-admin" className="btn-ghost btn-sm !py-2.5">{L("Vào Panel Admin")}</Link>
            <Link href="/dashboard/panel-cua-toi" className="btn-ghost btn-sm !py-2.5">{L("Về website con của tôi")}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
