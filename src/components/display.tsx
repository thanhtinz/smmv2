"use client";
import { useEffect, useState } from "react";
import { ACCENTS } from "@/components/theme";
import { DICT, LANGS, CURRENCIES, FONTS, FSIZES } from "@/lib/i18n";

/* ================= Tuỳ chọn hiển thị (lưu trên máy khách) ================= */
export type Prefs = { accent: string; mode: string; dir: string; font: string; fsize: string; lang: string; cur: string };
const DEF: Prefs = { accent: "blue", mode: "light", dir: "ltr", font: "default", fsize: "md", lang: "en", cur: "VND" };
const KEYS: Record<keyof Prefs, string> = { accent: "smmv2-accent", mode: "smmv2-mode", dir: "smmv2-dir", font: "smmv2-font", fsize: "smmv2-fsize", lang: "smmv2-lang", cur: "smmv2-cur" };

export function readPrefs(): Prefs {
  try {
    const p = { ...DEF };
    (Object.keys(KEYS) as (keyof Prefs)[]).forEach((k) => { const v = localStorage.getItem(KEYS[k]); if (v) p[k] = v; });
    return p;
  } catch { return DEF; }
}
export function applyPrefs(p: Prefs) {
  const h = document.documentElement;
  h.setAttribute("data-accent", p.accent);
  h.classList.toggle("dark", p.mode === "dark");
  h.setAttribute("dir", p.dir);
  h.setAttribute("data-font", p.font);
  h.setAttribute("data-fsize", p.fsize);
  h.setAttribute("lang", p.lang);
  try { (Object.keys(KEYS) as (keyof Prefs)[]).forEach((k) => localStorage.setItem(KEYS[k], p[k])); } catch {}
  window.dispatchEvent(new Event("smmv2-display"));
}

const GearIcon = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3.2" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.51 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.23.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z" /></svg>
);

function Seg({ options, value, onPick }: { options: { key: string; name: string }[]; value: string; onPick: (k: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.key} type="button" onClick={() => onPick(o.key)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${value === o.key ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{o.name}</button>
      ))}
    </div>
  );
}
const Label = ({ children }: { children: React.ReactNode }) => <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">{children}</div>;

/** Nút Cài đặt hiển thị — gộp: sáng/tối, màu chủ đạo, LTR/RTL, font, cỡ chữ, ngôn ngữ, tiền tệ */
export function DisplaySettings({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [prefs, setPrefs] = useState<Prefs>(DEF);
  const [open, setOpen] = useState(false);
  useEffect(() => { setPrefs(readPrefs()); }, []);
  const set = (patch: Partial<Prefs>) => { const p = { ...prefs, ...patch }; setPrefs(p); applyPrefs(p); };
  const cur = ACCENTS.find((a) => a.key === prefs.accent) || ACCENTS[0];
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} title="Cài đặt hiển thị"
        className={`flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition ${tone === "dark" ? "bg-white/10 border-white/15 text-white hover:bg-white/20" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
        <span className="w-4 h-4 rounded-full border border-white/60 shadow-inner" style={{ background: cur.hex }} />
        <span className="hidden xl:inline">Cài đặt</span>
        {GearIcon}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="fixed inset-x-3 top-[76px] z-50 card p-4 text-left max-h-[80vh] overflow-y-auto sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-[300px]">
            <div className="font-bold text-slate-900 mb-3">Cài đặt hiển thị</div>
            <div className="space-y-4">
              <div><Label>Chế độ</Label><Seg options={[{ key: "light", name: "Sáng" }, { key: "dark", name: "Tối" }]} value={prefs.mode} onPick={(k) => set({ mode: k })} /></div>
              <div>
                <Label>Màu chủ đạo</Label>
                <div className="flex flex-wrap gap-2">
                  {ACCENTS.map((a) => (
                    <button key={a.key} type="button" title={a.name} onClick={() => set({ accent: a.key })} className={`w-8 h-8 rounded-full transition ${prefs.accent === a.key ? "ring-2 ring-offset-2 ring-slate-800 scale-110" : "hover:scale-110"}`} style={{ background: a.hex }} />
                  ))}
                </div>
              </div>
              <div><Label>Hướng hiển thị</Label><Seg options={[{ key: "ltr", name: "LTR" }, { key: "rtl", name: "RTL" }]} value={prefs.dir} onPick={(k) => set({ dir: k })} /></div>
              <div><Label>Font chữ</Label><Seg options={FONTS.map((f) => ({ key: f.key, name: f.name }))} value={prefs.font} onPick={(k) => set({ font: k })} /></div>
              <div><Label>Cỡ chữ</Label><Seg options={FSIZES.map((f) => ({ key: f.key, name: f.name }))} value={prefs.fsize} onPick={(k) => set({ fsize: k })} /></div>
              <div><Label>Ngôn ngữ</Label><Seg options={LANGS.map((l) => ({ key: l.key, name: l.name }))} value={prefs.lang} onPick={(k) => set({ lang: k })} /></div>
              <div><Label>Tiền tệ</Label><Seg options={CURRENCIES.map((c) => ({ key: c.key, name: c.name }))} value={prefs.cur} onPick={(k) => set({ cur: k })} /></div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ================= Lớp hiển thị: dịch giao diện + quy đổi tiền tệ tại chỗ ================= */
const SKIP = new Set(["SCRIPT", "STYLE", "CODE", "PRE", "TEXTAREA", "NOSCRIPT"]);
/* Dịch theo MẢNH cho các dòng ghép (vd "Đơn giá 45.000đ/1000", "Số lượng 500 · Bắt đầu —") */
const FRAGMENTS: [string, Record<string, string>][] = [
  ["Đơn giá ", { en: "Rate ", zh: "单价 ", th: "ราคา ", ja: "単価 ", ko: "단가 " }],
  ["đã hoàn ", { en: "refunded ", zh: "已退 ", th: "คืนแล้ว ", ja: "返金済み ", ko: "환불됨 " }],
  ["Số lượng: ", { en: "Quantity: ", zh: "数量:", th: "จำนวน: ", ja: "数量：", ko: "수량: " }],
  ["Số lượng ", { en: "Quantity ", zh: "数量 ", th: "จำนวน ", ja: "数量 ", ko: "수량 " }],
  ["Bắt đầu ", { en: "Start ", zh: "开始 ", th: "เริ่ม ", ja: "開始 ", ko: "시작 " }],
  ["Còn lại ", { en: "Remains ", zh: "剩余 ", th: "คงเหลือ ", ja: "残り ", ko: "남음 " }],
  ["Cập nhật ", { en: "Updated ", zh: "更新 ", th: "อัปเดต ", ja: "更新 ", ko: "업데이트 " }],
  ["qua API", { en: "via API", zh: "通过 API", th: "ผ่าน API", ja: "API経由", ko: "API 경유" }],
  [" mục", { en: " items", zh: " 条", th: " รายการ", ja: " 件", ko: " 개" }],
  ["Tổng: ", { en: "Total: ", zh: "总计: ", th: "ทั้งหมด: ", ja: "合計：", ko: "총: " }],
  [" dịch vụ", { en: " services", zh: " 项服务", th: " บริการ", ja: " サービス", ko: " 서비스" }],
  ["Giao ngay · còn ", { en: "Instant delivery · only ", zh: "现货速发 · 仅剩 ", th: "ส่งทันที · เหลือเพียง ", ja: "即時配送 · 残り ", ko: "즉시 배송 · 남은 수량 " }],
  [" giao dịch trên toàn hệ thống — mọi thay đổi số dư đều có sổ ở đây.", { en: " transactions system-wide — every balance change is recorded here.", zh: " 笔全系统交易 — 每笔余额变动都有记录。", th: " ธุรกรรมทั่วทั้งระบบ — การเปลี่ยนแปลงยอดคงเหลือทั้งหมดถูกบันทึกไว้ที่นี่", ja: " 件のシステム全体の取引 — すべての残高変動がここに記録されます。", ko: " 건의 전체 시스템 거래 — 모든 잔액 변동이 여기에 기록됩니다." }],
  [" tài khoản hiển thị · Tổng số dư khách đang giữ: ", { en: " accounts shown · Total customer balances held: ", zh: " 个账户显示 · 客户持有的总余额:", th: " บัญชีที่แสดง · ยอดคงเหลือรวมของลูกค้าที่ถืออยู่: ", ja: " 件のアカウント表示 · 顧客が保持する総残高：", ko: "개 계정 표시 · 고객이 보유한 총 잔액: " }],
  [" (nợ phải trả của hệ thống)", { en: " (system liability)", zh: "(系统负债)", th: " (หนี้สินของระบบ)", ja: "（システムの負債）", ko: " (시스템 부채)" }],
  [" đơn thủ công đang chờ xử lý", { en: " manual orders awaiting processing", zh: " 个手动订单等待处理", th: " ออเดอร์แมนนวลรอการดำเนินการ", ja: " 件の手動注文が処理待ち", ko: " 건의 수동 주문이 처리 대기 중" }],
  [" đơn · Nạp ", { en: " orders · Deposits ", zh: " 单 · 充值 ", th: " ออเดอร์ · เติมเงิน ", ja: " 件 · 入金 ", ko: " 건 · 충전 " }],
  [" · Nạp ", { en: " · Deposits ", zh: " · 充值 ", th: " · เติมเงิน ", ja: " · 入金 ", ko: " · 충전 " }],
  [" đơn · ", { en: " orders · ", zh: " 单 · ", th: " ออเดอร์ · ", ja: " 件 · ", ko: " 건 · " }],
  [" · 0 đơn", { en: " · 0 orders", zh: " · 0 单", th: " · 0 ออเดอร์", ja: " · 0 件", ko: " · 0 건" }],
  ["Lãi ", { en: "Profit ", zh: "利润 ", th: "กำไร ", ja: "利益 ", ko: "이익 " }],
  ["Đặt lại số dư nhà cung cấp đang lưu đệm (", { en: "Reset cached provider balances (", zh: "重置缓存的供应商余额(", th: "รีเซ็ตยอดผู้ให้บริการที่แคชไว้ (", ja: "キャッシュされたプロバイダー残高をリセット（", ko: "캐시된 공급자 잔액을 초기화합니다 (" }],
  [" nguồn) — lần kiểm tra kế tiếp sẽ lấy số dư thật từ nguồn", { en: " sources) — the next check will fetch the real balance from the source", zh: " 个来源)— 下次检查将从来源获取真实余额", th: " แหล่ง) — การตรวจสอบครั้งถัดไปจะดึงยอดจริงจากแหล่ง", ja: " 件）— 次回チェックでソースから実際の残高を取得します", ko: " 개 소스) — 다음 확인 시 소스에서 실제 잔액을 가져옵니다" }],
  [" phát sinh", { en: " transactions", zh: " 笔交易", th: " รายการ", ja: " 件", ko: " 건" }],
  [" tài khoản", { en: " accounts", zh: " 个账户", th: " บัญชี", ja: " アカウント", ko: " 계정" }],
  [" — đã trừ ", { en: " — charged ", zh: " — 已扣除 ", th: " — หักเงิน ", ja: " — 差し引かれました ", ko: " — 차감됨 " }],
  ["Đã đặt ", { en: "Placed ", zh: "已下 ", th: "สั่งแล้ว ", ja: "注文済み ", ko: "주문 완료 " }],
  [" đơn: ", { en: " orders: ", zh: " 个订单:", th: " ออเดอร์: ", ja: " 件の注文：", ko: " 개 주문: " }],
  [" — đã giao tự động, xem nội dung trong đơn", { en: " — auto-delivered, see the content in your order", zh: " — 已自动交付,请在订单中查看内容", th: " — จัดส่งอัตโนมัติแล้ว ดูเนื้อหาในออเดอร์", ja: " — 自動配信済み、注文内で内容をご確認ください", ko: " — 자동 배송됨, 주문에서 내용을 확인하세요" }],
  [" vừa được đặt tự động, trừ ", { en: " was just placed automatically, charged ", zh: " 刚刚自动下单,扣除 ", th: " ถูกสั่งโดยอัตโนมัติ หักเงิน ", ja: " が自動で注文され、差し引かれました ", ko: " 자동 주문되어 차감됨 " }],
];
const MONEY = /(\d{1,3}(?:\.\d{3})+|\d+)đ/g;
const LOCALES: Record<string, string> = { vi: "vi-VN", en: "en-US", zh: "zh-CN", th: "th-TH", ja: "ja-JP", ko: "ko-KR" };
const originals = new Map<Text, string>();
const written = new Map<Text, string>();
const phOriginals = new Map<Element, string>();
const phWritten = new Map<Element, string>();
let applying = false;

function fmtMoney(vndInt: number, cur: string, lang: string) {
  const c = CURRENCIES.find((x) => x.key === cur);
  if (!c) return null;
  const val = vndInt / c.rate;
  const zero = cur === "JPY" || cur === "KRW";
  return new Intl.NumberFormat(LOCALES[lang] || "en-US", { style: "currency", currency: cur, minimumFractionDigits: zero ? 0 : undefined, maximumFractionDigits: zero ? 0 : 2 }).format(val);
}

function runDisplay() {
  if (applying || typeof document === "undefined" || !document.body) return;
  const p = readPrefs();
  applying = true;
  try {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        let el = node.parentElement;
        while (el) { if (SKIP.has(el.tagName) || el.hasAttribute("data-nodisplay")) return NodeFilter.FILTER_REJECT; el = el.parentElement; }
        return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes: Text[] = [];
    while (walker.nextNode()) nodes.push(walker.currentNode as Text);
    for (const n of nodes) {
      // Nếu nội dung hiện tại khác lần cuối chính lớp hiển thị ghi -> React vừa cập nhật giá trị mới:
      // lấy nó làm nguồn mới (tránh "đóng băng" các con số động như xem trước số tiền, số dư...)
      if (!originals.has(n) || (written.has(n) && n.nodeValue !== written.get(n))) originals.set(n, n.nodeValue || "");
      const src = originals.get(n)!;
      let out = src;
      if (p.lang !== "vi") {
        const t = src.trim();
        const tr = (DICT[t] as any)?.[p.lang];
        if (tr) out = src.replace(t, tr);
        // Mảnh ghép chỉ áp cho dòng CÓ SỐ (đơn giá/số lượng/còn lại...) — áp vào câu văn xuôi
        // sẽ sinh lẫn ngôn ngữ kiểu "Updated dữ liệu", "Bắt đầu" -> "Start ngay hôm nay", "mục tiêu" -> "items tiêu".
        else if (/\d/.test(out)) for (const [frag, map] of FRAGMENTS) { const r = map[p.lang]; if (r && out.includes(frag)) out = out.split(frag).join(r); }
      }
      if (p.cur !== "VND") {
        out = out.replace(MONEY, (m, num: string) => fmtMoney(parseInt(num.replace(/\./g, ""), 10), p.cur, p.lang) ?? m);
      }
      if (out !== n.nodeValue) n.nodeValue = out;
      written.set(n, out);
    }
    // placeholder của ô nhập
    document.querySelectorAll("input[placeholder], textarea[placeholder]").forEach((el) => {
      if (!phOriginals.has(el) || (phWritten.has(el) && el.getAttribute("placeholder") !== phWritten.get(el))) phOriginals.set(el, el.getAttribute("placeholder") || "");
      const src = phOriginals.get(el)!;
      let out = src;
      if (p.lang !== "vi") { const tr = (DICT[src.trim()] as any)?.[p.lang]; if (tr) out = tr; }
      if (out !== el.getAttribute("placeholder")) el.setAttribute("placeholder", out);
      phWritten.set(el, out);
    });
    // dọn node đã rời khỏi trang
    for (const k of Array.from(originals.keys())) if (!k.isConnected) { originals.delete(k); written.delete(k); }
  } finally { applying = false; }
}

/** Ngày hiện tại định dạng theo ngôn ngữ người dùng đã chọn (server không biết lựa chọn này). */
export function TodayText() {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    const lang = readPrefs().lang || "en";
    const loc = LOCALES[lang] || "en-US";
    setTxt(new Intl.DateTimeFormat(loc, { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date()));
  }, []);
  return <>{txt}</>;
}

export function DisplayEngine() {
  useEffect(() => {
    // Nạp tỉ giá hiển thị admin đã cấu hình (mặc định dùng bộ tỉ giá sẵn trong code)
    fetch("/api/display-config")
      .then((r) => r.json())
      .then((j) => {
        if (j?.rates) {
          for (const c of CURRENCIES) {
            const v = parseFloat(j.rates[c.key]);
            if (v > 0) c.rate = v;
          }
          runDisplay();
        }
      })
      .catch(() => {});
    let timer: any = null;
    const schedule = () => { if (!applying) { clearTimeout(timer); timer = setTimeout(runDisplay, 100); } };
    runDisplay();
    const ob = new MutationObserver(schedule);
    ob.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener("smmv2-display", runDisplay);
    return () => { ob.disconnect(); window.removeEventListener("smmv2-display", runDisplay); clearTimeout(timer); };
  }, []);
  return null;
}
