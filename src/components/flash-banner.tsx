import { getActiveFlashSale, type FlashKind } from "@/lib/flash";
import { FlashCountdown } from "@/components/flash-parts";

/** Server wrapper: chỉ render khi site của khách đang có flash sale chạy.
 *  kind: chỉ hiện banner của đợt có phạm vi bao phủ loại đó (trang SMM dùng
 *  "SMM", trang Premium dùng "PREMIUM"); không truyền kind = đợt % cao nhất
 *  bất kỳ (trang chủ khách). */
export async function FlashBanner({ panelId, kind }: { panelId: number | null; kind?: FlashKind }) {
  const sale = await getActiveFlashSale(panelId, kind);
  if (!sale) return null;
  return <FlashCountdown name={sale.name} percent={sale.percent} endsAt={sale.endsAt.toISOString()} />;
}
