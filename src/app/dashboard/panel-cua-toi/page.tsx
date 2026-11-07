import Link from "next/link";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge, I } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { createPanelWizardAction } from "@/app/actions/user";
import { PanelWizard } from "@/components/panel-wizard";
import { vnd } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Trang Đăng ký website con (web mẹ) — đúng mô hình thatim /child-panel:
 *  thống kê 4 ô + form tạo CHỈ 1 ô tên miền (không /cua-hang, không slug/tên cho khách nhập)
 *  + thẻ NameServer + hướng dẫn 5 bước + quyền lợi. Đã có website con -> thẻ thông tin
 *  tên miền + lối vào website con / quản trị TRÊN CHÍNH TÊN MIỀN ĐÓ. */
export default async function ChildSiteRegisterPage({ searchParams }: { searchParams: { msg?: string; err?: string; step?: string } }) {
  const user = (await getCurrentUser())!;
  const settings = await getSettings();
  const panel = await prisma.childPanel.findUnique({ where: { ownerId: user.id } });
  const [smmAgg, preAgg, memberCount] = panel
    ? await Promise.all([
        prisma.smmOrder.aggregate({ where: { panelId: panel.id }, _count: true, _sum: { charge: true, commission: true } }),
        prisma.premiumOrder.aggregate({ where: { panelId: panel.id }, _count: true, _sum: { total: true, commission: true } }),
        prisma.user.count({ where: { panelId: panel.id } }),
      ])
    : [null, null, 0];
  const totalOrders = (smmAgg?._count || 0) + (preAgg?._count || 0);
  const totalRevenue = (smmAgg?._sum.charge || 0) + (preAgg?._sum.total || 0);
  const totalProfit = (smmAgg?._sum.commission || 0) + (preAgg?._sum.commission || 0);
  const step = searchParams.step === "4" ? 4 : searchParams.step === "5" ? 5 : 0;
  const adminStaff = panel && step > 0 ? await prisma.panelStaff.findFirst({ where: { panelId: panel.id, role: "ADMIN" }, include: { user: { select: { username: true } } } }) : null;
  const ns1 = settings.child_ns1 || "";
  const ns2 = settings.child_ns2 || "";
  // Phí tạo website con theo ngữ cảnh: khách của panel thì theo phí panel đó tự đặt, khách web mẹ theo phí Cấu hình của mẹ
  const parentPanel = user.panelId ? await prisma.childPanel.findUnique({ where: { id: user.panelId }, select: { panelFee: true } }) : null;
  const creationFee = parentPanel ? Math.max(0, parentPanel.panelFee || 0) : Math.max(0, parseInt(settings.panel_fee || "0") || 0);
  const stats = [
    { label: "Tổng website con", value: panel ? "1" : "0", icon: I.panels },
    { label: "Tổng đơn hàng", value: String(totalOrders), icon: I.list },
    { label: "Tổng doanh thu", value: vnd(totalRevenue), icon: I.chart },
    { label: "Tổng lợi nhuận", value: vnd(totalProfit), icon: I.money },
  ];
  return (
    <div>
      <PageHead title="Đăng ký website con" />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card flex items-center gap-3.5 p-5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">{s.icon}</span>
            <span className="min-w-0">
              <span className="block truncate text-lg font-extrabold leading-tight text-slate-900">{s.value}</span>
              <span className="block text-xs text-slate-500">{s.label}</span>
            </span>
          </div>
        ))}
      </div>

      {settings.module_panels === "0" ? (
        <div className="card mt-6 p-8 text-center">
          <div className="text-lg font-bold text-slate-900">Tính năng mở website con đang tạm đóng</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">Hệ thống đang tạm ngưng cho đăng ký website con mới. Vui lòng quay lại sau.</p>
        </div>
      ) : panel && step === 4 ? (
        <PostCreateSteps step={4} panel={panel} ns1={ns1} ns2={ns2} adminUsername={adminStaff?.user.username || ""} />
      ) : panel && step === 5 ? (
        <PostCreateSteps step={5} panel={panel} ns1={ns1} ns2={ns2} adminUsername={adminStaff?.user.username || ""} />
      ) : panel ? (
        <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
          <div className="card p-6 lg:col-span-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-lg font-extrabold text-slate-900">{panel.domain || panel.name}</div>
              <Badge cls={panel.status === "ACTIVE" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}>{panel.status === "ACTIVE" ? "Đang hoạt động" : panel.status}</Badge>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Tên miền website con</span>{panel.domain ? <a href={`https://${panel.domain}`} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 hover:underline">{panel.domain}</a> : <span className="font-medium text-slate-800">Chưa gắn</span>}</div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Khách hàng của website con</span><span className="font-medium text-slate-800">{memberCount}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Ngày đăng ký</span><span className="font-medium text-slate-800">{panel.createdAt.toLocaleDateString("vi-VN")}</span></div>
            </div>
            {panel.domain ? (
              <div className="mt-6 flex flex-wrap gap-2.5">
                <a href={`https://${panel.domain}`} target="_blank" rel="noreferrer" className="btn-primary btn-sm">Mở website con</a>
                <a href={`https://${panel.domain}/admin`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">Quản trị website con</a>
              </div>
            ) : null}
            <p className="mt-4 text-xs leading-relaxed text-slate-400">Mọi tuỳ chỉnh — logo, màu sắc, giá bán, API Token — thực hiện ngay trên website con của bạn. Mỗi tài khoản được phép tạo tối đa 1 website.</p>
          </div>
          <div className="lg:col-span-2">
            <NsCard ns1={ns1} ns2={ns2} />
          </div>
        </div>
      ) : (
        <div className="mt-6">
          <PanelWizard fee={creationFee} balance={user.balance} action={createPanelWizardAction} defaults={{ fullName: user.fullName || "", email: user.email || "", phone: user.phone || "" }} />
        </div>
      )}
    </div>
  );
}

function NsCard({ ns1, ns2, className = "" }: { ns1: string; ns2: string; className?: string }) {
  const configured = Boolean(ns1 || ns2);
  const rows: Array<[string, string]> = [["NS1", ns1], ["NS2", ns2]];
  return (
    <div className={`card p-6 ${className}`}>
      <div className="font-bold text-slate-900">Thông tin NameServer</div>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-500">Trỏ tên miền của bạn về 2 NameServer dưới đây. Nhấn để sao chép.</p>
      <div className="mt-4 space-y-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
            <span className="w-9 shrink-0 text-xs font-extrabold tracking-wide text-slate-400">{k}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{v || "—"}</span>
            {v && <CopyBtn text={v} />}
          </div>
        ))}
      </div>
      {!configured && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-700">NameServer đang được hệ thống cập nhật. Nếu bạn cần trỏ tên miền ngay, hãy liên hệ hỗ trợ để được cấp thông tin.</p>
      )}
      <div className="mt-4 border-t border-slate-100 pt-4">
        <div className="text-sm font-bold text-slate-800">Cách trỏ NameServer</div>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed text-slate-500">
          <li>Đăng nhập trang quản lý tên miền nơi bạn đã mua tên miền (vd: inet.vn, tenten.vn).</li>
          <li>Mở tên miền vừa đăng ký tại đây, vào mục <b className="text-slate-700">NameServer</b> (có nơi gọi là Máy chủ tên miền / DNS).</li>
          <li>Xoá các nameserver mặc định và thay bằng đúng <b className="text-slate-700">NS1</b> và <b className="text-slate-700">NS2</b> ở trên, rồi bấm lưu.</li>
          <li>Chờ hệ thống cập nhật (thường 15 phút – 24 giờ), sau đó truy cập website con bằng chính tên miền của bạn.</li>
        </ol>
      </div>
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
function PostCreateSteps({ step, panel, ns1, ns2, adminUsername }: { step: number; panel: { domain: string | null; name: string }; ns1: string; ns2: string; adminUsername: string }) {
  const domain = panel.domain || panel.name;
  return (
    <div className="card mt-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Tạo Child Panel</h2>
          <p className="mt-1 text-sm text-slate-500">Khởi tạo SMM Panel riêng trên domain của bạn</p>
        </div>
        <span className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Multi-tenant</span>
      </div>
      <div className="mt-6"><WizardStepsBar step={step} /></div>
      {step === 4 ? (
        <div className="mt-7">
          <h3 className="font-bold text-slate-900">Trỏ NameServer cho tên miền {domain}</h3>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-500">Website con đã được tạo. Vào trang quản lý tên miền nơi bạn đã mua, đổi NameServer của <b className="text-slate-700">{domain}</b> thành 2 giá trị dưới đây — website con sẽ hoạt động trên tên miền của bạn ngay khi tên miền cập nhật xong (thường 15 phút – 24 giờ).</p>
          <div className="mt-5 max-w-xl space-y-2.5">
            {[["NS1", ns1], ["NS2", ns2]].map(([k, v]) => (
              <div key={k} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
                <span className="w-9 shrink-0 text-xs font-extrabold tracking-wide text-slate-400">{k}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{v || "—"}</span>
                {v ? <CopyBtn text={v} /> : null}
              </div>
            ))}
          </div>
          {!ns1 && !ns2 && <p className="mt-3 max-w-xl rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-700">NameServer đang được hệ thống cập nhật. Nếu bạn cần trỏ tên miền ngay, hãy liên hệ hỗ trợ để được cấp thông tin.</p>}
          <div className="mt-7 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <Link href="/dashboard/panel-cua-toi?step=5" className="btn-primary btn-sm !px-5 !py-2.5">Tiếp tục ›</Link>
            <Link href="/dashboard/panel-cua-toi" className="btn-ghost btn-sm !px-4 !py-2.5">Để sau</Link>
          </div>
        </div>
      ) : (
        <div className="mt-7">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">{I.check}</span>
            <div>
              <h3 className="text-lg font-extrabold text-slate-900">Tạo Child Panel thành công!</h3>
              <p className="mt-0.5 text-sm text-slate-500">Website con của bạn đã sẵn sàng trên tên miền <b className="text-slate-700">{domain}</b>.</p>
            </div>
          </div>
          <div className="mt-6 max-w-xl space-y-3 text-sm">
            <div className="flex justify-between gap-4"><span className="text-slate-500">Tên miền website con</span><span className="font-bold text-slate-900">{domain}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Tài khoản quản trị viên</span><span className="font-bold text-slate-900">{adminUsername || "—"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Đăng nhập quản trị bằng</span><span className="text-right font-medium text-slate-800">Tài khoản admin vừa tạo, hoặc chính tài khoản này (chủ panel)</span></div>
          </div>
          <div className="mt-7 flex flex-wrap gap-2.5 border-t border-slate-100 pt-5">
            <a href={`https://${domain}`} target="_blank" rel="noreferrer" className="btn-primary btn-sm !py-2.5">Mở website con</a>
            <a href={`https://${domain}/admin`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm !py-2.5">Quản trị website con</a>
            <Link href="/panel-admin" className="btn-ghost btn-sm !py-2.5">Vào Panel Admin</Link>
            <Link href="/dashboard/panel-cua-toi" className="btn-ghost btn-sm !py-2.5">Về website con của tôi</Link>
          </div>
        </div>
      )}
    </div>
  );
}
