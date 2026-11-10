"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";

const OPEN_EVENT = "smmv2:open-ticket-form";

/** Nút "Tạo ticket hỗ trợ" — điểm vào tạo ticket DUY NHẤT trên trang Hỗ trợ
 *  (lệnh Tín 2026-11-09 19:40: bỏ cảnh 2 nút + 1 form hiện sẵn, dư thừa).
 *  Bấm nút này là mở form tạo (gói trong TicketFormReveal ở cuối trang) và
 *  cuộn xuống đúng form. */
export function CreateTicketButton({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        window.dispatchEvent(new Event(OPEN_EVENT));
        if (window.location.hash !== "#tao-ticket") window.location.hash = "tao-ticket";
      }}
    >
      {children}
    </button>
  );
}

/** Khung chứa form tạo ticket: MẶC ĐỊNH ẨN, chỉ hiện khi —
 *  (1) bấm nút CreateTicketButton ở cột phụ, (2) mở trang kèm neo #tao-ticket
 *  (link từ footer/trang khác), (3) server truyền defaultOpen=true vì URL có
 *  sẵn tham số điền trước subject/category/body (luồng Báo lỗi đơn / Yêu cầu
 *  hoàn tiền từ chi tiết đơn — phải thấy form mở sẵn kèm nội dung đã điền).
 *  id="tao-ticket" nằm ở div này để mọi neo #tao-ticket cũ vẫn đáp đúng chỗ. */
export function TicketFormReveal({ defaultOpen, children }: { defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const ref = useRef<HTMLDivElement>(null);
  const needScroll = useRef(false);

  useEffect(() => {
    const openNow = (scroll: boolean) => {
      needScroll.current = scroll;
      setOpen(true);
    };
    if (window.location.hash === "#tao-ticket") openNow(false);
    const onHash = () => { if (window.location.hash === "#tao-ticket") openNow(true); };
    const onEvent = () => openNow(true);
    window.addEventListener("hashchange", onHash);
    window.addEventListener(OPEN_EVENT, onEvent);
    return () => {
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener(OPEN_EVENT, onEvent);
    };
  }, []);

  useEffect(() => {
    if (open && needScroll.current) {
      needScroll.current = false;
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [open ]);

  return (
    <div id="tao-ticket" ref={ref} className="scroll-mt-24">
      {open ? children : null}
    </div>
  );
}
