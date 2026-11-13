"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";

export type StripTile = { href: string; label: string; img: string };

/** Dải icon lối tắt NGAY DƯỚI hero trang chủ (lệnh Tín 2026-11-08 21:08 +
 *  đính chính 21:10/21:14): hàng ô icon bo góc + nhãn bên dưới, đặt trên nền
 *  THƯỜNG của trang chủ (không dải nền màu, nhãn chữ tối như chữ thường) —
 *  cấu trúc theo ảnh mẫu Tín gửi. Danh sách ô do page.tsx (server) dựng:
 *  nhãn qua từ điển, ẩn/hiện THEO ĐÚNG điều kiện của buildCustomerNav
 *  (telegram_enabled; Steam, Game Key, Gift Card, Top-Up luôn
 *  hiện như nhóm menu tương ứng; ô "Tất cả sản phẩm" đã bỏ khỏi dải theo
 *  lệnh Tín 2026-11-08 21:42).
 *  Mobile: hàng vuốt ngang — VỪA KÉO VỪA BẤM được: kéo quá ngưỡng 6px
 *  (chuột kéo tay, cảm ứng cuộn native) thì click bị chặn ở capture nên
 *  không bao giờ điều hướng nhầm; chạm sạch luôn điều hướng. Ảnh icon là
 *  tranh vuông bo góc trên nền trắng — render object-cover + phóng 1.15
 *  trong ô overflow-hidden bo góc để góc trắng không lọt ra ngoài.
 *  Nút cuộn hai đầu (bổ sung 2026-11-08): chỗ nào hàng còn tràn (mobile)
 *  thì có thêm hai nút chevron tròn 40px ở hai đầu bấm để cuộn từng bước —
 *  cùng mẫu với PillStrip; nút mờ + khóa ở đầu đã chạm, desktop hàng vừa
 *  đủ 8 ô thì không hiện nút. Nút là anh em flex của hàng cuộn (không đè
 *  lên ô đầu/cuối) và nằm NGOÀI vùng kéo nên không chạm vào logic
 *  kéo/bấm của các ô. */
export function HomeStripRow({ tiles }: { tiles: StripTile[] }) {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);
  const [canL, setCanL] = useState(false);
  const [canR, setCanR] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      setScrollable(el.scrollWidth > el.clientWidth + 4);
      setCanL(el.scrollLeft > 4);
      setCanR(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, []);
  const scrollStep = (d: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: d * el.clientWidth * 0.8, behavior: "smooth" });
  };
  const drag = useRef({ down: false, x: 0, sl: 0, moved: false });
  // Mốc chặn click sau khi kéo: CHỈ có hạn 500ms. Sau cuộn cảm ứng, trình
  // duyệt thường tự nuốt click của chính cử chỉ kéo đó (không bắn click) —
  // nếu cờ chặn treo vô hạn thì cú CHẠM SẠCH tiếp theo bị nuốt oan (lỗi đã
  // bắt được khi kiểm chứng 2026-11-08: kéo xong chạm ô không điều hướng).
  const suppressUntil = useRef(0);
  if (tiles.length === 0) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    drag.current = { down: true, x: e.clientX, sl: el.scrollLeft, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d.down) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 6) d.moved = true;
    // Chuột: kéo tay để cuộn (cảm ứng để cuộn native của trình duyệt lo).
    if (d.moved && e.pointerType === "mouse") el.scrollLeft = d.sl - dx;
  };
  const endDrag = () => {
    const el = ref.current;
    const d = drag.current;
    if (d.down && el && (d.moved || Math.abs(el.scrollLeft - d.sl) > 6)) suppressUntil.current = performance.now() + 500;
    d.down = false;
  };
  const onClickCapture = (e: React.SyntheticEvent) => {
    if (performance.now() < suppressUntil.current) {
      e.preventDefault();
      e.stopPropagation();
      suppressUntil.current = 0;
    }
  };

  const navBtn = "mt-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition hover:bg-slate-50 sm:mt-5";
  return (
    <section data-testid="home-strip" aria-label="Shortcuts" className="mb-2">
      <div className="flex items-start">
        {scrollable && (
          <button type="button" aria-label={t("Trang trước")} onClick={() => scrollStep(-1)} disabled={!canL}
            className={`${navBtn} mr-1 ${canL ? "" : "opacity-30"}`}>
            <span className="rotate-90 [&>svg]:h-5 [&>svg]:w-5">{I.chevron}</span>
          </button>
        )}
        <div
          ref={ref}
          data-strip-scroll
          className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-4 [&::-webkit-scrollbar]:hidden lg:justify-between lg:overflow-visible"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClickCapture={onClickCapture}
        >
          {tiles.map((tile) => (
            <Link
              key={tile.href + tile.label}
              href={tile.href}
              draggable={false}
              className="group flex w-[84px] shrink-0 flex-col items-center gap-2 sm:w-[100px] lg:w-auto lg:flex-1"
            >
              <span className="block h-16 w-16 overflow-hidden rounded-2xl shadow-sm ring-1 ring-slate-900/10 transition group-hover:shadow-md sm:h-20 sm:w-20 lg:h-24 lg:w-24">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={tile.img} alt="" draggable={false} className="h-full w-full scale-[1.15] object-cover" />
              </span>
              <span className="line-clamp-2 w-full text-center text-[13px] font-semibold leading-snug text-slate-700 sm:text-sm">
                {tile.label}
              </span>
            </Link>
          ))}
        </div>
        {scrollable && (
          <button type="button" aria-label={t("Trang sau")} onClick={() => scrollStep(1)} disabled={!canR}
            className={`${navBtn} ml-1 ${canR ? "" : "opacity-30"}`}>
            <span className="-rotate-90 [&>svg]:h-5 [&>svg]:w-5">{I.chevron}</span>
          </button>
        )}
      </div>
    </section>
  );
}
