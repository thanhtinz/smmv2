"use client";
import { useMemo, useState } from "react";
import { useLang } from "@/components/lang";

export type SiteRow = {
  id: number;
  domain: string;
  name: string;
  status: string;
  createdAt: string;
  expiresAt: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: "Đang hoạt động", cls: "bg-emerald-100 text-emerald-700" },
  SUSPENDED: { label: "Tạm ngưng", cls: "bg-slate-200 text-slate-600" },
  EXPIRED: { label: "Hết hạn", cls: "bg-rose-100 text-rose-600" },
};

function dstr(iso: string) {
  return new Date(iso).toLocaleDateString("vi-VN");
}

/** Bảng danh sách website con của khách (dưới wizard tạo mới): tìm kiếm theo
 *  tên miền, phân trang, nút Quản trị (chọn panel rồi vào Panel Admin) và
 *  Gia hạn ngay cho panel tính phí theo tháng. Cột như bản mẫu: Domain ·
 *  Nameservers · Trạng thái · SSL · Ngày. */
export function PanelSitesTable({ panels, ns1, ns2, fee, renewAction }: {
  panels: SiteRow[];
  ns1: string;
  ns2: string;
  fee: number;
  renewAction: (formData: FormData) => Promise<void>;
}) {
  const { t, td, m } = useLang();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? panels.filter((p) => (p.domain + " " + p.name).toLowerCase().includes(needle)) : panels;
  }, [panels, q]);
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const cur = Math.min(page, pages);
  const rows = filtered.slice((cur - 1) * perPage, cur * perPage);

  return (
    <div className="mt-8">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-base font-extrabold text-slate-900">{t("Website con của tôi")}</h2>
        <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">{panels.length}{t(" website")}</span>
      </div>
      <div className="mb-3 flex gap-2">
        <input
          className="inp max-w-md flex-1"
          placeholder={t("Tìm kiếm domain, tên...")}
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
        />
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3.5 font-bold">Domain</th>
              <th className="px-5 py-3.5 font-bold">Nameservers</th>
              <th className="px-5 py-3.5 font-bold">{t("Trạng thái")}</th>
              <th className="px-5 py-3.5 font-bold">SSL</th>
              <th className="px-5 py-3.5 font-bold">{t("Ngày")}</th>
              <th className="px-5 py-3.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => {
              const st = STATUS_META[p.status] || STATUS_META.SUSPENDED;
              return (
                <tr key={p.id} className="align-top transition hover:bg-slate-50/60">
                  <td className="px-5 py-4">
                    {p.domain ? (
                      <a href={`https://${p.domain}`} target="_blank" rel="noreferrer" className="font-bold text-brand-700 hover:underline">{p.domain}</a>
                    ) : (
                      <span className="font-bold text-slate-800">{p.name}</span>
                    )}
                    {p.expiresAt && <div className="mt-0.5 text-xs text-slate-400">{t("Hết hạn:")} {dstr(p.expiresAt)}</div>}
                  </td>
                  <td className="px-5 py-4 text-[13px] leading-relaxed text-slate-600">
                    {ns1 || ns2 ? (<>{ns1 && <div>{ns1}</div>}{ns2 && <div>{ns2}</div>}</>) : "—"}
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${st.cls}`}>{t(st.label)}</span>
                  </td>
                  <td className="px-5 py-4 text-[13px] font-medium text-slate-600">{p.status === "ACTIVE" ? t("Đã bật") : "—"}</td>
                  <td className="px-5 py-4 text-[13px] text-slate-600">{dstr(p.createdAt)}</td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      {fee > 0 && p.expiresAt && (
                        <form action={renewAction}>
                          <input type="hidden" name="panelId" value={p.id} />
                          <button type="submit" className="btn-ghost btn-sm whitespace-nowrap" title={t("Gia hạn 30 ngày — ") + m(fee)}>{t("Gia hạn")}</button>
                        </form>
                      )}
                      <a href={`/api/panels/select?id=${p.id}`} className="btn-primary btn-sm whitespace-nowrap">{t("Quản trị")}</a>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <div className="font-bold text-slate-700">{panels.length === 0 ? t("Chưa có website con nào") : t("Không tìm thấy website con phù hợp")}</div>
                  <p className="mt-1 text-sm text-slate-400">{panels.length === 0 ? t("Tạo website đầu tiên bằng wizard phía trên.") : t("Thử từ khoá khác hoặc xoá bộ lọc tìm kiếm.")}</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" disabled={cur <= 1} onClick={() => setPage(cur - 1)} className="btn-ghost btn-sm !px-3 disabled:opacity-40">‹</button>
          <button type="button" disabled={cur >= pages} onClick={() => setPage(cur + 1)} className="btn-ghost btn-sm !px-3 disabled:opacity-40">›</button>
          <span className="ml-1 text-sm font-medium text-slate-600">{t("Trang")} {cur}/{pages}</span>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-500">
          {t("Số hàng/trang")}
          <select className="inp !w-auto !py-1.5" value={perPage} onChange={(e) => { setPerPage(parseInt(e.target.value)); setPage(1); }}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
          </select>
        </label>
      </div>
    </div>
  );
}
