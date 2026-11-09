"use client";
import { useEffect, useRef, useState } from "react";
import { I } from "@/components/ui";
import { useLang } from "@/components/lang";

/** Hệ chip trên thẻ catalog theo ảnh mẫu FZR của chủ site (2026-11-08):
 *  - Chip FILE (mọi khu có ghi chú nguồn): bấm mở popover trắng chứa văn
 *    bản info/note THẬT phía nhà cung cấp (manual `info`, giftcards +
 *    topups `note` — đồng bộ lưu vào description của sản phẩm). Trang chỉ
 *    hiện đúng văn bản nguồn, không tự chế nội dung.
 *  - Chip LOẠI GIAO (chỉ Manual Services): tooltip tối nêu loại thực hiện
 *    theo `kind` của category phía NCC — replenishment (có fields cho
 *    khách điền) hay chuyển vật phẩm. API chỉ tài liệu hoá GIÁ TRỊ kind
 *    (order trả kind manual_transfer / manual_replenishment), câu giải
 *    thích là câu chữ giao diện của site bám theo đúng giá trị đó.
 *  Popover/tooltip dùng position:fixed đo từ vị trí chip (thẻ catalog có
 *  overflow-hidden + nằm trong Link — absolute sẽ bị cắt hoặc bấm chip sẽ
 *  chuyển trang; click luôn preventDefault + stopPropagation). */

type Anchor = { top: number; left: number };

function usePopover() {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<Anchor>({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setAnchor({ top: r.bottom + 8, left: r.left });
    }
    setOpen((v) => !v);
  };
  useEffect(() => {
    if (!open) return;
    const onDown = (ev: PointerEvent) => {
      if (popRef.current?.contains(ev.target as Node) || btnRef.current?.contains(ev.target as Node)) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => { if (ev.key === "Escape") setOpen(false); };
    const onScroll = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open ]);
  return { open, anchor, btnRef, popRef, toggle };
}

const clampLeft = (left: number, width: number) =>
  Math.max(8, Math.min(left, (typeof window !== "undefined" ? window.innerWidth : 1200) - width - 8));

/** Chip file: mở popover chứa info/note của nhà cung cấp. Chỉ render khi
 *  sản phẩm CÓ văn bản nguồn — không có thì không chip (chip mở ra rỗng
 *  là vô nghĩa). */
export function InfoChip({ text }: { text: string }) {
  const { open, anchor, btnRef, popRef, toggle } = usePopover();
  const W = 320;
  if (!text.trim()) return null;
  return (
    <>
      <button
        ref={btnRef} type="button" onClick={toggle} aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white/95 text-slate-700 shadow-sm transition hover:bg-white [&>svg]:h-[18px] [&>svg]:w-[18px]"
      >
        {I.file}
      </button>
      {open && (
        <div
          ref={popRef}
          style={{ top: anchor.top, left: clampLeft(anchor.left, W), width: W }}
          className="fixed z-40 max-w-[calc(100vw-16px)] rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <p className="whitespace-pre-line text-sm font-medium leading-relaxed text-slate-800">{text}</p>
        </div>
      )}
    </>
  );
}

/** Ánh xạ kind của NCC -> tiêu đề + câu giải thích của tooltip. Giá trị
 *  kind là dữ liệu thật phía FZR (category.kind); hai họ đã tài liệu hoá:
 *  replenishment và chuyển vật phẩm (mọi kind còn lại). */
export function kindTooltip(kind: string, t: (s: string) => string): { title: string; body: string } {
  if (/replenish/i.test(kind)) {
    return {
      title: t("Nạp bổ sung"),
      body: t("Nhà cung cấp sẽ nạp vật phẩm vào tài khoản của bạn theo thông tin bạn cung cấp khi đặt đơn."),
    };
  }
  return {
    title: t("Chuyển vật phẩm"),
    body: t("Nhà cung cấp sẽ chuyển vật phẩm trong đơn cho bạn."),
  };
}

/** Chip loại giao (chỉ thẻ Manual Services có kind từ NCC). */
export function KindChip({ kind }: { kind: string }) {
  const { t } = useLang();
  const { open, anchor, btnRef, popRef, toggle } = usePopover();
  const W = 300;
  if (!kind.trim()) return null;
  const tip = kindTooltip(kind, t);
  return (
    <>
      <button
        ref={btnRef} type="button" onClick={toggle} aria-expanded={open}
        className="flex h-9 w-9 items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50/95 text-emerald-700 shadow-sm transition hover:bg-emerald-50 [&>svg]:h-[18px] [&>svg]:w-[18px]"
      >
        {I.box}
      </button>
      {open && (
        <div
          ref={popRef}
          style={{ top: anchor.top, left: clampLeft(anchor.left, W), width: W }}
          className="fixed z-40 max-w-[calc(100vw-16px)] rounded-2xl bg-slate-900 p-4 shadow-xl"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <p className="text-sm leading-relaxed text-white"><span className="font-bold">{tip.title}:</span> {tip.body}</p>
        </div>
      )}
    </>
  );
}
