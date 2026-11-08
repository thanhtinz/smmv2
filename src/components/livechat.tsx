"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { num } from "@/lib/format";
import { useLang } from "@/components/lang";

type Pick = { id: number; name: string; platformLabel: string; categoryName: string; min: number; price: number; reason: string };
type Msg = { role: "me" | "bot"; text: string; picks?: Pick[]; mode?: string };

const QUICK = ["Tăng follow TikTok cho kênh bán hàng", "Follow Facebook giá rẻ", "Tăng like Instagram", "Tăng view YouTube"];

/** Livechat nổi: trợ lý tư vấn dịch vụ ngay trong khung chat — khách mô tả nhu cầu,
 *  hệ thống (AI nếu đã cấu hình, không thì tìm từ khoá) gợi ý dịch vụ kèm giá của
 *  chính khách và nút đặt đơn. panelSlug: khi đặt trong website con thì giá theo panel. */
export function LiveChat({ panelSlug }: { panelSlug?: string }) {
  const { t, td, m } = useLang();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "bot", text: t("Chào bạn! Bạn muốn tăng gì cho kênh của mình? Cứ mô tả tự nhiên, mình gợi ý dịch vụ phù hợp kèm giá của bạn.") },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loggedIn, setLoggedIn] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs, open, busy]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setMsgs((m) => [...m, { role: "me", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const r = await fetch("/api/chat/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, panelSlug: panelSlug || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || t("Có lỗi xảy ra"));
      setLoggedIn(!!j.loggedIn);
      if (j.picks?.length) {
        setMsgs((prev) => [...prev, { role: "bot", text: j.mode === "ai" ? t("Mình gợi ý các dịch vụ này cho bạn:") : t("Đây là các dịch vụ khớp nhất với mô tả của bạn:"), picks: j.picks, mode: j.mode }]);
      } else {
        setMsgs((prev) => [...prev, { role: "bot", text: t("Chưa thấy dịch vụ khớp — bạn thử ghi rõ tên mạng xã hội và thứ cần tăng (follow, like, view...) nhé.") }]);
      }
    } catch (e: any) {
      setMsgs((prev) => [...prev, { role: "bot", text: String(e?.message || t("Có lỗi xảy ra, thử lại sau nhé.")) }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-[9.5rem] right-4 z-[60] flex h-[480px] w-[min(92vw,370px)] flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl lg:bottom-24 lg:right-5">
          <div className="flex items-center gap-3 bg-slate-950 px-4 py-3.5 text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-600">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0-4 10.5c.8.6 1 1.5 1 2.5h6c0-1 .2-1.9 1-2.5A6 6 0 0 0 12 3Z" /><path d="M9 20h6M10 22h4" /></svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold">{t("Trợ lý tư vấn dịch vụ")}</div>
              <div className="text-xs text-slate-400">{t("Trả lời ngay · gợi ý kèm giá của bạn")}</div>
            </div>
            <button onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20" aria-label={t("Đóng chat")}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div ref={bodyRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-3.5 py-4">
            {msgs.map((msg, i) => (
              <div key={i} className={msg.role === "me" ? "flex justify-end" : "flex justify-start"}>
                <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${msg.role === "me" ? "rounded-br-md bg-slate-900 text-white" : "rounded-bl-md bg-white text-slate-700 shadow-sm"}`}>
                  <p>{msg.text}</p>
                  {msg.picks && (
                    <div className="mt-2.5 space-y-2">
                      {msg.picks.map((p) => (
                        <div key={p.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                          <div className="text-[13px] font-bold leading-snug text-slate-800">{p.name}</div>
                          <div className="mt-0.5 text-xs text-slate-400">{p.platformLabel} · {p.categoryName} · {t("tối thiểu ")}{num(p.min)}</div>
                          <div className="mt-1 text-xs font-medium text-brand-700">{p.reason}</div>
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-sm font-extrabold text-slate-900">{m(p.price)}<span className="text-[11px] font-medium text-slate-400"> /1000</span></span>
                            {loggedIn
                              ? <Link href={`/dashboard/dat-hang?service=${p.id}`} className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700">{t("Đặt đơn")}</Link>
                              : <Link href="/login" className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700">{t("Đăng nhập để đặt")}</Link>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="flex justify-start"><div className="rounded-2xl rounded-bl-md bg-white px-3.5 py-2.5 text-sm text-slate-400 shadow-sm">{t("Đang tìm dịch vụ phù hợp...")}</div></div>}
            {msgs.length === 1 && !busy && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {QUICK.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900">{t(s)}</button>
                ))}
              </div>
            )}
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="flex items-center gap-2 border-t border-slate-100 bg-white px-3 py-3"
          >
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={t("VD: cần tăng follow TikTok giá rẻ...")} className="min-w-0 flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-slate-400 focus:bg-white" />
            <button disabled={busy || !input.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-600 text-white transition hover:bg-rose-500 disabled:opacity-40" aria-label={t("Gửi")}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
            </button>
          </form>
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-[5.5rem] right-4 z-[60] flex h-12 items-center gap-2 rounded-full bg-slate-950 pl-3.5 pr-4 text-white shadow-xl transition hover:bg-slate-800 lg:bottom-[4.75rem] lg:right-5"
        title={t("Chat tư vấn dịch vụ")}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>
        <span className="text-sm font-semibold">{t("Tư vấn")}</span>
      </button>
    </>
  );
}
