import sharp from "sharp";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

/* Pipeline ảnh tải lên DÙNG CHUNG (đợt watermark 2026-11-08):
   - Ảnh vào -> chuẩn hoá bằng sharp (xoay theo EXIF, thu về tối đa
     1920px bề ngang) -> lưu bản gốc vào MediaAsset (DB — bền trên cả
     Vercel lẫn VPS, không phụ thuộc đĩa của máy chủ).
   - Mặt cần bảo vệ (ảnh sản phẩm, banner, ảnh bìa...) có thêm bản
     STAMPED: đóng dấu mờ = tên site (hoặc chữ admin đặt trong Cấu
     hình) lặp chéo khắp ảnh. Mặt công khai chỉ hiển thị bản stamped
     qua route /media/<id>; bản gốc chỉ admin đã đăng nhập mới xem
     được (?o=1). Logo/favicon là dấu hiệu thương hiệu — tải với
     stamp=false nên không có bản stamped.
   Đây là biện pháp NGĂN CHẶN sao chép thông thường (chặn chuột phải/
   kéo thả ở phía hiển thị + không lộ đường dẫn tĩnh), không phải
   bảo vệ tuyệt đối — ai quyết tâm vẫn chụp màn hình được. */

const MAX_W = 1920;

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** SVG dấu mờ lặp chéo khắp khung ảnh (chuẩn cho ảnh sản phẩm/banner). */
function watermarkSvg(w: number, h: number, text: string, opacityPct: number) {
  const font = Math.max(18, Math.min(46, Math.round(w / 22)));
  const stepX = font * 11;
  const stepY = font * 5.2;
  const o = Math.max(0.05, Math.min(0.8, opacityPct / 100));
  const parts: string[] = [];
  let row = 0;
  for (let y = -stepY; y < h + stepY; y += stepY, row++) {
    for (let x = -stepX; x < w + stepX; x += stepX) {
      const tx = x + (row % 2 ? stepX / 2 : 0);
      parts.push(`<text x="${tx.toFixed(0)}" y="${y.toFixed(0)}" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="${font}" fill="#ffffff" fill-opacity="${o.toFixed(2)}" stroke="#000000" stroke-opacity="${(o * 0.45).toFixed(2)}" stroke-width="0.7">${escapeXml(text)}</text>`);
    }
  }
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><g transform="rotate(-24 ${w / 2} ${h / 2})">${parts.join("")}</g></svg>`);
}

export type StoredMedia = { id: number; url: string; stamped: boolean };

/** Chuẩn hoá + (tuỳ chọn) đóng dấu + lưu DB. Trả về URL công khai /media/<id>. */
export async function storeUploadedImage(buf: Buffer, stamp: boolean): Promise<StoredMedia> {
  const meta = await sharp(buf).metadata();
  const fmt = String(meta.format || "");
  if (!["jpeg", "png", "webp", "gif", "avif"].includes(fmt)) {
    throw new Error("Chỉ chấp nhận ảnh JPG, PNG, WebP, GIF hoặc AVIF.");
  }
  // Bản gốc chuẩn hoá: xoay EXIF + cap 1920px, giữ định dạng (gif giữ nguyên
  // không qua xử lý để không mất hoạt ảnh — nhưng cũng không đóng dấu được).
  let original: Buffer;
  let mime: string;
  if (fmt === "gif") {
    original = buf;
    mime = "image/gif";
  } else {
    const pipe = sharp(buf).rotate().resize({ width: MAX_W, withoutEnlargement: true });
    if (fmt === "png") { original = await pipe.png().toBuffer(); mime = "image/png"; }
    else if (fmt === "webp") { original = await pipe.webp({ quality: 88 }).toBuffer(); mime = "image/webp"; }
    else if (fmt === "avif") { original = await pipe.avif({ quality: 80 }).toBuffer(); mime = "image/avif"; }
    else { original = await pipe.jpeg({ quality: 88 }).toBuffer(); mime = "image/jpeg"; }
  }

  let stampedBuf: Buffer | null = null;
  if (stamp && fmt !== "gif") {
    const s = await getSettings();
    if (String(s.watermark_enabled ?? "1") === "1") {
      const text = (String(s.watermark_text || "").trim() || String(s.site_name || "SMMv2")).slice(0, 60);
      const opacity = Number(s.watermark_opacity ?? 35) || 35;
      const m2 = await sharp(original).metadata();
      const w = m2.width || 800;
      const h = m2.height || 600;
      stampedBuf = await sharp(original)
        .composite([{ input: watermarkSvg(w, h, text, opacity), top: 0, left: 0 }])
        .jpeg({ quality: 85 })
        .toBuffer();
    }
  }

  const row = await prisma.mediaAsset.create({
    data: { mime, original, stamped: stampedBuf },
    select: { id: true },
  });
  return { id: row.id, url: `/media/${row.id}`, stamped: !!stampedBuf };
}
