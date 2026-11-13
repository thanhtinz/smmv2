"use client";
import { useState, useRef, useEffect } from "react";
import { adminSaveProvider, adminDeleteProvider, adminProviderAction, adminProviderMarkup, adminSyncAllProviders } from "@/app/actions/admin";
import { num } from "@/lib/format";
import { useLang } from "@/components/lang";

/* ---------- Khung modal dùng chung cho khu vực danh mục (NCC / Dịch vụ / Danh mục) ---------- */
export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const { t } = useLang();
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className={`my-8 w-full ${wide ? "max-w-2xl" : "max-w-lg"} rounded-2xl bg-white shadow-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div className="text-base font-extrabold text-slate-900">{title}</div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label={t("Đóng")}>
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
  id: number; kind: string; driver: string; name: string; apiUrl: string; currency: string; exchangeRate: number;
  markupPercent: number; balanceCache: number; active: boolean; note: string | null;
  syncServices: boolean; syncCategories: boolean; autoUpdatePrice: boolean;
  syncContent: boolean; filterHtml: boolean; syncAdvanced: boolean; coupon: string | null; cronSyncLimit: number;
  minBalanceAlert: number; dailyLimit: number; serviceCount: number; lastSyncAt: string | null;
};

export const FZR_MARKUP_GROUPS = [
  ["gamekeys", "Game Key"],
  ["giftcards", "Gift Card"],
  ["topups", "Top-Up"],
  ["manual", "Dịch vụ thủ công"],
  ["telegram_stars", "Telegram Stars"],
  ["telegram_premium", "Telegram Premium"],
  ["steam_topup", "Steam Top-Up"],
  ["steam_gift", "Steam Gift Games"],
] as const;

export type ProviderMode = "PREMIUM" | "FZR" | "LEGACY";

/** Chế độ form nhà cung cấp: hai nút thêm riêng — Premium / FZR — mỗi biến
 *  thể chỉ hiện field của loại đó, không còn dropdown kind/driver trong
 *  form. NCC cũ loại BOTH (hoặc kind SMM sót từ trước đợt gỡ SMM 2026-11-12)
 *  mở biến thể LEGACY (đủ 2 dropdown như form cũ) để vẫn sửa được mọi field. */
export function providerModeOf(p?: ProviderDTO): ProviderMode {
  if (!p) return "PREMIUM";
  if (p.driver === "FZR") return "FZR";
  if (p.kind === "PREMIUM") return "PREMIUM";
  return "LEGACY";
}

export function ProviderModal({ provider, onClose, webhookSecretSet, mode, fzrMarkups }: { provider?: ProviderDTO; onClose: () => void; webhookSecretSet?: boolean; mode?: ProviderMode; fzrMarkups?: Record<string, string> }) {
  const { t } = useLang();
  const [tab, setTab] = useState(0);
  const [driver, setDriver] = useState(provider?.driver || "STANDARD");
  const p = provider;
  const m: ProviderMode = p ? providerModeOf(p) : mode || "PREMIUM";
  // apiUrl là CONTROLLED: trình duyệt có thói quen khôi phục giá trị đã gõ cho
  // field cùng tên giữa các lần mở modal (đã gặp: URL của form FZR bị áp sang
  // form SMM khi sửa) — controlled value theo đúng NCC đang sửa mới chống được.
  const [apiUrl, setApiUrl] = useState(p?.apiUrl || (m === "FZR" ? "https://api.fzr.cards" : ""));
  const effectiveDriver = m === "FZR" ? "FZR" : m === "LEGACY" ? driver : "STANDARD";
  const tabs = ["Thông tin cơ bản", "Cài đặt đồng bộ", "Tiền tệ & Giới hạn"];
  const title = p ? t("Chỉnh sửa nhà cung cấp") : m === "PREMIUM" ? t("Thêm nhà cung cấp Premium") : t("Thêm nhà cung cấp FZR");
  return (
    <Modal title={title} onClose={onClose} wide>
      <form action={adminSaveProvider}>
        {p && <input type="hidden" name="id" value={p.id} />}
        <div className="flex gap-1 border-b border-slate-100 px-6 pt-3">
          {tabs.map((tb, i) => (
            <button key={tb} type="button" onClick={() => setTab(i)} className={`rounded-t-lg px-3.5 py-2 text-sm font-semibold transition ${tab === i ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:text-slate-800"}`}>{t(tb)}</button>
          ))}
        </div>
        <div className="max-h-[62vh] overflow-y-auto px-6 py-5">
          <div className={tab === 0 ? "space-y-4" : "hidden"}>
            <div><label className={lbl}>{t("Tên nhà cung cấp *")}</label><input name="name" required defaultValue={p?.name || ""} className={inp} placeholder={t("Nhập tên nhà cung cấp")} /></div>
            {m === "FZR" ? (
              <div>
                <label className={lbl}>URL API *</label>
                <input name="apiUrl" readOnly value={apiUrl} autoComplete="off" className={`${inp} bg-slate-50 text-slate-500`} />
                <p className="mt-1 text-xs text-slate-400">{t("URL API của FazerCards cố định — mọi khu Telegram / Steam dùng chung địa chỉ này.")}</p>
              </div>
            ) : (
              <div><label className={lbl}>URL API *</label><input name="apiUrl" required value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} autoComplete="off" className={inp} placeholder="https://api.example.com" /></div>
            )}
            <div>
              <label className={lbl}>API Key {p ? "" : "*"}</label>
              <input name="apiKey" type="password" defaultValue={p ? "••••••••••••••••" : ""} className={inp} placeholder={t("Nhập API key")} autoComplete="new-password" />
              <p className="mt-1 text-xs text-slate-400">{p ? t("Để nguyên dấu • nếu không đổi key.") : t("API Key được mã hoá an toàn.")}</p>
            </div>
            {m !== "FZR" && <div><label className={lbl}>{t("Mã giảm giá (Coupon) phía API — nếu nhà cung cấp có")}</label><input name="coupon" defaultValue={p?.coupon || ""} className={inp} placeholder={t("Để trống nếu không có")} /></div>}
            {m === "LEGACY" ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={lbl}>{t("Loại API *")}</label>
                    <select name="kind" defaultValue={p?.kind || "BOTH"} className={inp}>
                      <option value="BOTH">Standard API (Premium)</option>
                      <option value="PREMIUM">{t("Chỉ API sản phẩm (Premium)")}</option>
                    </select>
                  </div>
                  <div>
                    <label className={lbl}>{t("Kiểu kiểm tra API")}</label>
                    <select className={inp} defaultValue="balance"><option value="balance">{t("Balance (số dư)")}</option><option value="services">{t("Services (danh sách)")}</option></select>
                  </div>
                </div>
                <div>
                  <label className={lbl}>{t("Giao thức API")}</label>
                  <select name="driver" value={driver} onChange={(e) => setDriver(e.target.value)} className={inp}>
                    <option value="STANDARD">{t("Chuẩn SMM v2 / sản phẩm đối tác")}</option>
                    <option value="FZR">FazerCards (fzr.cards)</option>
                  </select>
                  <p className="mt-1 text-xs text-slate-400">{t("FazerCards: đồng bộ sản phẩm số (game key, gift card, nạp dịch vụ, Telegram, Steam) vào Premium.")}</p>
                </div>
              </>
            ) : (
              <>
                <input type="hidden" name="kind" value="PREMIUM" />
                <input type="hidden" name="driver" value={m === "FZR" ? "FZR" : "STANDARD"} />
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-500">
                  {m === "PREMIUM" && t("Nhà cung cấp Premium chuẩn đối tác: đồng bộ catalog sản phẩm số (tài khoản, key, gói) vào cửa hàng Premium.")}
                  {m === "FZR" && t("FazerCards: đồng bộ sản phẩm số (game key, gift card, nạp dịch vụ, Telegram, Steam) vào Premium.")}
                </p>
              </>
            )}
            {effectiveDriver === "FZR" && (
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="text-sm font-bold text-slate-800">{t("Webhook FazerCards (dùng chung)")}</div>
                <div>
                  <label className={lbl}>{t("URL webhook (dán vào panel FazerCards)")}</label>
                  <input className={inp} readOnly value="https://smmv2-zeta.vercel.app/api/webhooks/fzr" />
                </div>
                <div>
                  <label className={lbl}>{t("Webhook secret của FazerCards")}</label>
                  <input className={inp} type="password" name="fzr_webhook_secret" placeholder={webhookSecretSet ? "•••••••• (đã đặt — nhập để thay)" : "whsec_..."} autoComplete="off" />
                  <p className="mt-1 text-xs text-slate-400">{t("Secret lấy tại panel FazerCards → Settings → Webhooks, dùng để xác thực thông báo trạng thái đơn. Để trống = giữ nguyên.")}</p>
                </div>
              </div>
            )}
            <Switch name="active" defaultChecked={p ? p.active : true} label={t("Trạng thái (đang hoạt động)")} />
            <div><label className={lbl}>{t("Mô tả")}</label><textarea name="note" rows={2} defaultValue={p?.note || ""} className={inp} placeholder={t("Nhập mô tả về nhà cung cấp...")} /></div>
          </div>
          <div className={tab === 1 ? "space-y-4" : "hidden"}>
            <div>
              <label className={lbl}>{t("Tỷ lệ giá (%)")}</label>
              <input name="markupPercent" type="number" min={0} max={500} defaultValue={p?.markupPercent ?? 30} className={inp} />
              <p className="mt-1 text-xs text-slate-400">{t("Tỷ lệ tăng giá khi đồng bộ sản phẩm từ nhà cung cấp.")}</p>
            </div>
            {effectiveDriver === "FZR" && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                <div className="text-sm font-bold text-slate-800">{t("Markup theo nhóm FZR (%)")}</div>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{t("Cấu hình ngay tại đây cùng API key và markup chung. Để trống một nhóm = nhóm đó dùng markup chung của nhà cung cấp.")}</p>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {FZR_MARKUP_GROUPS.map(([group, label]) => (
                    <div key={group}>
                      <label className={lbl}>{t(label)}</label>
                      <input name={`fzr_markup_${group}`} type="number" min={0} max={1000} defaultValue={fzrMarkups?.[group] || ""} placeholder={String(p?.markupPercent ?? 30)} className={inp} />
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-4 py-2">
              <Switch name="syncServices" defaultChecked={p ? p.syncServices : true} label={t("Đồng bộ sản phẩm")} />
              <Switch name="syncCategories" defaultChecked={p ? p.syncCategories : true} label={t("Đồng bộ danh mục")} />
              <Switch name="autoUpdatePrice" defaultChecked={p ? p.autoUpdatePrice : true} label={t("Tự động cập nhật giá")} />
              <Switch name="syncContent" defaultChecked={p ? p.syncContent : false} label={t("Cập nhật Tên dịch vụ khi đồng bộ")} />
              <Switch name="filterHtml" defaultChecked={p ? p.filterHtml : true} label={t("Lọc HTML độc hại khỏi tên/mô tả")} />
              <Switch name="syncAdvanced" defaultChecked={p ? p.syncAdvanced : false} label={t("Đồng bộ nâng cao")} />
            </div>
          </div>
          <div className={tab === 2 ? "space-y-4" : "hidden"}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>{t("Đơn vị tiền tệ")}</label>
                <select name="currency" defaultValue={p?.currency || "VND"} className={inp}><option value="VND">VND</option><option value="USD">USD</option></select>
              </div>
              <div><label className={lbl}>{t("Tỷ giá hối đoái")}</label><input name="exchangeRate" type="number" min={1} defaultValue={p?.exchangeRate ?? 1} className={inp} /></div>
              <div><label className={lbl}>{t("Ngưỡng số dư tối thiểu (VNĐ)")}</label><input name="minBalanceAlert" type="number" min={0} defaultValue={p?.minBalanceAlert ?? 0} className={inp} /></div>
              <div><label className={lbl}>{t("Giới hạn đặt hàng tối đa mỗi ngày")}</label><input name="dailyLimit" type="number" min={0} defaultValue={p?.dailyLimit ?? 0} className={inp} /></div>
              <div><label className={lbl}>{t("Giới hạn đồng bộ đơn mỗi vòng cron")}</label><input name="cronSyncLimit" type="number" min={1} defaultValue={p?.cronSyncLimit ?? 50} className={inp} /></div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="btn-ghost btn-sm !px-5 !py-2.5">{t("Hủy")}</button>
          <button className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700">{p ? t("Cập nhật nhà cung cấp") : t("Lưu nhà cung cấp")}</button>
        </div>
      </form>
    </Modal>
  );
}

/** Import dịch vụ CHỌN LỌC: xem toàn bộ dịch vụ phía nhà cung cấp, tick chọn từng
 *  dịch vụ muốn nhập, đặt % markup riêng cho đợt nhập rồi mới tạo — khác nút Đồng bộ
 *  (đồng bộ là nhập tất cả + cập nhật giá các dịch vụ đã có). */
export function ProvidersClient({ providers, webhookSecretSet, fzrMarkups }: { providers: ProviderDTO[]; webhookSecretSet?: boolean; fzrMarkups?: Record<string, string> }) {
  const { t, td, m } = useLang();
  const [editing, setEditing] = useState<ProviderDTO | undefined>(undefined);
  const [addMode, setAddMode] = useState<ProviderMode>("PREMIUM");
  const [open, setOpen] = useState(false);
  const iconBtn = "inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800";
  const openAdd = (mode: ProviderMode) => { setEditing(undefined); setAddMode(mode); setOpen(true); };
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <form action={adminSyncAllProviders}><button className="btn-ghost !px-4">{t("Đồng bộ tất cả")}</button></form>
        <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
        <button onClick={() => openAdd("PREMIUM")} className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600">{t("+ Thêm nhà cung cấp Premium")}</button>
        <button onClick={() => openAdd("FZR")} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-violet-700">{t("+ Thêm nhà cung cấp FZR")}</button>
      </div>
      {/* key theo đích mở: điều hướng mềm sau server action GIỮ instance modal
          (state không tự reset) — không có key, form thêm FZR mở sau form SMM
          sẽ còn nguyên URL đã gõ ở form trước (đã gặp thật khi kiểm chứng). */}
      {open && <ProviderModal key={editing ? `edit-${editing.id}` : `add-${addMode}`} provider={editing} mode={addMode} onClose={() => setOpen(false)} webhookSecretSet={webhookSecretSet} fzrMarkups={fzrMarkups} />}
      <div className="card mt-5 overflow-x-auto">
        <table className="w-full min-w-[880px]">
          <thead><tr className="border-b border-slate-100">
            <th className="th">{t("Nhà cung cấp")}</th><th className="th">{t("Sản phẩm")}</th><th className="th">API</th><th className="th">{t("Tỷ lệ")}</th><th className="th">{t("Tiền tệ")}</th><th className="th">{t("Số dư")}</th><th className="th">{t("Trạng thái")}</th><th className="th text-right">{t("Hành động")}</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {providers.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50/60">
                <td className="td"><div className="font-bold text-slate-800">{p.name}</div><div className="max-w-[220px] truncate text-xs text-slate-400">{p.apiUrl}</div></td>
                <td className="td text-slate-600">{`${num(p.serviceCount)} ${t("sản phẩm")}`}</td>
                <td className="td">
                  {p.driver === "FZR" ? <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">FZR · FazerCards</span>
                    : p.kind === "PREMIUM" ? <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">Premium</span>
                    : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">Premium</span>}
                  <div className="mt-1 text-xs text-slate-400">{p.lastSyncAt ? `${t("Đồng bộ")}: ${p.lastSyncAt}` : t("Chưa đồng bộ")}</div></td>
                <td className="td">
                  <form action={adminProviderMarkup} className="flex items-center gap-1.5">
                    <input type="hidden" name="id" value={p.id} />
                    <input name="markupPercent" type="number" min={0} max={500} defaultValue={p.markupPercent} className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm" />
                    <span className="text-sm text-slate-500">%</span>
                    <button className="text-blue-600 hover:text-blue-800" title={t("Lưu tỷ lệ")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg></button>
                  </form>
                </td>
                <td className="td text-slate-600">{p.currency}</td>
                <td className="td font-semibold text-slate-700">{p.balanceCache ? m(p.balanceCache) : "—"}</td>
                <td className="td">{p.active ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-600">{t("Đang hoạt động")}</span> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-500">{t("Đã tắt")}</span>}</td>
                <td className="td">
                  <div className="flex items-center justify-end gap-1.5">
                    <button className={iconBtn} title={t("Sửa")} onClick={() => { setEditing(p); setOpen(true); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.8 2.8 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg></button>
                    <form action={adminProviderAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="kind" value="sync" /><button className={iconBtn} title={t("Đồng bộ")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6" /></svg></button></form>
                    {p.driver === "FZR" && <form action={adminProviderAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="kind" value="sync-steam" /><button className={iconBtn} title={t("Đồng bộ kèm Steam gift")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" /></svg></button></form>}
                    <form action={adminProviderAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="kind" value="balance" /><button className={iconBtn} title={t("Kiểm tra số dư")}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4.5v15l13-7.5-13-7.5Z" /></svg></button></form>
                    <form action={adminDeleteProvider} onSubmit={(e) => { if (!confirm(`${t("Xoá nhà cung cấp")} ${p.name}?`)) e.preventDefault(); }}><input type="hidden" name="id" value={p.id} /><button className={`${iconBtn} hover:!bg-rose-50 hover:!text-rose-600`} title={t("Xoá")}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6" /></svg></button></form>
                  </div>
                </td>
              </tr>
            ))}
            {providers.length === 0 && <tr><td colSpan={8} className="td py-10 text-center text-slate-400">{t("Chưa có nhà cung cấp nào — chọn một trong hai nút thêm ở trên theo loại nguồn (Premium / FZR).")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
