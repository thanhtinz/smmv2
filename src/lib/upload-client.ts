"use client";

/* Gọi endpoint tải ảnh dùng chung /api/admin/upload (đợt watermark
   2026-11-08). stamp=false dành cho logo/favicon (dấu hiệu thương hiệu —
   không đóng dấu). Trả về URL /media/<id> + cờ stamped. */
export async function uploadImageFile(file: File, stamp: boolean): Promise<{ url: string; stamped: boolean }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("stamp", stamp ? "1" : "0");
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.ok) throw new Error(j?.error || "Tải ảnh thất bại.");
  return { url: j.url as string, stamped: !!j.stamped };
}
