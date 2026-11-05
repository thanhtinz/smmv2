"use client";
import { useState } from "react";
import { Modal } from "@/components/admin-catalog";
import { setPanelServicePricesAction } from "@/app/actions/user";
import { vnd, num } from "@/lib/format";

export const LEVELS = [
  { key: "MEMBER", label: "Thành viên" },
  { key: "RESELLER", label: "Đại lý" },
  { key: "AGENCY", label: "Tổng đại lý" },
  { key: "VIP", label: "VIP" },
] as const;

export type PanelServiceDTO = {
  id: number; name: string; categoryName: string; min: number; max: number;
  motherRate: number; panelRate: number;
  suggested: Record<string, number>;
  overrides: Record<string, number>;
};

const lbl = "lbl";
const locked = "inp !bg-slate-50 !text-slate-500";

/** Modal chỉnh giá của chủ panel: mọi thông tin dịch vụ đều KHOÁ (đồng bộ từ web mẹ),
 *  chỉ 4 ô giá riêng theo cấp bậc là sửa được. Để trống một ô = bậc đó theo giá chung. */
export function PanelServicePriceModal({ service, onClose }: { service: PanelServiceDTO; onClose: () => void }) {
  const s = service;
  return (
    <Modal title="Chỉnh giá dịch vụ" onClose={onClose} wide>
      <form action={setPanelServicePricesAction}>
        <input type="hidden" name="serviceId" value={s.id} />
        <div className="max-h-[66vh] space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className={lbl}>Tên dịch vụ</label>
            <input value={s.name} disabled className={locked} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Danh mục</label><input value={s.categoryName} disabled className={locked} /></div>
            <div><label className={lbl}>Số lượng tối thiểu – tối đa</label><input value={`${num(s.min)} – ${num(s.max)}`} disabled className={locked} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Giá web mẹ (mỗi 1.000)</label><input value={vnd(s.motherRate)} disabled className={locked} /></div>
            <div><label className={lbl}>Giá panel chuẩn sau phụ phí (mỗi 1.000)</label><input value={vnd(s.panelRate)} disabled className={locked} /></div>
          </div>
          <div className="border-t border-slate-100 pt-4">
            <div className="mb-1 text-sm font-bold text-slate-800">Giá riêng theo cấp bậc (giá cuối mỗi 1.000)</div>
            <p className="mb-3 text-xs text-slate-400">Để trống = dùng giá panel chuẩn đã trừ % giảm của bậc đó (số mờ trong ô).</p>
            <div className="grid grid-cols-2 gap-4">
              {LEVELS.map((lv) => (
                <div key={lv.key}>
                  <label className={lbl}>{lv.label}</label>
                  <input name={`price_${lv.key}`} type="number" min={0} step={100} defaultValue={s.overrides[lv.key] ?? ""} placeholder={num(s.suggested[lv.key])} className="inp" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">Hủy</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">Lưu giá</button>
        </div>
      </form>
    </Modal>
  );
}

export function PanelServicesClient({ services }: { services: PanelServiceDTO[] }) {
  const [editing, setEditing] = useState<PanelServiceDTO | null>(null);
  return (
    <>
      {editing && <PanelServicePriceModal service={editing} onClose={() => setEditing(null)} />}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[860px]">
          <thead><tr className="border-b border-slate-100"><th className="th">Dịch vụ</th><th className="th">Danh mục</th><th className="th">Giá web mẹ</th><th className="th">Giá panel chuẩn</th><th className="th">Giá riêng theo bậc</th><th className="th text-right">Thao tác</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {services.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/60">
                <td className="td"><div className="font-bold text-slate-800">{s.name}</div><div className="text-xs text-slate-400">#{s.id} · {num(s.min)} – {num(s.max)}</div></td>
                <td className="td text-slate-600">{s.categoryName}</td>
                <td className="td text-slate-500">{vnd(s.motherRate)}</td>
                <td className="td font-bold text-slate-800">{vnd(s.panelRate)}</td>
                <td className="td">
                  {Object.keys(s.overrides).length ? (
                    <span className="flex flex-wrap gap-1.5">{LEVELS.filter((lv) => s.overrides[lv.key]).map((lv) => (
                      <span key={lv.key} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{lv.label}: {vnd(s.overrides[lv.key])}</span>
                    ))}</span>
                  ) : <span className="text-xs text-slate-400">— theo giá chung</span>}
                </td>
                <td className="td text-right">
                  <button onClick={() => setEditing(s)} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700">Chỉnh giá</button>
                </td>
              </tr>
            ))}
            {services.length === 0 && <tr><td colSpan={6} className="td py-10 text-center text-slate-400">Không tìm thấy dịch vụ nào.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
