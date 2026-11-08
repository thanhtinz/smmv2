import Link from "next/link";
import { prisma } from "@/lib/db";
import { getServerI18n } from "@/lib/lang-server";
import { Stars } from "@/components/premium-card";
import { PremiumReviewForm, HelpfulButton } from "@/components/premium-review-form";
import { submitPremiumReviewAction, toggleReviewHelpfulAction } from "@/app/actions/user";

/** Che tên người đánh giá kiểu shopkey: "admin" -> "ad***n". */
function maskName(u: string): string {
  if (!u) return "***";
  if (u.length <= 3) return u.charAt(0) + "***";
  return u.slice(0, 2) + "***" + u.slice(-1);
}

/** Khối ĐÁNH GIÁ sản phẩm dùng CHUNG cho mọi trang bán hàng Premium: trang
 *  chi tiết Premium, trang đặt Telegram (theo tab), Steam Top-Up và Steam
 *  Gift Games — cùng MỘT hệ đánh giá PremiumReview sẵn có: tóm tắt điểm +
 *  phân bố sao + danh sách mới nhất + nút Hữu ích + form viết cho khách ĐÃ
 *  MUA (đơn không bị huỷ/hoàn tiền), mỗi khách 1 đánh giá/sản phẩm, gửi qua
 *  đúng submitPremiumReviewAction (action tự kiểm tra lại quyền mua).
 *  returnTo = trang sẽ quay lại sau khi gửi (phải nằm trong whitelist của
 *  action). userId null = khách chưa đăng nhập (chỉ xem + mời đăng nhập). */
export async function ProductReviews({ productId, slug, userId, returnTo }: {
  productId: number;
  slug: string;
  userId: number | null;
  returnTo: string;
}) {
  const { L } = await getServerI18n();
  const product = await prisma.premiumProduct.findUnique({
    where: { id: productId },
    select: { id: true, variants: { select: { id: true } } },
  });
  if (!product) return null;
  const variantIds = product.variants.map((v) => v.id);
  const [reviewAgg, reviewDist, reviewList] = await Promise.all([
    prisma.premiumReview.aggregate({ where: { productId }, _avg: { rating: true }, _count: true }),
    prisma.premiumReview.groupBy({ by: ["rating"], where: { productId }, _count: true }),
    prisma.premiumReview.findMany({ where: { productId }, orderBy: { createdAt: "desc" }, take: 10, include: { user: { select: { username: true } } } }),
  ]);
  const reviewAvg = reviewAgg._avg.rating || 0;
  const reviewCount = reviewAgg._count || 0;
  const distMap = new Map(reviewDist.map((r) => [r.rating, typeof r._count === "number" ? r._count : 0]));
  const myPurchase = userId
    ? await prisma.premiumOrder.findFirst({ where: { userId, variantId: { in: variantIds }, status: { notIn: ["CANCELED", "REFUNDED"] } }, select: { id: true } })
    : null;
  const myReview = userId
    ? await prisma.premiumReview.findUnique({ where: { productId_userId: { productId, userId } }, select: { rating: true, content: true } })
    : null;
  const reviewerIds = Array.from(new Set(reviewList.map((r) => r.userId)));
  const reviewerOrders = reviewerIds.length
    ? await prisma.premiumOrder.findMany({ where: { userId: { in: reviewerIds }, variantId: { in: variantIds }, status: { notIn: ["CANCELED", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, select: { userId: true, variant: { select: { name: true } } } })
    : [];
  const variantByUser = new Map<number, string>();
  for (const o of reviewerOrders) if (!variantByUser.has(o.userId)) variantByUser.set(o.userId, o.variant.name);
  const helpfulRows = reviewList.length
    ? await prisma.premiumReviewHelpful.groupBy({ by: ["reviewId"], where: { reviewId: { in: reviewList.map((r) => r.id) } }, _count: true })
    : [];
  const helpfulMap = new Map(helpfulRows.map((r) => [r.reviewId, typeof r._count === "number" ? r._count : 0]));
  const myHelpful = userId && reviewList.length
    ? new Set((await prisma.premiumReviewHelpful.findMany({ where: { userId, reviewId: { in: reviewList.map((r) => r.id) } }, select: { reviewId: true } })).map((x) => x.reviewId))
    : new Set<number>();

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#f59e0b"><path d="M12 3.5l2.55 5.37 5.9.72-4.34 4.06 1.1 5.83L12 16.9l-5.21 2.58 1.1-5.83L3.55 9.59l5.9-.72L12 3.5z" /></svg>
        <h2 className="text-base font-extrabold text-slate-900">{L("Đánh giá sản phẩm")}</h2>
        <span className="ml-auto rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{reviewCount}{L(" đánh giá")}</span>
      </div>
      <div className="mt-5 grid grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)]">
        <div className="text-center">
          {reviewCount > 0 ? (
            <>
              <div className="text-[40px] font-black leading-none text-slate-900">{reviewAvg.toFixed(1)}</div>
              <div className="mt-2.5 flex justify-center"><Stars value={reviewAvg} className="h-5 w-5" /></div>
              <div className="mt-2 text-[13px] text-slate-500">{reviewCount}{L(" đánh giá")}</div>
            </>
          ) : (
            <>
              <div className="text-lg font-extrabold text-slate-400">{L("Chưa có đánh giá")}</div>
              <div className="mt-2.5 flex justify-center opacity-50"><Stars value={0} className="h-5 w-5" /></div>
              <div className="mt-2 text-[13px] text-slate-500">{L("Chưa có đánh giá nào cho sản phẩm này.")}</div>
            </>
          )}
        </div>
        <div className="space-y-2">
        {[5, 4, 3, 2, 1].map((n) => (
          <div key={n} className="flex items-center gap-2.5 text-[13px] text-slate-600">
            <span className="flex w-8 shrink-0 items-center gap-1 font-semibold">{n}<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="#f59e0b"><path d="M12 3.5l2.55 5.37 5.9.72-4.34 4.06 1.1 5.83L12 16.9l-5.21 2.58 1.1-5.83L3.55 9.59l5.9-.72L12 3.5z" /></svg></span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              <span className="block h-full rounded-full bg-amber-400" style={{ width: `${reviewCount > 0 ? ((distMap.get(n) || 0) / reviewCount) * 100 : 0}%` }} />
            </span>
            <span className="w-5 shrink-0 text-right text-slate-400">{distMap.get(n) || 0}</span>
          </div>
        ))}
        </div>
      </div>
      <div className="mt-6 border-t border-slate-100 pt-2">
        {reviewList.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">{L("Chưa có đánh giá nào cho sản phẩm này.")}</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {reviewList.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500">
                    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z" /></svg>
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-900">{maskName(r.user.username)}</div>
                    <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {L("Đã mua hàng")}
                    </div>
                  </div>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <Stars value={r.rating} className="h-3.5 w-3.5" />
                  <span className="text-xs text-slate-400">{r.createdAt.toLocaleDateString("vi-VN")}</span>
                </div>
                {variantByUser.get(r.userId) && (
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 7h15l-1.5 9h-12L6 7z" /><path d="M6 7L5 3H2" /><circle cx="9" cy="20" r="1.6" /><circle cx="17" cy="20" r="1.6" /></svg>
                    {variantByUser.get(r.userId)}
                  </span>
                )}
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{r.content}</p>
                {userId ? (
                  <HelpfulButton reviewId={r.id} count={helpfulMap.get(r.id) || 0} marked={myHelpful.has(r.id)} action={toggleReviewHelpfulAction} />
                ) : (
                  <Link href="/login" className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700">
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8"><path strokeLinejoin="round" d="M7 22V11L12.5 2.5c1.6 0 2.7 1.2 2.5 2.8L14.3 9H20a2 2 0 0 1 2 2.4l-1.2 8A2 2 0 0 1 18.8 21H7zm0 0H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3" /></svg>
                    {L("Hữu ích")}{(helpfulMap.get(r.id) || 0) > 0 ? ` (${helpfulMap.get(r.id)})` : ""}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-6 border-t border-slate-100 pt-5">
        <div className="text-sm font-extrabold text-slate-900">{myReview ? L("Đánh giá của bạn") : L("Viết đánh giá")}</div>
        {userId && myPurchase ? (
          <PremiumReviewForm slug={slug} returnTo={returnTo} action={submitPremiumReviewAction} mine={myReview} />
        ) : userId ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{L("Chỉ khách đã mua sản phẩm mới được đánh giá.")}</p>
        ) : (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">{L("Chỉ khách đã mua sản phẩm mới được đánh giá.")} <Link href="/login" className="font-bold text-brand-700">{L("Đăng nhập")}</Link></p>
        )}
      </div>
    </div>
  );
}
