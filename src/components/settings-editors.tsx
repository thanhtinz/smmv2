"use client";
import { useState } from "react";
import { useLang } from "@/components/lang";

/** Trình sửa mốc thưởng nạp dạng hàng (thêm/xoá dòng) — ghi ra input ẩn JSON deposit_bonus_tiers. */
export function BonusTiersEditor({ initial }: { initial: string }) {
  const { t } = useLang();
  type Tier = { from: number; percent: number };
  const parse = (): Tier[] => {
    try {
      const a = JSON.parse(initial || "[]");
      return Array.isArray(a) ? a.map((t) => ({ from: parseInt(String(t.from)) || 0, percent: parseFloat(String(t.percent)) || 0 })) : [];
    } catch { return []; }
  };
  const [rows, setRows] = useState<Tier[]>(parse);
  const set = (i: number, patch: Partial<Tier>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div>
      <input type="hidden" name="deposit_bonus_tiers" value={JSON.stringify(rows.filter((r) => r.from > 0))} />
      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-slate-500">{t("Nạp từ")}</span>
            <input type="number" min={0} value={r.from || ""} onChange={(e) => set(i, { from: parseInt(e.target.value) || 0 })} className="inp !w-40" placeholder={t("VD: 1000000")} />
            <span className="text-sm text-slate-500">{t("thưởng")}</span>
            <input type="number" min={0} max={100} step="0.5" value={r.percent || ""} onChange={(e) => set(i, { percent: parseFloat(e.target.value) || 0 })} className="inp !w-24" placeholder="%" />
            <span className="text-sm text-slate-500">%</span>
            <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="btn-ghost btn-sm !text-rose-600">{t("Xoá")}</button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-400">{t("Chưa có mốc thưởng nào — nạp tiền không được cộng thưởng.")}</p>}
      </div>
      <button type="button" onClick={() => setRows((r) => [...r, { from: 0, percent: 0 }])} className="btn-ghost btn-sm mt-3">{t("+ Thêm mốc khuyến mãi")}</button>
    </div>
  );
}

/** Ô nhập Tool API Key kèm nút Tạo mã mới (sinh ngẫu nhiên tại trình duyệt, admin bấm Lưu mới ghi). */
export function ToolKeyField({ initial, name = "tool_api_key" }: { initial: string; name?: string }) {
  const { t } = useLang();
  const [val, setVal] = useState(initial || "");
  const gen = () => {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    setVal(Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join(""));
  };
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <input className="inp min-w-0 flex-1 font-mono" name={name} value={val} onChange={(e) => setVal(e.target.value)} placeholder={t("Chưa có key — bấm Tạo mã mới")} autoComplete="off" />
      <button type="button" onClick={gen} className="btn-ghost btn-sm shrink-0">{t("Tạo mã mới")}</button>
    </div>
  );
}

type Bot = { id: string; name: string; token: string; chatId: string };

/** Quản lý bot Telegram phụ (báo đơn theo dịch vụ) — ghi ra input ẩn JSON telegram_bots. */
export function TelegramBotsEditor({ initial }: { initial: string }) {
  const { t } = useLang();
  const parse = (): Bot[] => {
    try {
      const a = JSON.parse(initial || "[]");
      return Array.isArray(a) ? a.map((b) => ({ id: String(b.id), name: String(b.name || ""), token: String(b.token || ""), chatId: String(b.chatId || "") })) : [];
    } catch { return []; }
  };
  const [rows, setRows] = useState<Bot[]>(parse);
  const set = (i: number, patch: Partial<Bot>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div>
      <input type="hidden" name="telegram_bots" value={JSON.stringify(rows.filter((r) => r.name.trim()))} />
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.id} className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
            <input value={r.name} onChange={(e) => set(i, { name: e.target.value })} className="inp" placeholder={t("Tên bot (VD: Bot đơn Facebook)")} />
            <input value={r.token} onChange={(e) => set(i, { token: e.target.value })} className="inp" placeholder="Bot Token" autoComplete="off" />
            <input value={r.chatId} onChange={(e) => set(i, { chatId: e.target.value })} className="inp" placeholder={t("Chat ID nhận tin")} />
            <button type="button" onClick={() => setRows((x) => x.filter((_, j) => j !== i))} className="btn-ghost btn-sm !text-rose-600">{t("Xoá")}</button>
          </div>
        ))}
        {rows.length === 0 && <p className="text-sm text-slate-400">{t("Chưa có bot phụ nào. Bot hệ thống ở trên vẫn báo toàn bộ sự kiện như thường.")}</p>}
      </div>
      <button type="button" onClick={() => setRows((r) => [...r, { id: `bot${Date.now()}`, name: "", token: "", chatId: "" }])} className="btn-ghost btn-sm mt-3">{t("+ Thêm Bot Telegram")}</button>
      <p className="mt-2 text-xs text-slate-400">{t("Gán bot cho từng dịch vụ ở form Thêm/Sửa dịch vụ (mục Bot Telegram báo đơn) — đơn của dịch vụ đó sẽ báo thêm về bot được gán.")}</p>
    </div>
  );
}
