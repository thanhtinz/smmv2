import { getActiveFlashSale } from "@/lib/flash";
import { FlashCountdown } from "@/components/flash-parts";

/** Server wrapper: chỉ render khi site của khách đang có flash sale chạy. */
export async function FlashBanner({ panelId }: { panelId: number | null }) {
  const sale = await getActiveFlashSale(panelId);
  if (!sale) return null;
  return <FlashCountdown name={sale.name} percent={sale.percent} endsAt={sale.endsAt.toISOString()} />;
}
