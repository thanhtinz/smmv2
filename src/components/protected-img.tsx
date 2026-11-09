"use client";

import type { ImgHTMLAttributes } from "react";

/* Ảnh hiển thị công khai có NGĂN CHẶN sao chép (đợt watermark 2026-11-08):
   chặn menu chuột phải TRÊN CHÍNH ẢNH NÀY, cấm kéo thả, cấm chọn. Đây là
   biện pháp ngăn chặn thông thường, không phải bảo vệ tuyệt đối. Chỉ
   dùng cho ảnh sản phẩm/banner — KHÔNG áp dụng toàn site. */
export function PImg({ alt = "", ...rest }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img
      {...rest}
      alt={alt}
      draggable={false}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    />
  );
}
