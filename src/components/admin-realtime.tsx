"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useLang } from "@/components/lang";

type RtEvent = { id: string; kind: string; title: string; body: string; link: string; at: string };
type Feed = { counts: { total: number; depPending: number; smmManual: number; prePending: number; ticketOpen: number }; events: RtEvent[] };

const KIND_STYLE: Record<string, { dot: string; ring: string; label: string }> = {
  smm: { dot: "bg-sky-500", ring: "border-sky-200 bg-sky-50", label: "SMM" },
  premium: { dot: "bg-violet-500", ring: "border-violet-200 bg-violet-50", label: "Premium" },
  deposit: { dot: "bg-emerald-500", ring: "border-emerald-200 bg-emerald-50", label: "Nạp tiền" },
  ticket: { dot: "bg-rose-500", ring: "border-rose-200 bg-rose-50", label: "Ticket" },
  user: { dot: "bg-amber-500", ring: "border-amber-200 bg-amber-50", label: "Khách mới" },
  risk: { dot: "bg-red-600", ring: "border-red-200 bg-red-50", label: "Rủi ro" },
};

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

function splitId(id: string): [string, number] {
  const i = id.lastIndexOf("-");
  return [id.slice(0, i), parseInt(id.slice(i + 1)) || 0];
}

/** Chuông thông báo realtime cho Admin (web mẹ + panel con): tự poll máy chủ,
 *  có tin mới (đơn / nạp / ticket / khách mới / rủi ro) là bật toast + kêu bíp. */
export default function AdminRealtime({ endpoint, suffix }: { endpoint: string; suffix: string }) {
  const { t, td } = useLang();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<RtEvent[]>([]);
  const [sound, setSound] = useState(true);
  const seenRef = useRef<Record<string, number> | null>(null);
  const interactedRef = useRef(false);
  const soundRef = useRef(true);

  const seenKey = `rt-seen-${suffix}`;
  const soundKey = `rt-sound-${suffix}`;

  const beep = useCallback(() => {
    if (!soundRef.current || !interactedRef.current) return;
    try {
      const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [0, 0.18].forEach((delay) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880;
        const t = ctx.currentTime + delay;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
        o.start(t); o.stop(t + 0.16);
      });
      setTimeout(() => ctx.close().catch(() => {}), 700);
    } catch {}
  }, []);

  const poll = useCallback(async () => {
    try {
      const r = await fetch(endpoint, { cache: "no-store" });
      if (!r.ok) return;
      const data: Feed = await r.json();
      setFeed(data);
      if (seenRef.current === null) {
        try {
          const raw = localStorage.getItem(seenKey);
          seenRef.current = raw ? JSON.parse(raw) : {};
        } catch { seenRef.current = {}; }
      }
      const seen = seenRef.current!;
      const fresh: RtEvent[] = [];
      for (const ev of data.events) {
        const [kind, num] = splitId(ev.id);
        const prev = seen[kind] || 0;
        if (num > prev) {
          if (prev > 0) fresh.push(ev); // prev = 0 nghĩa là lần chạy đầu — chỉ ghi mốc, không dội toast
          seen[kind] = num;
        }
      }
      try { localStorage.setItem(seenKey, JSON.stringify(seen)); } catch {}
      if (fresh.length) {
        beep();
        setToasts((t) => [...fresh.slice(0, 3), ...t].slice(0, 4));
        for (const ev of fresh.slice(0, 3)) {
          setTimeout(() => setToasts((t) => t.filter((x) => x.id !== ev.id)), 9000);
        }
      }
    } catch {}
  }, [endpoint, seenKey, beep]);

  useEffect(() => {
    try { const s = localStorage.getItem(soundKey); if (s === "0") { setSound(false); soundRef.current = false; } } catch {}
    const mark = () => { interactedRef.current = true; };
    window.addEventListener("pointerdown", mark, { once: true });
    poll();
    const iv = setInterval(poll, 12000);
    const vis = () => { if (document.visibilityState === "visible") poll(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pointerdown", mark); };
  }, [poll, soundKey]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next); soundRef.current = next;
    try { localStorage.setItem(soundKey, next ? "1" : "0"); } catch {}
  };

  const total = feed?.counts.total || 0;
  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          title={t("Thông báo realtime")}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-white" title={t("Đang theo dõi trực tiếp")} />
          {total > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-gradient-to-r from-rose-500 to-red-500 px-1 text-center text-[10px] font-bold leading-[18px] text-white shadow">{total}</span>}
        </button>
        {open && (
          <div className="absolute right-0 top-12 z-50 w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-100 bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-3 text-white">
              <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" /></span>
              <span className="text-sm font-bold">{t("Thông báo realtime")}</span>
              <button type="button" onClick={toggleSound} className="ml-auto rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold hover:bg-white/25">
                {sound ? t("Âm thanh: Bật") : t("Âm thanh: Tắt")}
              </button>
            </div>
            {feed && (
              <div className="flex flex-wrap gap-1.5 border-b border-slate-100 px-4 py-2.5 text-[11px] font-semibold">
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">{`${feed.counts.depPending} ${t("nạp chờ duyệt")}`}</span>
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-sky-800">{`${feed.counts.smmManual} ${t("đơn thủ công")}`}</span>
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-violet-800">{`${feed.counts.prePending} ${t("Premium chờ")}`}</span>
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-rose-800">{`${feed.counts.ticketOpen} ${t("ticket mở")}`}</span>
              </div>
            )}
            <div className="max-h-[380px] overflow-y-auto">
              {(feed?.events || []).map((ev) => {
                const st = KIND_STYLE[ev.kind] || KIND_STYLE.smm;
                return (
                  <Link key={ev.id} href={ev.link} onClick={() => setOpen(false)} className="flex gap-3 border-b border-slate-50 px-4 py-3 transition hover:bg-slate-50">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800">{ev.title}</span>
                      <span className="block truncate text-xs text-slate-500">{ev.body}</span>
                      <span className="mt-0.5 block text-[11px] text-slate-400">{t(st.label)} · {td(ago(ev.at))}</span>
                    </span>
                  </Link>
                );
              })}
              {feed && feed.events.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">{t("Chưa có sự kiện nào")}</p>}
              {!feed && <p className="px-4 py-6 text-center text-sm text-slate-400">{t("Đang kết nối...")}</p>}
            </div>
          </div>
        )}
      </div>
      <div className="pointer-events-none fixed bottom-5 right-5 z-[90] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((ev) => {
          const st = KIND_STYLE[ev.kind] || KIND_STYLE.smm;
          return (
            <div key={ev.id} className={`pointer-events-auto flex gap-3 rounded-2xl border bg-white p-3.5 shadow-2xl ${st.ring}`}>
              <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${st.dot}`} />
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { window.location.href = ev.link; }}>
                <span className="block truncate text-sm font-bold text-slate-900">{ev.title}</span>
                <span className="block truncate text-xs text-slate-500">{ev.body}</span>
              </button>
              <button type="button" aria-label={t("Đóng")} className="shrink-0 text-slate-400 hover:text-slate-600" onClick={() => setToasts((tst) => tst.filter((x) => x.id !== ev.id))}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
