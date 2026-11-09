"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";
import { loadManualChatAction, sendManualChatAction } from "@/app/actions/manual-chat";
import type { ChatMsgDTO, ChatFlags } from "@/lib/manual-chat";

/* Khung chat của MỘT đơn Manual Services với nhà cung cấp (đợt
 * 2026-11-08): mở ra mới tải thread (server kéo từ NCC và hợp nhất),
 * tự làm mới 30s/lần khi đang mở + nút Làm mới. Tin của web nằm phải
 * (OUT), tin NCC nằm trái (IN). chat_read_only/chat_frozen từ NCC ->
 * khoá ô nhập. Chỉ văn bản — gửi ảnh chưa có đường tải phía khách. */
export function ManualChatPanel({ orderId, audience }: { orderId: number; audience: "customer" | "admin" }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMsgDTO[]>([]);
  const [flags, setFlags] = useState<ChatFlags | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await loadManualChatAction(orderId);
      if (r.ok) {
        setMessages(r.messages);
        setFlags(r.flags);
        setError(r.providerError || "");
      } else {
        setError(r.error);
      }
    } catch {
      setError(t("Không tải được tin nhắn."));
    } finally {
      setLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    if (!open) return;
    load();
    const iv = setInterval(load, 30000);
    return () => clearInterval(iv);
  }, [open, load]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, open]);

  const locked = !!(flags && (flags.readOnly || flags.frozen));

  const send = async () => {
    const text = draft.trim();
    if (!text || sending || locked) return;
    setSending(true);
    try {
      const r = await sendManualChatAction(orderId, text);
      if (r.ok && r.message) {
        setMessages((m) => [...m, r.message!]);
        setDraft("");
        setError("");
        load(); // hợp nhất lại với thread phía NCC
      } else {
        setError(r.error || t("Gửi tin nhắn thất bại."));
      }
    } catch {
      setError(t("Gửi tin nhắn thất bại."));
    } finally {
      setSending(false);
    }
  };

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleString("vi-VN", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
  };

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen((o) => !o)}>
        <span className="inline-flex items-center gap-1.5 [&>svg]:h-4 [&>svg]:w-4">{I.inbox}{t("Nhắn tin về đơn này")}</span>
      </button>
      {open && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
            <span className="text-[13px] font-bold text-slate-800">{t("Trao đổi với nhà cung cấp")}</span>
            <button type="button" className="btn-ghost btn-sm" disabled={loading} onClick={load}>{loading ? t("Đang tải…") : t("Làm mới")}</button>
          </div>
          <div ref={listRef} className="max-h-[320px] space-y-2.5 overflow-y-auto px-3.5 py-3">
            {messages.length === 0 && !loading && (
              <p className="py-4 text-center text-[13px] text-slate-400">{t("Chưa có tin nhắn nào — gửi tin đầu tiên để mở cuộc trò chuyện với nhà cung cấp.")}</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "OUT" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${m.direction === "OUT" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                  <div className={`mb-0.5 text-[11px] font-bold ${m.direction === "OUT" ? "text-white/75" : "text-slate-400"}`}>
                    {m.direction === "OUT" ? (audience === "admin" ? t("Cửa hàng") : t("Bạn")) : t("Nhà cung cấp")} · {fmtTime(m.at)}
                  </div>
                  {m.body && <div className="whitespace-pre-wrap break-words">{m.body}</div>}
                  {m.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt="" className="mt-1.5 max-h-40 rounded-lg object-cover" />
                  )}
                </div>
              </div>
            ))}
          </div>
          {error && <p className="border-t border-slate-100 px-3.5 py-2 text-xs text-rose-500">{error}</p>}
          {locked ? (
            <p className="border-t border-slate-100 px-3.5 py-2.5 text-[13px] text-slate-500">{t("Cuộc trò chuyện đã bị khoá (chỉ đọc).")}</p>
          ) : (
            <div className="flex items-end gap-2 border-t border-slate-100 px-3.5 py-3">
              <textarea
                className="inp flex-1"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t("Nhập tin nhắn…")}
                maxLength={2000}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              />
              <button type="button" className="btn-primary !px-4" disabled={sending || !draft.trim()} onClick={send}>
                {sending ? t("Đang tải…") : t("Gửi")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
