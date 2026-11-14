/**
 * Đọc body request có GIỚI HẠN BYTE CỨNG (full-audit 6750109 P3-02).
 * Các endpoint công khai (webhook) trước đây gọi req.text()/req.json()
 * không giới hạn TRƯỚC khi xác thực chữ ký — một body khổng lồ buộc
 * server nạp hết vào RAM rồi mới bị từ chối. Hàm này: từ chối ngay từ
 * Content-Length nếu khai báo vượt cap; với body chunked thì đọc theo
 * stream và HUỶ stream ngay khi vượt cap. Trả null khi vượt cap —
 * nơi gọi phải trả HTTP 413 và không parse/không ghi DB.
 */
export const PUBLIC_BODY_CAP = 64 * 1024;

export async function readBodyCapped(req: Request, cap: number = PUBLIC_BODY_CAP): Promise<string | null> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > cap) return null;
  if (!req.body) {
    return await req.text().catch(() => "");
  }
  const reader = (req.body as ReadableStream<Uint8Array>).getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}
