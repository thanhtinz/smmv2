"use client";
import { useState } from "react";
import { Badge } from "@/components/ui";
import { DEP_STATUS, DEP_METHOD } from "@/lib/format";
import { useLang } from "@/components/lang";

export type DepositRowDTO = {
  id: number; code: string; username: string; email: string; method: string;
  amount: number; bonus: number; content: string | null; auto: boolean;
  status: string; timeLabel: string; relLabel: string;
};

type ActionFn = (fd: FormData) => void | Promise<void>;

/** Nút "Xoá tất cả" ở header trang nạp tiền — có hỏi xác nhận trước khi gửi. */
export function DeleteAllDeposits({ action }: { action: ActionFn }) {
  const { t } = useLang();
  return (
    <form action={action} onSubmit={(e) => { if (!window.confirm(t("Xoá TẤT CẢ giao dịch nạp? Hành động này không hoàn tác được."))) e.preventDefault(); }}>
      <input type="hidden" name="all" value="1" />
      <button className="btn-ghost !border-rose-300 !text-rose-600 hover:!bg-rose-50">{t("Xoá tất cả")}</button>
    </form>
  );
}

/** Bảng giao dịch nạp kiểu trumapi: checkbox chọn nhiều + thanh xoá mục đã chọn,
 *  thành viên (tên đậm + email xám), mã GD dạng pill, số tiền đậm + phương thức ở dưới,
 *  badge trạng thái, thời gian + tương đối, thao tác duyệt/từ chối khi đang chờ. */
export function DepositTable({ rows, depositAction, deleteAction, sort, dir, basePath }: {
  rows: DepositRowDTO[];
  depositAction: ActionFn;
  deleteAction: ActionFn;
  sort: string; dir: string; basePath: string;
}) {
  const { t, td, m } = useLang();
  const [sel, setSel] = useState<number[]>([]);
  const allOn = rows.length > 0 && sel.length === rows.length;
  const toggle = (id: number) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const sortLink = (key: string) => {
    const nextDir = sort === key && dir === "desc" ? "asc" : "desc";
    const qs = new URLSearchParams(window.location.search);
    qs.set("sort", key); qs.set("dir", nextDir); qs.delete("page");
    return `${basePath}?${qs.toString()}`;
  };
  const caret = (key: string) => (sort === key ? (dir === "desc" ? " ↓" : " ↑") : " ↕");
  return (
    <div>
      {sel.length > 0 && (
        <form action={deleteAction} onSubmit={(e) => { if (!window.confirm(td(`Xoá ${sel.length} giao dịch đã chọn?`))) e.preventDefault(); }} className="flex items-center gap-3 border-b border-rose-100 bg-rose-50 px-4 py-2.5">
          {sel.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
          <span className="text-sm font-medium text-rose-700">{td(`Đã chọn ${sel.length} giao dịch`)}</span>
          <button className="btn-ghost btn-sm !border-rose-300 !text-rose-600 hover:!bg-white">{td(`Xoá ${sel.length} mục đã chọn`)}</button>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-700" onClick={() => setSel([])}>{t("Bỏ chọn")}</button>
        </form>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-slate-200 bg-slate-50"><tr>
            <th className="th w-10"><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? [] : rows.map((r) => r.id))} className="h-4 w-4 accent-brand-600" /></th>
            <th className="th">{t("Thành viên")}</th>
            <th className="th">{t("Mã GD")}</th>
            <th className="th"><a href={sortLink("amount")} className="hover:text-brand-600">{t("Số tiền")}{caret("amount")}</a></th>
            <th className="th">{t("Trạng thái")}</th>
            <th className="th"><a href={sortLink("time")} className="hover:text-brand-600">{t("Thời gian")}{caret("time")}</a></th>
            <th className="th !text-right">{t("Thao tác")}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50/60">
                <td className="td"><input type="checkbox" checked={sel.includes(d.id)} onChange={() => toggle(d.id)} className="h-4 w-4 accent-brand-600" /></td>
                <td className="td">
                  <div className="font-semibold text-slate-800">{d.username}</div>
                  <div className="text-xs text-slate-400">{d.email}</div>
                  {d.content && <div className="text-xs text-slate-400">{t("Nội dung:")} {d.content}</div>}
                </td>
                <td className="td">
                  <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-600">{d.code}</span>
                  {d.auto && <div className="mt-1 text-[11px] text-emerald-600">{t("tự động (webhook)")}</div>}
                </td>
                <td className="td">
                  <div className="font-bold text-brand-600">{m(d.amount)}</div>
                  <div className="text-xs text-slate-400">{t(DEP_METHOD[d.method] || d.method)}{d.bonus > 0 ? td(` · +${m(d.bonus)} thưởng`) : ""}</div>
                </td>
                <td className="td"><Badge cls={DEP_STATUS[d.status]?.cls || ""}>{DEP_STATUS[d.status]?.label ? t(DEP_STATUS[d.status].label) : d.status}</Badge></td>
                <td className="td whitespace-nowrap">
                  <div className="text-slate-600">{d.timeLabel}</div>
                  <div className="text-xs text-slate-400">{d.relLabel}</div>
                </td>
                <td className="td">
                  {d.status === "PENDING" ? (
                    <span className="flex justify-end gap-1.5">
                      <form action={depositAction}><input type="hidden" name="id" value={d.id} /><button className="btn-primary btn-sm !px-3 !py-1.5" name="kind" value="approve">{t("Duyệt + cộng tiền")}</button></form>
                      <form action={depositAction}><input type="hidden" name="id" value={d.id} /><button className="btn-ghost btn-sm !px-3 !py-1.5 !text-rose-600" name="kind" value="reject">{t("Từ chối")}</button></form>
                    </span>
                  ) : <span className="block text-right text-sm text-slate-400">{t("Đã xử lý")}</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="td py-10 text-center text-slate-400">{t("Chưa có giao dịch nạp nào khớp bộ lọc")}</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
