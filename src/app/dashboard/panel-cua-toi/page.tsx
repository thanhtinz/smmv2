import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge, I } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { registerChildSiteAction } from "@/app/actions/user";
import { vnd } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Trang Đăng ký website con (web mẹ) — đúng mô hình thatim /child-panel:
 *  thống kê 4 ô + form tạo CHỈ 1 ô tên miền (không /cua-hang, không slug/tên cho khách nhập)
 *  + thẻ NameServer + hướng dẫn 5 bước + quyền lợi. Đã có website con -> thẻ thông tin
 *  tên miền + lối vào website con / quản trị TRÊN CHÍNH TÊN MIỀN ĐÓ. */
export default async function ChildSiteRegisterPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
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
  const steps = [
    { t: "Chuẩn bị tên miền", d: "Bạn cần có sẵn một tên miền riêng, mua tại inet.vn, tenten.vn hoặc nhà đăng ký khác." },
    { t: "Nhập tên miền", d: "Điền tên miền vào form đăng ký bên dưới và bấm Đăng ký ngay — hệ thống tự cấu hình." },
    { t: "Trỏ NameServer", d: "Trỏ tên miền của bạn về 2 NameServer trong thẻ Thông tin NameServer. Nhà đăng ký tên miền có thể hỗ trợ bước này." },
    { t: "Đăng nhập website con", d: "Truy cập website con bằng chính tên miền vừa đăng ký và đăng nhập bằng tài khoản này — hệ thống đã tự liên kết API với tài khoản của bạn." },
    { t: "Tuỳ chỉnh website", d: "Vào quản trị ngay trên website con để nhập API Token nếu cần, đổi logo, màu sắc và giá bán theo ý bạn." },
  ];
  const perks = [
    { t: "Tuỳ chỉnh lợi nhuận", d: "Tự set giá bán và phần lợi nhuận của riêng bạn" },
    { t: "Triển khai tức thì", d: "Cấu hình đơn giản, dễ sử dụng" },
    { t: "Quản lý khách hàng", d: "Quản lý và chăm sóc tệp khách hàng của riêng bạn" },
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
        <>
          <div className="mt-6 grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
            <form action={registerChildSiteAction} className="card p-6 lg:col-span-3">
              <div className="text-base font-extrabold uppercase tracking-wide text-slate-900">Đăng ký website con</div>
              <p className="mt-1 text-sm text-slate-500">Mỗi tài khoản được phép tạo tối đa 1 website</p>
              <div className="mt-5">
                <label className="lbl">Tên miền của bạn</label>
                <input className="inp !h-[52px] !rounded-[14px] !text-[15px]" name="domain" required placeholder="vd: myshop.vn" autoComplete="off" />
                <p className="mt-1.5 text-xs text-slate-400">Chỉ chứa chữ thường, số, dấu chấm và gạch ngang.</p>
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-500">Chi phí đăng ký:</span>
                <span className="text-base font-extrabold text-slate-900">{creationFee > 0 ? vnd(creationFee) : "0₫"}</span>
              </div>
              {creationFee > 0 && (
                <p className="mt-1.5 text-right text-xs text-slate-400">Trừ vào số dư khi đăng ký thành công · Số dư hiện tại: {vnd(user.balance)}</p>
              )}
              <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
                Sau khi đăng ký, hãy trỏ NameServer của tên miền về thông tin ở thẻ bên cạnh — website con sẽ tự hoạt động trên tên miền của bạn ngay khi tên miền cập nhật xong.
              </div>
              <button type="submit" className="btn-primary mt-5 w-full !py-3">Đăng ký ngay</button>
            </form>
            <div className="space-y-6 lg:col-span-2">
              <NsCard ns1={ns1} ns2={ns2} />
              <div className="card p-6">
                <div className="mb-3 font-bold text-slate-900">Quyền lợi khi sở hữu website con</div>
                <ul className="space-y-3.5">
                  {perks.map((p) => (
                    <li key={p.t} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-md bg-emerald-500"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
                      <span><span className="block text-sm font-semibold text-slate-800">{p.t}</span><span className="block text-[13px] leading-relaxed text-slate-500">{p.d}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <div className="card mt-6 p-6">
            <div className="mb-4 font-bold text-slate-900">Hướng dẫn tạo website con</div>
            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {steps.map((s, i) => (
                <li key={s.t} className="rounded-2xl bg-slate-50 p-4">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-[13px] font-extrabold text-white">{i + 1}</span>
                  <div className="mt-2.5 text-sm font-bold text-slate-800">{s.t}</div>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{s.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </>
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
