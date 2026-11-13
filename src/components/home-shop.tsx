"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PremiumCard, type PremiumCardData } from "@/components/premium-card";
import { HomeGiftSection, type HomeGift } from "@/components/home-gifts";
import { PillStrip } from "@/components/pill-strip";
import { useRecentItems } from "@/components/recent";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";

export type HomeCard = PremiumCardData & { categoryId: number };
export type HomeSlide = { title: string; subtitle: string; href: string; cta: string; image: string | null; color: string; bare?: boolean };
export type HomeCat = { id: number; name: string; color: string; image: string | null; count: number };

const PAGE = 8;

function ChevronBtn({ dir, onClick, label, className = "" }: { dir: "prev" | "next"; onClick: () => void; label: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 ${className}`}>
      <span className={`[&>svg]:h-4 [&>svg]:w-4 ${dir === "prev" ? "rotate-90" : "-rotate-90"}`}>{I.chevron}</span>
    </button>
  );
}

/** Slider hero trang chủ: FULL-BLEED bề ngang (lệnh Tín 2026-11-08 12:51
 *  "banner bự ra hết cỡ" — rộng tràn hai bên, KHÔNG cao thêm: Tín đính chính
 *  13:51 "tôi kêu dài qua 1 bên chứ đâu kêu cho cao lên") — component được
 *  page.tsx render NGOÀI <main> (con trực tiếp của PublicFrame) nên tràn hết
 *  bề ngang viewport, không lề, góc vuông; chiều cao giữ 300/380/470 như bản
 *  fix9 (6bb0644). Tự chuyển, có mũi tên + chấm chỉ vị trí. Slide dựng từ dữ
 *  liệu thật (site + danh mục); khối chữ canh theo container max-w-7xl của
 *  trang để không trôi ra mép ở màn rất rộng. Mũi tên qua/lại hiện ở MỌI bề
 *  rộng (nút 40px, bấm được trên điện thoại — lệnh Tín 2026-11-08 21:13). */
const HERO_AUTOPLAY_MS = 5500;

export function HeroSlider({ slides }: { slides: HomeSlide[] }) {
  const { t } = useLang();
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  // Tự chạy + chấm TIẾN TRÌNH dùng CHUNG MỘT đồng hồ rAF (lệnh Tín
  // 2026-11-08 21:12): accRef = số ms đã chạy của slide hiện tại — thanh
  // đầy (acc chạm HERO_AUTOPLAY_MS) thì chuyển slide ngay trong cùng tick,
  // nên thanh và thời điểm chuyển không bao giờ lệch nhau. Hover/tạm dừng
  // thì rAF dừng, acc giữ nguyên, thanh đứng yên theo. Chuyển tay (mũi
  // tên/chấm) = acc về 0, thanh chạy lại từ đầu. Tab ẩn thì rAF tự dừng —
  // cả hai cùng đứng yên.
  const accRef = useRef(0);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (n <= 1 || paused) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (!last) last = now;
      accRef.current += now - last;
      last = now;
      if (accRef.current >= HERO_AUTOPLAY_MS) {
        accRef.current = 0;
        if (fillRef.current) fillRef.current.style.width = "0%";
        setIdx((i) => (i + 1) % n);
      } else if (fillRef.current) {
        fillRef.current.style.width = `${(accRef.current / HERO_AUTOPLAY_MS) * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, paused]);
  if (n === 0) return null;
  const goTo = (i: number) => {
    accRef.current = 0;
    if (fillRef.current) fillRef.current.style.width = "0%";
    setIdx(((i % n) + n) % n);
  };
  const go = (d: number) => goTo(idx + d);
  return (
    <section className="relative w-full overflow-hidden" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      {/* Chiều cao hero: giữ nguyên 300/380/470 của fix9 (6bb0644) — đợt
          full-bleed chỉ đổi bề ngang (tràn viewport), không đổi chiều cao
          (Tín đính chính 2026-11-08 13:51). Ảnh nền object-cover cắt giữa,
          không méo. */}
      <div className="relative h-[240px] sm:h-[300px] lg:h-[380px]">
        {slides.map((s, i) => (
          <div key={i} className={`absolute inset-0 transition-opacity duration-700 ${i === idx ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            {s.bare ? (
              /* Slide BANNER ADMIN: ảnh là toàn bộ nội dung (chữ đã nằm
                 trong chính ảnh admin tải lên) — không chèn khối chữ của
                 slide tự tạo; có link đích thì cả slide bấm được. */
              s.href ? (
                <Link href={s.href} className="absolute inset-0" aria-label="Banner">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.image || ""} alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} className="h-full w-full select-none object-cover" />
                </Link>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image || ""} alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} className="absolute inset-0 h-full w-full select-none object-cover" />
              )
            ) : s.image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image} alt="" draggable={false} onContextMenu={(e) => e.preventDefault()} className="absolute inset-0 h-full w-full select-none object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent" />
              </>
            ) : (
              <>
                <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${s.color}, rgb(var(--b500)))` }} />
                <span className="absolute -right-2 top-1/2 -translate-y-1/2 select-none text-[150px] font-black leading-none text-white/15 sm:text-[220px]">{s.title.charAt(0).toUpperCase()}</span>
              </>
            )}
            {/* Khối chữ CHỈ dành cho slide tự tạo — slide banner (bare)
                không render khối này: nó phủ h-full lên trên ảnh và sẽ
                chặn mất click vào link của banner. */}
            {!s.bare && (
              <div className="relative mx-auto flex h-full w-full max-w-7xl flex-col justify-center px-4">
                <div className="max-w-xl px-12 sm:px-14">
                  <h1 className="text-[28px] font-black leading-tight text-white sm:text-4xl lg:text-5xl">{s.title}</h1>
                  {s.subtitle && <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-white/85 sm:text-base lg:text-lg">{s.subtitle}</p>}
                  <div className="mt-5 lg:mt-7">
                    <Link href={s.href} className="inline-block rounded-full bg-white px-6 py-2.5 text-sm font-extrabold text-slate-900 shadow-lg transition hover:bg-slate-100 lg:px-7 lg:py-3 lg:text-[15px]">{s.cta}</Link>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <div className="absolute inset-y-0 left-3 flex items-center sm:left-4"><ChevronBtn dir="prev" label={t("Trang trước")} onClick={() => go(-1)} /></div>
          <div className="absolute inset-y-0 right-3 flex items-center sm:right-4"><ChevronBtn dir="next" label={t("Trang sau")} onClick={() => go(1)} /></div>
          {/* Chấm trang: chấm đang chạy = THANH TIẾN TRÌNH (pill có phần
              đầy chạy theo đúng thời gian tự chuyển slide, cùng đồng hồ
              rAF ở trên); chấm chưa tới vẫn là chấm tròn nhỏ. */}
          <div className="absolute bottom-3.5 left-1/2 flex -translate-x-1/2 items-center gap-1.5">
            {slides.map((_, i) =>
              i === idx ? (
                <button key={i} type="button" aria-label={`Slide ${i + 1}`} onClick={() => goTo(i)} className="h-2 w-8 overflow-hidden rounded-full bg-white/35 sm:w-10">
                  <span ref={fillRef} className="block h-full rounded-full bg-white" style={{ width: "0%" }} />
                </button>
              ) : (
                <button key={i} type="button" aria-label={`Slide ${i + 1}`} onClick={() => goTo(i)} className="h-2 w-2 rounded-full bg-white/45 transition hover:bg-white/70" />
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}

function SectionHead({ icon, title, subtitle, href, extra }: { icon: React.ReactNode; title: string; subtitle?: string; href: string; extra?: React.ReactNode }) {
  const { t } = useLang();
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-extrabold text-slate-900 sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {extra}
        <Link href={href} className="inline-flex items-center gap-1.5 text-sm font-bold text-brand-600 hover:text-brand-500">{t("Xem tất cả")}<span className="[&_svg]:h-4 [&_svg]:w-4">{I.arrowRight}</span></Link>
      </div>
    </div>
  );
}

/** Mục ray thẻ trượt ngang (bán chạy / đã xem): scroll-snap + nút trước/sau
 *  nằm ở hàng tiêu đề cạnh link Xem tất cả. */
function RailSection({ icon, title, subtitle, href, items }: { icon: React.ReactNode; title: string; subtitle: string; href: string; items: HomeCard[] }) {
  const { t } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const scroll = (d: number) => { const el = ref.current; if (el) el.scrollBy({ left: d * el.clientWidth * 0.8, behavior: "smooth" }); };
  if (items.length === 0) return null;
  return (
    <section className="mt-12">
      <SectionHead icon={icon} title={title} subtitle={subtitle} href={href} extra={(
        <span className="hidden gap-2 sm:flex">
          <ChevronBtn dir="prev" label={t("Trang trước")} onClick={() => scroll(-1)} />
          <ChevronBtn dir="next" label={t("Trang sau")} onClick={() => scroll(1)} />
        </span>
      )} />
      <div ref={ref} className="flex snap-x snap-mandatory items-stretch gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-5">
        {items.map((item) => (
          <PremiumCard key={item.slug} item={item} base="/premium" className="w-[47%] shrink-0 snap-start sm:w-[31.5%] lg:w-[23.8%]" />
        ))}
      </div>
    </section>
  );
}

/** Thân trang chủ cửa hàng: slider → khối danh mục → nổi bật → bán chạy →
 *  đã xem gần đây, đúng thứ tự khối của shopkey; khung header/footer giữ nguyên. */
export function HomeShop({ slides, cats, all, best, gifts, hero = true }: { slides: HomeSlide[]; cats: HomeCat[]; all: HomeCard[]; best: HomeCard[]; gifts: HomeGift[]; hero?: boolean }) {
  const { t } = useLang();
  const [shown, setShown] = useState(PAGE);
  // Lưới nổi bật trang chủ luôn là các sản phẩm mới nhất của TOÀN catalog —
  // lọc theo danh mục KHÔNG còn làm tại chỗ: pill danh mục là LINK sang
  // /premium?cat=<id> (kiểu shopkey, lệnh Tín 2026-11-12 21:27).
  const filtered = all;
  const recentStored = useRecentItems();
  const byId = new Map(all.map((c) => [c.productId, c]));
  const recent = recentStored.map((r) => byId.get(r.productId)).filter((x): x is HomeCard => !!x);

  return (
    <>
      {hero ? <HeroSlider slides={slides} /> : null}

      {cats.length > 0 && (
        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-4 shadow-soft sm:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{I.layers}</span>
            <h2 className="text-lg font-extrabold text-slate-900 sm:text-xl">{t("Danh mục sản phẩm")}</h2>
          </div>
          {/* Dải pill danh mục (lệnh Tín 2026-11-08 01:51, thay lưới ô của
              fix6 task 11): một hàng pill rounded-full CHỈ CÓ TÊN — không
              icon, không số lượng. Vỏ PillStrip (2026-11-08) thêm nút
              chevron 2 đầu + vệt mờ để khách biết dải kéo qua được.
              HÀNH VI MỚI (lệnh Tín 2026-11-12 21:27, kiểu shopkey): pill
              là LINK điều hướng — bấm tên danh mục là sang trang Tất cả
              sản phẩm /premium VỚI SẴN bộ lọc danh mục đó (tham số ?cat=
              mà /premium đã đọc; pill tương ứng bên đó tự sáng). "Tất cả"
              trỏ /premium không lọc — nó mang style "đang chọn" vì lưới
              nổi bật ngay dưới khối này luôn là toàn catalog. Mọi điểm
              chạm danh mục trên trang chủ (pill + slide hero danh mục)
              cùng một hành vi. */}
          <PillStrip className="mt-4">
            <Link href="/premium"
              className="shrink-0 whitespace-nowrap rounded-full border border-brand-600 bg-brand-600 px-4 py-2 text-sm font-bold text-white transition">
              {t("Tất cả")}
            </Link>
            {cats.map((c) => (
              <Link key={c.id} href={`/premium?cat=${c.id}`}
                className="shrink-0 whitespace-nowrap rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:border-brand-300 hover:text-brand-700">
                {c.name}
              </Link>
            ))}
          </PillStrip>
        </section>
      )}

      <section id="home-featured" className="mt-10 scroll-mt-28">
        <SectionHead icon={I.star} title={t("Sản phẩm nổi bật")} subtitle={t("Sản phẩm Premium mới nhất trên cửa hàng.")} href="/premium" />
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {filtered.slice(0, shown).map((item) => <PremiumCard key={item.slug} item={item} base="/premium" />)}
        </div>
        {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{t("Chưa có sản phẩm nào phù hợp.")}</p>}
        {shown < filtered.length && (
          <div className="mt-8 text-center">
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="rounded-full border border-slate-300 px-7 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50">
              {t("Tải thêm sản phẩm")}
            </button>
          </div>
        )}
      </section>

      {/* Mục Steam Gift Games riêng — NGAY DƯỚI Sản phẩm nổi bật (lệnh Tín
          2026-11-08): game Steam không thuộc catalog Premium, có mục riêng
          trỏ về khu Steam. Không có game thì component tự ẩn. */}
      <HomeGiftSection gifts={gifts} />

      <RailSection icon={I.chart} title={t("Sản phẩm bán chạy")} subtitle={t("Được khách hàng mua nhiều nhất trên cửa hàng.")} href="/premium?sort=ban-chay" items={best} />
      <RailSection icon={I.history} title={t("Đã xem gần đây")} subtitle={t("Những sản phẩm bạn vừa xem.")} href="/premium" items={recent} />
    </>
  );
}
