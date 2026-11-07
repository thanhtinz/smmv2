/** Đính kèm ảnh ticket: lưu JSON mảng data-URL trong TicketMessage.attachments.
 *  Validate phía server: chỉ data:image/*, mỗi ảnh ≤ ~950KB, tối đa 3 ảnh/tin. */
export function parseAttachments(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x) => typeof x === "string" && x.startsWith("data:image/") && x.length <= 1000 * 1024).slice(0, 3);
  } catch {
    return [];
  }
}

export function cleanAttachments(raw: FormDataEntryValue | string | null | undefined): string | null {
  if (!raw || typeof raw !== "string" || !raw.trim()) return null;
  const imgs = parseAttachments(raw);
  return imgs.length ? JSON.stringify(imgs) : null;
}
