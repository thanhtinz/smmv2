import { getSettings } from "./settings";
import type { Provider } from "@prisma/client";

/** Markup theo NHÓM FZR. Mỗi nhóm sản phẩm FZR có thể có một markup %
 *  riêng do admin đặt trong form nhà cung cấp FZR — cùng chỗ với API key,
 *  tỉ giá và markup chung — lưu ở Setting `fzr_markup_<group>`. Chưa đặt
 *  (hoặc để trống) thì dùng markupPercent chung của nhà cung cấp. Mọi
 *  đường tính giá của nhóm (đồng bộ catalog, báo giá tươi Stars/Steam
 *  gift, giá hiển thị Telegram) đều đọc qua đây để % cấu hình ở nhà cung
 *  cấp là % thật sự tính tiền. */
export const fzrMarkupKey = (group: string) => `fzr_markup_${group}`;

function parseOverride(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const n = parseInt(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.min(1000, n);
}

/** Markup hiệu lực cho một nhóm của một nhà cung cấp. */
export async function fzrMarkupFor(provider: Provider, group: string): Promise<number> {
  const s = await getSettings();
  return parseOverride(s[fzrMarkupKey(group)]) ?? provider.markupPercent;
}

/** Resolver đọc settings MỘT lần cho cả đợt đồng bộ (sync gọi theo từng
 *  item nên không đọc DB lặp). */
export async function fzrMarkupResolver(provider: Provider): Promise<(group: string) => number> {
  const s = await getSettings();
  return (group: string) => parseOverride(s[fzrMarkupKey(group)]) ?? provider.markupPercent;
}
