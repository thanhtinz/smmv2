"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { getMyNotifications, markAllMyNotificationsRead, type BellItem } from "@/app/actions/notifications";
import { useLang } from "@/components/lang";

function fmtTime(iso: string) {
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
      hour12: false, timeZone: "Asia/Ho_Chi_Minh",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

/** Chuông thông báo: badge số chưa đọc + dropdown danh sách; mở chuông là đánh dấu đã đọc.
 *  Tự làm mới mỗi 45 giây và khi quay lại tab. Đặt được ở mọi header (khu khách + trang chủ). */
export function NotificationBell({ tone = "light" }: { tone?: "light" | "dark" }) {
  const { t } = useLang();
  const router = useRouter();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; mobile: boolean } | null>(null);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<BellItem[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await getMyNotifications();
      setUnread(d.unread);
      setItems(d.items);
    } catch {}
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, 45000);
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onResize = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("resize", onResize); };
  }, [open ]);

  const toggle = () => {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 8, right: Math.max(12, window.innerWidth - r.right), mobile: window.innerWidth < 480 });
    setOpen(true);
    if (unread > 0) {
      setUnread(0);
      setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      void markAllMyNotificationsRead();
    }
  };

  const go = (item: BellItem) => {
    setOpen(false);
    if (item.link) router.push(item.link);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={t("Thông báo")}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${tone === "dark" ? "text-white hover:bg-white/10" : "text-slate-600 hover:bg-slate-100"}`}
      >
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[95]" onClick={() => setOpen(false)} />
          <div
            className="card fixed z-[100] overflow-hidden !p-0 shadow-2xl"
            style={pos.mobile
              ? { top: pos.top, left: 12, right: 12 }
              : { top: pos.top, right: pos.right, width: "min(360px, calc(100vw - 24px))" }}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-bold text-slate-900">{t("Thông báo")}</span>
              <button type="button" className="text-xs font-semibold text-brand-600 hover:underline" onClick={() => { setOpen(false); router.push("/dashboard/thong-bao"); }}>
                {t("Xem tất cả")}
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">{t("Chưa có thông báo nào")}</div>
              ) : (
                items.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => go(n)}
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-500/10"
                  >
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-slate-300" : "bg-brand-500"}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block truncate text-sm text-slate-800 ${n.read ? "font-medium" : "font-bold"}`}>{n.title}</span>
                      <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-slate-500">{n.body}</span>
                      <span className="mt-1 block text-[11px] text-slate-400">{fmtTime(n.at)}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
