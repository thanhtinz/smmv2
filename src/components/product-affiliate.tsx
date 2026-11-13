"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { I, HeartIcon } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { ShareRow } from "@/components/share-row";
import { useLang } from "@/components/lang";

export const PREMIUM_FAV_KEY = "smmv2-premium-fav-v1";

function readPremiumFavs(): string[] {
  try { const v = JSON.parse(localStorage.getItem(PREMIUM_FAV_KEY) || "[]"); return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []; } catch { return []; }
}

/** Cặp nút ở góc phải hero trang chi tiết Premium (mẫu shopkey Tín gửi
 *  2026-11-12): nút KIẾM TIỀN (huy hiệu % = affiliate_percent admin đang
 *  cấu hình, mở hộp "Chia sẻ kiếm tiền") + nút YÊU THÍCH (tim, lưu
 *  localStorage như các khu Game Key/Top-Up). Nút kiếm tiền chỉ hiện khi
 *  chương trình giới thiệu đang bật và % > 0. Khách chưa đăng nhập vẫn mở
 *  hộp được để xem hoa hồng dự kiến, phần link cá nhân thay bằng lời mời
 *  đăng nhập (link phải gắn mã của từng tài khoản). */
export function ProductAffiliate({ slug, productName, pct, affLink, loggedIn, enrolled, variants }: {
  slug: string;
  productName: string;
  pct: number;
  affLink: string | null;
  loggedIn: boolean;
  enrolled: boolean;
  variants: { name: string; price: number }[];
}) {
  const { t, m } = useLang();
  const [open, setOpen] = useState(false);
  const [fav, setFav] = useState(false);
  useEffect(() => { setFav(readPremiumFavs().includes(slug)); }, [slug]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open ]);

  const toggleFav = () => {
    const ids = readPremiumFavs();
    const next = ids.includes(slug) ? ids.filter((x) => x !== slug) : [...ids, slug];
    try { localStorage.setItem(PREMIUM_FAV_KEY, JSON.stringify(next)); } catch {}
    setFav(next.includes(slug));
  };
  const shareText = `${productName} — ${t("mua qua link của tôi")}`;

  return (
    <div className="flex shrink-0 items-start gap-2.5">
      {pct > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t("Kiếm tiền")}
          title={t("Chia sẻ kiếm tiền")}
          className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/40 bg-white/15 text-white transition hover:bg-white/25 [&>svg]:h-6 [&>svg]:w-6"
        >
          {I.handCoin}
          <span className="absolute -right-2 -top-2 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[11px] font-extrabold leading-none text-white shadow">{pct}%</span>
        </button>
      )}
      <button
        type="button"
        onClick={toggleFav}
        aria-label={t("Yêu thích")}
        title={t("Yêu thích")}
        className={`flex h-12 w-12 items-center justify-center rounded-2xl transition ${fav ? "bg-rose-600 text-white shadow-lg hover:bg-rose-500" : "border border-white/40 bg-white/15 text-white hover:bg-white/25"}`}
      >
        <HeartIcon filled={fav} size={22} />
      </button>

      {open && pct > 0 && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={t("Chia sẻ kiếm tiền")}>
          <div className="absolute inset-0 bg-slate-950/55" onClick={() => setOpen(false)} />
          <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white text-slate-900 shadow-2xl sm:rounded-3xl">
            <div className="flex items-center gap-3 bg-gradient-to-r from-emerald-600 to-teal-500 px-5 py-4 text-white">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 [&>svg]:h-6 [&>svg]:w-6">{I.handCoin}</span>
              <span className="flex-1 text-lg font-extrabold">{t("Chia sẻ kiếm tiền")}</span>
              <button type="button" onClick={() => setOpen(false)} aria-label={t("Đóng")} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 transition hover:bg-white/30 [&>svg]:h-[18px] [&>svg]:w-[18px]">{I.x}</button>
            </div>
            <div className="space-y-5 px-5 py-5">
              <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3.5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white [&>svg]:h-5 [&>svg]:w-5">{I.gift}</span>
                <p className="text-[15px] leading-snug text-slate-700">{t("Nhận ngay")} <b className="text-emerald-600">{pct}%</b> {t("hoa hồng khi bạn bè mua hàng qua link của bạn!")}</p>
              </div>

              {loggedIn && !enrolled ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-center">
                  <p className="text-sm font-semibold text-slate-700">{t("Bạn chưa tham gia chương trình giới thiệu bạn bè")}</p>
                  <p className="mt-1 text-[13px] text-slate-500">{t("Tham gia để lấy link giới thiệu và nhận hoa hồng từ mỗi đơn bạn bè mua.")}</p>
                  <Link href="/dashboard/kiem-tien" className="btn-primary mt-3 inline-flex">{t("Đăng ký tham gia")}</Link>
                </div>
              ) : (
              <>
              <div>
                <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-slate-900 [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:text-slate-500">{I.chart}{t("Hoa hồng dự kiến")}</div>
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                  {variants.map((v, i) => (
                    <div key={i} className="flex items-center gap-2 px-4 py-3 text-sm">
                      <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{v.name}</span>
                      <span className="shrink-0 text-slate-500">{m(v.price)}</span>
                      <span className="shrink-0 text-slate-400">→</span>
                      <span className="shrink-0 font-extrabold text-emerald-600">+{m(Math.floor((v.price * pct) / 100))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {loggedIn && affLink ? (
                <>
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-sm font-extrabold text-slate-900 [&>svg]:h-[18px] [&>svg]:w-[18px] [&>svg]:text-slate-500">{I.link}{t("Link giới thiệu của bạn")}</div>
                    <div className="flex gap-2">
                      <input className="inp min-w-0 flex-1 font-mono !text-[13px]" readOnly value={affLink} onFocus={(e) => e.target.select()} />
                      <CopyBtn text={affLink} label={t("Sao chép link giới thiệu")} />
                    </div>
                    <p className="mt-1.5 text-[13px] text-slate-400">{t("Chia sẻ link này để nhận hoa hồng")}</p>
                  </div>
                  <div>
                    <div className="mb-2 text-sm font-extrabold text-slate-900">{t("Chia sẻ nhanh")}</div>
                    <ShareRow url={affLink} text={shareText} channels={["facebook", "x", "telegram", "whatsapp", "messenger", "zalo"]} />
                  </div>
                  <Link href="/dashboard/kiem-tien" className="btn-primary w-full !py-3 text-center">{t("Xem thống kê hoa hồng")}</Link>
                </>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-center">
                  <p className="text-sm text-slate-600">{t("Đăng nhập để lấy link giới thiệu của riêng bạn và bắt đầu nhận hoa hồng.")}</p>
                  <div className="mt-3 flex justify-center gap-2">
                    <Link href="/login" className="btn-primary">{t("Đăng nhập")}</Link>
                    <Link href="/register" className="btn-ghost">{t("Đăng ký")}</Link>
                  </div>
                </div>
              )}
              </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
