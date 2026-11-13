"use client";
import { useEffect } from "react";

/** Bắt tham số ?aff= / ?ref= trên MỌI trang: gửi về /api/aff/click để máy chủ
 *  đặt cookie giới thiệu (first-touch 30 ngày) + đếm lượt click cho người
 *  giới thiệu. Chạy 1 lần khi trang tải; im lặng tuyệt đối khi lỗi. */
export function AffTracker() {
  useEffect(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const code = (sp.get("aff") || sp.get("ref") || "").trim();
      if (!code) return;
      fetch("/api/aff/click", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
        keepalive: true,
      }).catch(() => {});
    } catch {}
  }, []);
  return null;
}
