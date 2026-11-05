"use client";
import { useState, useRef, useEffect } from "react";
import { adminSaveProvider, adminDeleteProvider, adminProviderAction, adminProviderMarkup, adminSyncAllProviders, adminSaveService, adminDeleteService, adminToggleService, adminSaveCategory, adminDeleteCategory, adminToggleCategory, adminTogglePlatform, adminReorderCategories } from "@/app/actions/admin";
import { vnd, num, PLATFORMS } from "@/lib/format";

/* ---------- Khung modal dùng chung cho khu vực danh mục (NCC / Dịch vụ / Danh mục) ---------- */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className={`my-8 w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl bg-white shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="text-base font-extrabold text-slate-900">{title}</div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Đóng">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Switch({ name, defaultChecked, label }: { name: string; defaultChecked?: boolean; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 py-1">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span className="relative inline-flex">
        <input type="checkbox" name={name} defaultChecked={defaultChecked} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-blue-600" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

const inp = "inp";
const lbl = "lbl";

/* ================= NHÀ CUNG CẤP ================= */
export type ProviderDTO = {
  id: number; kind: string; name: string; apiUrl: string; currency: string; exchangeRate: number;
  markupPercent: number; balanceCache: number; active: boolean; note: string | null;
  syncServices: boolean; syncCategories: boolean; autoUpdatePrice: boolean;
  minBalanceAlert: number; dailyLimit: number; serviceCount: number; lastSyncAt: string | null;
};

export function ProviderModal({ provider, onClose }: { provider?: ProviderDTO; onClose: () => void }) {
  const [tab, setTab] = useState(0);
  const p = provider;
  const tabs = ["Thông tin cơ bản", "Cài đặt đồng bộ", "Tiền tệ & Giới hạn"];
  return (
    <Modal title={p ? "Chỉnh sửa nhà cung cấp" : "Thêm nhà cung cấp mới"} onClose={onClose} wide>
      <form action={adminSaveProvider}>
        {p && <input type="hidden" name="id" value={p.id} />}
        <div className="flex gap-1 border-b border-slate-100 px-6 pt-3">
          {tabs.map((t, i) => (
            <button key={t} type="button" onClick={() => setTab(i)} className={`rounded-t-lg px-3.5 py-2 text-sm font-semibold transition ${tab === i ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-800"}`}>{t}</button>
          ))}
        </div>
        <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
          <div className={tab === 0 ? "space-y-4" : "hidden"}>
            <div><label className={lbl}>Tên nhà cung cấp *</label><input name="name" required defaultValue={p?.name || ""} className={inp} placeholder="Nhập tên nhà cung cấp" /></div>
            <div><label className={lbl}>URL API *</label><input name="apiUrl" required defaultValue={p?.apiUrl || ""} className={inp} placeholder="https://api.example.com" /></div>
            <div>
              <label className={lbl}>API Key {p ? "" : "*"}</label>
              <input name="apiKey" type="password" defaultValue={p ? "••••••••••••••••" : ""} className={inp} placeholder="Nhập API key" autoComplete="new-password" />
              <p className="mt-1 text-xs text-slate-400">{p ? "Để nguyên dấu • nếu không đổi key." : "API Key được mã hoá an toàn."}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Loại API *</label>
                <select name="kind" defaultValue={p?.kind || "BOTH"} className={inp}>
                  <option value="BOTH">Standard API (SMM + Premium)</option>
                  <option value="SMM">Chỉ SMM v2</option>
                  <option value="PREMIUM">Chỉ API sản phẩm (Premium)</option>
                </select>
              </div>
              <div>
                <label className={lbl}>Kiểu kiểm tra API</label>
                <select className={inp} defaultValue="balance"><option value="balance">Balance (số dư)</option><option value="services">Services (danh sách)</option></select>
              </div>
            </div>
            <Switch name="active" defaultChecked={p ? p.active : true} label="Trạng thái (đang hoạt động)" />
            <div><label className={lbl}>Mô tả</label><textarea name="note" rows={2} defaultValue={p?.note || ""} className={inp} placeholder="Nhập mô tả về nhà cung cấp..." /></div>
          </div>
          <div className={tab === 1 ? "space-y-4" : "hidden"}>
            <div>
              <label className={lbl}>Tỷ lệ giá (%)</label>
              <input name="markupPercent" type="number" min={0} max={500} defaultValue={p?.markupPercent ?? 30} className={inp} />
              <p className="mt-1 text-xs text-slate-400">Tỷ lệ tăng giá khi đồng bộ dịch vụ từ nhà cung cấp.</p>
            </div>
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-4 py-2">
              <Switch name="syncServices" defaultChecked={p ? p.syncServices : true} label="Đồng bộ dịch vụ" />
              <Switch name="syncCategories" defaultChecked={p ? p.syncCategories : true} label="Đồng bộ danh mục" />
              <Switch name="autoUpdatePrice" defaultChecked={p ? p.autoUpdatePrice : true} label="Tự động cập nhật giá" />
            </div>
          </div>
          <div className={tab === 2 ? "space-y-4" : "hidden"}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Đơn vị tiền tệ</label>
                <select name="currency" defaultValue={p?.currency || "VND"} className={inp}><option value="VND">VND</option><option value="USD">USD</option></select>
              </div>
              <div><label className={lbl}>Tỷ giá hối đoái</label><input name="exchangeRate" type="number" min={1} defaultValue={p?.exchangeRate ?? 1} className={inp} /></div>
              <div><label className={lbl}>Ngưỡng số dư tối thiểu (VNĐ)</label><input name="minBalanceAlert" type="number" min={0} defaultValue={p?.minBalanceAlert ?? 0} className={inp} /></div>
              <div><label className={lbl}>Giới hạn đặt hàng tối đa mỗi ngày</label><input name="dailyLimit" type="number" min={0} defaultValue={p?.dailyLimit ?? 0} className={inp} /></div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">Hủy</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{p ? "Cập nhật nhà cung cấp" : "Lưu nhà cung cấp"}</button>
        </div>
      </form>
    </Modal>
  );
}

type ImportSvc = { id: string; name: string; category: string; costVnd: number; min: number; max: number; imported: boolean };

/** Import dịch vụ CHỌN LỌC: xem toàn bộ dịch vụ phía nhà cung cấp, tick chọn từng
 *  dịch vụ muốn nhập, đặt % markup riêng cho đợt nhập rồi mới tạo — khác nút Đồng bộ
 *  (đồng bộ là nhập tất cả + cập nhật giá các dịch vụ đã có). */
export function ImportServicesModal({ provider, onClose }: { provider: ProviderDTO; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [services, setServices] = useState<ImportSvc[]>([]);
  const [q, setQ] = useState("");
  const [markup, setMarkup] = useState(provider.markupPercent);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/admin/provider-services?providerId=${provider.id}`);
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Không lấy được danh sách");
        setServices(j.services);
        setSelected(new Set(j.services.filter((s: ImportSvc) => !s.imported).map((s: ImportSvc) => s.id)));
      } catch (e: any) {
        setError(String(e?.message || "Lỗi tải danh sách"));
      } finally {
        setLoading(false);
      }
    })();
  }, [provider.id]);

  const visible = services.filter((s) => !q.trim() || s.name.toLowerCase().includes(q.trim().toLowerCase()) || s.category.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleVisible = () => {
    const ids = visible.filter((s) => !s.imported).map((s) => s.id);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => { const n = new Set(prev); ids.forEach((id) => (allOn ? n.delete(id) : n.add(id))); return n; });
  };

  async function doImport() {
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/admin/provider-services", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: provider.id, markup, ids: Array.from(selected) }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Import thất bại");
      setResult(`Đã import ${j.created} dịch vụ mới${j.skipped ? `, bỏ qua ${j.skipped} dịch vụ đã có` : ""}.`);
      setServices((prev) => prev.map((s) => (selected.has(s.id) ? { ...s, imported: true } : s)));
      setSelected(new Set());
    } catch (e: any) {
      setError(String(e?.message || "Import thất bại"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={`Import dịch vụ — ${provider.name}`} onClose={onClose} wide>
      <div className="flex flex-col" style={{ maxHeight: "78vh" }}>
        <div className="flex flex-wrap items-center gap-2 px-6 pt-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm dịch vụ / danh mục phía nhà cung cấp…" className="inp min-w-[220px] flex-1" />
          <label className="flex items-center gap-1.5 text-sm text-slate-600">Markup <input type="number" min={0} max={500} value={markup} onChange={(e) => setMarkup(parseInt(e.target.value) || 0)} className="w-20 rounded-lg border border-slate-200 px-2 py-2 text-sm" /> %</label>
          <span className="text-sm text-slate-500">Đã chọn <b className="text-slate-800">{selected.size}</b> / {services.filter((s) => !s.imported).length} dịch vụ mới</span>
        </div>
        {error && <div className="mx-6 mt-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-600">{error}</div>}
        {result && <div className="mx-6 mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700">{result}</div>}
        <div className="mt-3 flex-1 overflow-y-auto px-6 pb-2">
          {loading ? <div className="py-12 text-center text-sm text-slate-400">Đang lấy danh sách dịch vụ từ nhà cung cấp…</div> : (
            <table className="w-full">
              <thead><tr className="border-b border-slate-100 text-left">
                <th className="th w-10"><input type="checkbox" onChange={toggleVisible} checked={visible.some((s) => !s.imported) && visible.filter((s) => !s.imported).every((s) => selected.has(s.id))} className="h-4 w-4 accent-blue-600" /></th>
                <th className="th">Dịch vụ phía nhà cung cấp</th><th className="th">Giá vốn</th><th className="th">Min – Max</th><th className="th">Trạng thái</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((s) => (
                  <tr key={s.id} className={s.imported ? "opacity-55" : "hover:bg-slate-50/60"}>
                    <td className="td"><input type="checkbox" disabled={s.imported} checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="h-4 w-4 accent-blue-600" /></td>
                    <td className="td"><div className="font-semibold text-slate-800">{s.name}</div><div className="text-xs text-slate-400">ID {s.id} · {s.category}</div></td>
                    <td className="td font-semibold text-slate-700">{vnd(s.costVnd)}</td>
                    <td className="td text-slate-500">{num(s.min)} – {num(s.max)}</td>
                    <td className="td">{s.imported ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">Đã có</span> : <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-bold text-sky-600">Mới</span>}</td>
                  </tr>
                ))}
                {visible.length === 0 && <tr><td colSpan={5} className="td py-10 text-center text-slate-400">Không có dịch vụ nào khớp.</td></tr>}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={() => (result ? window.location.reload() : onClose())} className="btn-ghost btn-sm !px-5 !py-2.5">{result ? "Đóng & tải lại" : "Hủy"}</button>
          <button disabled={busy || selected.size === 0} onClick={doImport} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">{busy ? "Đang import…" : `Import ${selected.size} dịch vụ`}</button>
        </div>
      </div>
    </Modal>
  );
}

export function ProvidersClient({ providers }: { providers: ProviderDTO[] }) {
  const [editing, setEditing] = useState<ProviderDTO | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState<ProviderDTO | undefined>(undefined);
  const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800";
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <form action={adminSyncAllProviders}><button className="btn-ghost btn-sm !px-4 !py-2.5">Đồng bộ tất cả</button></form>
        <button onClick={() => { setEditing(undefined); setOpen(true); }} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">+ Thêm nhà cung cấp</button>
      </div>
      {open && <ProviderModal provider={editing} onClose={() => setOpen(false)} />}
      {importing && <ImportServicesModal provider={importing} onClose={() => setImporting(undefined)} />}
      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[880px]">
          <thead><tr className="border-b border-slate-100">
            <th className="th">Nhà cung cấp</th><th className="th">Dịch vụ</th><th className="th">API</th><th className="th">Tỷ lệ</th><th className="th">Tiền tệ</th><th className="th">Số dư</th><th className="th">Trạng thái</th><th className="th text-right">Hành động</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {providers.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className="td"><div className="font-bold text-slate-800">{p.name}</div><div className="max-w-[220px] truncate text-xs text-slate-400">{p.apiUrl}</div></td>
                <td className="td text-slate-600">{num(p.serviceCount)} dịch vụ</td>
                <td className="td"><span className="text-xs font-semibold text-slate-500">{p.kind === "BOTH" ? "Standard API" : p.kind === "SMM" ? "SMM v2" : "API sản phẩm"}</span><div className="text-xs text-slate-400">{p.lastSyncAt ? `Đồng bộ: ${p.lastSyncAt}` : "Chưa đồng bộ"}</div></td>
                <td className="td">
                  <form action={adminProviderMarkup} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={p.id} />
                    <input name="markupPercent" type="number" min={0} max={500} defaultValue={p.markupPercent} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                    <span className="text-sm text-slate-500">%</span>
                    <button className="text-blue-600 hover:text-blue-800" title="Lưu tỷ lệ"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg></button>
                  </form>
                </td>
                <td className="td text-slate-600">{p.currency}</td>
                <td className="td font-semibold text-slate-700">{p.balanceCache ? vnd(p.balanceCache) : "—"}</td>
                <td className="td">{p.active ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">Đang hoạt động</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">Đã tắt</span>}</td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className={iconBtn} title="Sửa" onClick={() => { setEditing(p); setOpen(true); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg></button>
                    {p.kind !== "PREMIUM" && <button className={iconBtn} title="Import dịch vụ (chọn lọc)" onClick={() => setImporting(p)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg></button>}
                    <form action={adminProviderAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="kind" value="sync" /><button className={iconBtn} title="Đồng bộ"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" /></svg></button></form>
                    <form action={adminProviderAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="kind" value="balance" /><button className={iconBtn} title="Kiểm tra số dư"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5v15l13-7.5-13-7.5Z" /></svg></button></form>
                    <form action={adminDeleteProvider} onSubmit={(e) => { if (!confirm(`Xoá nhà cung cấp ${p.name}? Dịch vụ liên kết sẽ chuyển về thủ công.`)) e.preventDefault(); }}><input type="hidden" name="id" value={p.id} /><button className={`${iconBtn} hover:!bg-rose-50 hover:!text-rose-600`} title="Xoá"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" /></svg></button></form>
                  </div>
                </td>
              </tr>
            ))}
            {providers.length === 0 && <tr><td colSpan={8} className="td py-10 text-center text-slate-400">Chưa có nhà cung cấp nào — bấm “+ Thêm nhà cung cấp” để đấu nguồn đầu tiên.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ================= DỊCH VỤ ================= */
export type ServiceDTO2 = {
  id: number; categoryId: number; categoryName: string; platform: string; name: string; description: string | null;
  rate: number; costRate: number; min: number; max: number; avgTime: string | null; type: string; customMarkup: number | null;
  refill: boolean; cancelable: boolean; dripfeed: boolean; autoRefill: boolean; active: boolean;
  providerId: number | null; providerName: string | null; providerMarkup: number | null; providerServiceId: string | null;
  backupProviderId: number | null; backupProviderServiceId: string | null; backupCostRate: number; updatedAt: string;
};
export type CategoryDTO = { id: number; platform: string; name: string; sort: number; active: boolean; serviceCount: number };
export type ProviderOpt = { id: number; name: string; markupPercent: number };

const SERVICE_TYPES = ["Default", "Comments", "Custom Comments", "Reactions", "Watch Time", "Package", "Mentions"];

export function ServiceModal({ service, categories, providers, onClose }: { service?: ServiceDTO2; categories: CategoryDTO[]; providers: ProviderOpt[]; onClose: () => void }) {
  const s = service;
  const [providerId, setProviderId] = useState<string>(s?.providerId ? String(s.providerId) : "");
  const [cost, setCost] = useState<number>(s?.costRate || 0);
  const [rate, setRate] = useState<number>(s?.rate || 0);
  const [markup, setMarkup] = useState<string>(s?.customMarkup != null ? String(s.customMarkup) : "");
  const calcPrice = () => { const m = parseInt(markup || "0"); if (cost > 0) setRate(Math.round(cost * (1 + m / 100))); };
  const platforms = Array.from(new Set(categories.map((c) => c.platform)));
  return (
    <Modal title={s ? "Chỉnh sửa dịch vụ" : "Thêm dịch vụ mới"} onClose={onClose} wide>
      <form action={adminSaveService}>
        {s && <input type="hidden" name="id" value={s.id} />}
        <input type="hidden" name="fulfillment" value={providerId ? "API" : "MANUAL"} />
        <input type="hidden" name="providerId" value={providerId} />
        <input type="hidden" name="sort" value={0} />
        <div className="max-h-[66vh] space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Danh mục *</label>
              <select name="categoryId" required defaultValue={s?.categoryId || ""} className={inp}>
                <option value="" disabled>Chọn danh mục</option>
                {platforms.map((pf) => (
                  <optgroup key={pf} label={(PLATFORMS as any)[pf] || pf}>
                    {categories.filter((c) => c.platform === pf).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Nhà cung cấp</label>
              <select value={providerId} onChange={(e) => setProviderId(e.target.value)} className={inp}>
                <option value="">Thủ công (không đấu API)</option>
                {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          {providerId && (
            <div><label className={lbl}>ID dịch vụ tại nhà cung cấp</label><input name="providerServiceId" defaultValue={s?.providerServiceId || ""} className={inp} placeholder="VD: 1049" /></div>
          )}
          <div><label className={lbl}>Tên dịch vụ *</label><input name="name" required defaultValue={s?.name || ""} className={inp} placeholder="Nhập tên dịch vụ" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Giá bán (VNĐ/1k) *</label>
              <input name="rate" type="number" min={0} value={rate} onChange={(e) => setRate(parseInt(e.target.value || "0"))} className={inp} />
              <p className="mt-1 text-xs text-blue-600">Giá bán tính cho 1000 đơn vị.</p>
            </div>
            <div><label className={lbl}>Giá vốn (VNĐ/1k)</label><input name="costRate" type="number" min={0} value={cost} onChange={(e) => setCost(parseInt(e.target.value || "0"))} className={inp} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Phần trăm riêng (%)</label>
              <div className="flex gap-2">
                <input name="customMarkup" type="number" min={0} max={500} value={markup} onChange={(e) => setMarkup(e.target.value)} className={inp} placeholder="Để trống = theo NCC" />
                <button type="button" onClick={calcPrice} className="btn-ghost btn-sm shrink-0 !px-3">Tính giá</button>
              </div>
            </div>
            <div>
              <label className={lbl}>Loại dịch vụ</label>
              <select name="type" defaultValue={s?.type || "Default"} className={inp}>{SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className={lbl}>Số lượng tối thiểu</label><input name="min" type="number" min={1} defaultValue={s?.min ?? 10} className={inp} /></div>
            <div><label className={lbl}>Số lượng tối đa</label><input name="max" type="number" min={1} defaultValue={s?.max ?? 100000} className={inp} /></div>
          </div>
          <div><label className={lbl}>Thời gian hoàn thành</label><input name="avgTime" defaultValue={s?.avgTime || ""} className={inp} placeholder="VD: 0-12 giờ" /></div>
          <div><label className={lbl}>Ghi chú / Mô tả</label><textarea name="description" rows={3} defaultValue={s?.description || ""} className={inp} placeholder="Nhập mô tả chi tiết về dịch vụ..." /></div>
          <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 px-4 py-2">
            <Switch name="refill" defaultChecked={s?.refill ?? true} label="Hỗ trợ Refill" />
            <Switch name="cancelable" defaultChecked={s?.cancelable ?? true} label="Hỗ trợ hủy" />
            <Switch name="dripfeed" defaultChecked={s?.dripfeed ?? false} label="Hỗ trợ Dripfeed" />
          </div>
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 px-4 py-2">
            <Switch name="autoRefill" defaultChecked={s?.autoRefill ?? false} label="Tự động Refill khi tụt số" />
            <Switch name="active" defaultChecked={s ? s.active : true} label="Đang bật bán" />
          </div>
          {s?.providerId && (
            <details className="rounded-xl border border-slate-200 px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Nhà cung cấp dự phòng (Smart Routing)</summary>
              <div className="mt-3 grid grid-cols-3 gap-3">
                <select name="backupProviderId" defaultValue={s.backupProviderId || ""} className={inp}><option value="">Không đặt</option>{providers.filter((p) => p.id !== s.providerId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <input name="backupProviderServiceId" defaultValue={s.backupProviderServiceId || ""} className={inp} placeholder="ID tại NCC dự phòng" />
                <input name="backupCostRate" type="number" min={0} defaultValue={s.backupCostRate || 0} className={inp} placeholder="Giá vốn dự phòng" />
              </div>
            </details>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">Hủy</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">Lưu dịch vụ</button>
        </div>
      </form>
    </Modal>
  );
}

export function ServiceRowActions({ service, categories, providers }: { service: ServiceDTO2; categories: CategoryDTO[]; providers: ProviderOpt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex items-center justify-end gap-1.5">
      <button onClick={() => setOpen(true)} title="Sửa" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg></button>
      <form action={adminDeleteService} onSubmit={(e) => { if (!confirm(`Xoá dịch vụ "${service.name}"?`)) e.preventDefault(); }}>
        <input type="hidden" name="id" value={service.id} />
        <button title="Xoá" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" /></svg></button>
      </form>
      {open && <ServiceModal service={service} categories={categories} providers={providers} onClose={() => setOpen(false)} />}
    </div>
  );
}

export function AddServiceButton({ categories, providers }: { categories: CategoryDTO[]; providers: ProviderOpt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">+ Thêm dịch vụ</button>
      {open && <ServiceModal categories={categories} providers={providers} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ServiceStatusToggle({ service }: { service: ServiceDTO2 }) {
  return (
    <form action={adminToggleService}>
      <input type="hidden" name="id" value={service.id} />
      <button title="Bấm để bật/tắt" className={`rounded-full px-2.5 py-1 text-xs font-bold ${service.active ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{service.active ? "Đang bật" : "Đã tắt"}</button>
    </form>
  );
}

/* ================= DANH MỤC ================= */
export function CategoryModal({ category, platforms, presetPlatform, onClose }: { category?: CategoryDTO; platforms: string[]; presetPlatform?: string; onClose: () => void }) {
  const c = category;
  const [platform, setPlatform] = useState(c?.platform || presetPlatform || platforms[0] || "facebook");
  const isNewPlatform = platform === "__new";
  return (
    <Modal title={c ? "Chỉnh sửa danh mục" : "Thêm danh mục mới"} onClose={onClose}>
      <form action={adminSaveCategory}>
        {c && <input type="hidden" name="id" value={c.id} />}
        <div className="space-y-4 px-6 py-5">
          <div>
            <label className={lbl}>Danh mục cha (nền tảng)</label>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inp}>
              {platforms.map((pf) => <option key={pf} value={pf}>{(PLATFORMS as any)[pf] || pf}</option>)}
              <option value="__new">+ Nền tảng mới...</option>
            </select>
            {isNewPlatform && <input name="platform" className={`${inp} mt-2`} placeholder="Mã nền tảng mới (vd: discord)" />}
            {!isNewPlatform && <input type="hidden" name="platform" value={platform} />}
          </div>
          <div><label className={lbl}>Tên danh mục *</label><input name="name" required defaultValue={c?.name || ""} className={inp} placeholder="Nhập tên danh mục..." /></div>
          <div><label className={lbl}>Thứ tự hiển thị</label><input name="sort" type="number" defaultValue={c?.sort ?? 0} className={inp} /></div>
          <Switch name="active" defaultChecked={c ? c.active : true} label="Trạng thái" />
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">Hủy</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">OK</button>
        </div>
      </form>
    </Modal>
  );
}

export function CategoriesClient({ categories }: { categories: CategoryDTO[] }) {
  const platforms = Array.from(new Set(categories.map((c) => c.platform)));
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(platforms.map((p) => [p, true])));
  const [modal, setModal] = useState<{ category?: CategoryDTO; preset?: string } | null>(null);
  const dragId = useRef<number | null>(null);
  const [order, setOrder] = useState<CategoryDTO[]>(categories);
  const reorderRef = useRef<HTMLFormElement>(null);
  const [dragOrderIds, setDragOrderIds] = useState("");

  const onDrop = (platform: string, targetId: number) => {
    if (dragId.current == null) return;
    const group = order.filter((c) => c.platform === platform);
    const from = group.findIndex((c) => c.id === dragId.current);
    const to = group.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = group.splice(from, 1);
    group.splice(to, 0, moved);
    const rest = order.filter((c) => c.platform !== platform);
    setOrder([...rest, ...group]);
    setDragOrderIds(JSON.stringify(group.map((c) => c.id)));
    setTimeout(() => reorderRef.current?.requestSubmit(), 50);
    dragId.current = null;
  };

  const avatarColor = (pf: string) => ({ facebook: "bg-blue-600", tiktok: "bg-slate-900", instagram: "bg-pink-600", youtube: "bg-red-600", telegram: "bg-sky-500", shopee: "bg-orange-500", x: "bg-slate-800", spotify: "bg-emerald-600", other: "bg-slate-500" } as Record<string, string>)[pf] || "bg-slate-500";
  const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700";

  return (
    <div className="card p-4 sm:p-5">
      <form ref={reorderRef} action={adminReorderCategories} className="hidden"><input type="hidden" name="ids" value={dragOrderIds} /></form>
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="text-sm text-slate-500">Tổng {order.length} danh mục · kéo thả để sắp xếp</div>
        <button onClick={() => setModal({})} className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">+ Thêm nền tảng</button>
      </div>
      <div className="space-y-3">
        {platforms.map((pf) => {
          const group = order.filter((c) => c.platform === pf);
          const totalServices = group.reduce((a, c) => a + c.serviceCount, 0);
          const allOn = group.every((c) => c.active);
          const isOpen = expanded[pf] !== false;
          return (
            <div key={pf} className="rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-black text-white ${avatarColor(pf)}`}>{((PLATFORMS as any)[pf] || pf).charAt(0)}</span>
                <div className="min-w-0 flex-1">
                  <div className="font-extrabold text-slate-800">{(PLATFORMS as any)[pf] || pf}</div>
                  <div className="text-xs text-slate-400">{group.length} danh mục con · {num(totalServices)} dịch vụ</div>
                </div>
                <form action={adminTogglePlatform}>
                  <input type="hidden" name="platform" value={pf} />
                  <input type="hidden" name="target" value={allOn ? "off" : "on"} />
                  <button title="Bật/tắt cả nền tảng" className={`rounded-full px-3 py-1 text-xs font-bold ${allOn ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>{allOn ? "Bật" : "Tắt"}</button>
                </form>
                <button onClick={() => setExpanded({ ...expanded, [pf]: !isOpen })} className={iconBtn} title={isOpen ? "Thu gọn" : "Mở rộng"}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`transition ${isOpen ? "rotate-90" : ""}`}><path d="m9 6 6 6-6 6" /></svg>
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-slate-100 px-3 py-2">
                  {group.map((c) => (
                    <div key={c.id} draggable onDragStart={() => { dragId.current = c.id; }} onDragOver={(e) => e.preventDefault()} onDrop={() => onDrop(pf, c.id)}
                      className="group flex items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-slate-50">
                      <span className="cursor-grab text-slate-300" title="Kéo để sắp xếp"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg></span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-700">{c.name}</span>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-bold text-blue-600">{num(c.serviceCount)}</span>
                      <form action={adminToggleCategory}>
                        <input type="hidden" name="id" value={c.id} />
                        <button title="Bật/tắt danh mục" className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${c.active ? "bg-blue-600" : "bg-slate-200"}`}>
                          <span className={`absolute h-5 w-5 rounded-full bg-white shadow transition-all ${c.active ? "left-[22px]" : "left-0.5"}`} />
                        </button>
                      </form>
                      <button className={iconBtn} title="Sửa" onClick={() => setModal({ category: c })}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg></button>
                      <form action={adminDeleteCategory} onSubmit={(e) => { if (!confirm(`Xoá danh mục "${c.name}"?`)) e.preventDefault(); }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button className={`${iconBtn} hover:!bg-rose-50 hover:!text-rose-600`} title="Xoá"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" /></svg></button>
                      </form>
                    </div>
                  ))}
                  <button onClick={() => setModal({ preset: pf })} className="mt-1 w-full rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-500 transition hover:border-blue-400 hover:text-blue-600">+ Thêm danh mục con</button>
                </div>
              )}
            </div>
          );
        })}
        {platforms.length === 0 && <div className="py-10 text-center text-slate-400">Chưa có danh mục nào.</div>}
      </div>
      {modal && <CategoryModal category={modal.category} platforms={platforms} presetPlatform={modal.preset} onClose={() => setModal(null)} />}
    </div>
  );
}
