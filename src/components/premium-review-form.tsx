"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/** Form đánh giá sản phẩm Premium — chọn sao tương tác + nhận xét.
 *  Chỉ render cho khách đã mua (trang chi tiết kiểm tra phía server). */
export function PremiumReviewForm({ slug, returnTo, action, mine }: {
  slug: string;
  returnTo: string;
  action: (formData: FormData) => void;
  mine?: { rating: number; content: string } | null;
}) {
  const [rating, setRating] = useState(mine?.rating || 5);
  const [hover, setHover] = useState(0);
  const shown = hover || rating;
  return (
    <form action={action} className="mt-4">
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`${n} sao`} onClick={() => setRating(n)} onMouseEnter={() => setHover(n)} className="p-0.5">
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill={n <= shown ? "#f59e0b" : "none"} stroke="#f59e0b" strokeWidth="1.6">
              <path strokeLinejoin="round" d="M12 3.5l2.55 5.37 5.9.72-4.34 4.06 1.1 5.83L12 16.9l-5.21 2.58 1.1-5.83L3.55 9.59l5.9-.72L12 3.5z" />
            </svg>
          </button>
        ))}
        <span className="ml-2 text-sm font-bold text-slate-700">{rating}/5</span>
      </div>
      <textarea className="inp mt-3" name="content" rows={3} maxLength={1000} required minLength={3} defaultValue={mine?.content || ""} placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm..." />
      <button className="btn-primary mt-3">{mine ? "Cập nhật đánh giá" : "Gửi đánh giá"}</button>
    </form>
  );
}

/** Nút "Hữu ích" dưới mỗi đánh giá — bấm để đánh dấu/bỏ, cập nhật số ngay. */
export function HelpfulButton({ reviewId, count, marked, action }: {
  reviewId: number;
  count: number;
  marked: boolean;
  action: (reviewId: number) => Promise<void>;
}) {
  const [n, setN] = useState(count);
  const [on, setOn] = useState(marked);
  const [, startTransition] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        setOn(!on);
        setN((x) => x + (on ? -1 : 1));
        startTransition(async () => {
          await action(reviewId);
          router.refresh();
        });
      }}
      className={`mt-2.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? "border-brand-300 bg-brand-50 text-brand-700" : "border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700"}`}
    >
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8">
        <path strokeLinejoin="round" d="M7 22V11L12.5 2.5c1.6 0 2.7 1.2 2.5 2.8L14.3 9H20a2 2 0 0 1 2 2.4l-1.2 8A2 2 0 0 1 18.8 21H7zm0 0H4a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1h3" />
      </svg>
      Hữu ích{n > 0 ? ` (${n})` : ""}
    </button>
  );
}
