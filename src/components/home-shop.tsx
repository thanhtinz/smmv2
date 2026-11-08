"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { PremiumCard, type PremiumCardData } from "@/components/premium-card";
import { useRecentItems } from "@/components/recent";
import { useLang } from "@/components/lang";
import { I } from "@/components/ui";

export type HomeCard = PremiumCardData & { categoryId: number };
export type HomeSlide = { title: string; subtitle: string; href: string; cta: string; image: string | null; color: string };
export type HomeCat = { id: number; name: string; color: string; image: string | null };

const PAGE = 8;

function ChevronBtn({ dir, onClick, label, className = "" }: { dir: "prev" | "next"; onClick: () => void; label: string; className?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur transition hover:bg-black/60 sm:h-10 sm:w-10 ${className}`}>
      <span className={`[&>svg]:h-4 [&>svg]:w-4 ${dir === "prev" ? "rotate-90" : "-rotate-90"}`}>{I.chevron}</span>
    </button>
  );
}

/** Slider hero trang chủ kiểu shopkey: banner rộng ~3.2:1, tự chuyển, có
 *  mũi tên + chấm chỉ vị trí. Slide dựng từ dữ liệu thật (site + danh mục). */
function HeroSlider({ slides }: { slides: HomeSlide[] }) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const n = slides.length;
  useEffect(() => {
    if (n <= 1 || paused) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % n), 5500);
    return () => clearInterval(id);
  }, [n, paused]);
  if (n === 0) return null;
  const go = (d: number) => setIdx((i) => (i + d + n) % n);
  return (
    <section className="relative overflow-hidden rounded-3xl" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="relative h-[240px] sm:h-[300px] lg:h-[380px]">
        {slides.map((s, i) => (
          <div key={i} className={`absolute inset-0 transition-opacity duration-700 ${i === idx ? "opacity-100" : "pointer-events-none opacity-0"}`}>
            {s.image ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={s.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#07090d]/90 via-[#07090d]/55 to-transparent" />
              </>
            ) : (
              <>
                <div className="absolute inset-0" style={{ background: `linear-gradient(120deg, ${s.color}, #0ea5e9)` }} />
                <span className="absolute -right-2 top-1/2 -translate-y-1/2 select-none text-[150px] font-black leading-none text-white/15 sm:text-[220px]">{s.title.charAt(0).toUpperCase()}</span>
              </>
            )}
            <div className="relative flex h-full max-w-xl flex-col justify-center px-14 sm:px-[4.5rem]">
              <h1 className="text-2xl font-black leading-tight text-white sm:text-4xl">{s.title}</h1>
              {s.subtitle && <p className="mt-2.5 line-clamp-2 text-sm leading-relaxed text-white/85 sm:text-base">{s.subtitle}</p>}
              <div className="mt-5">
                <Link href={s.href} className="inline-block rounded-full bg-white px-6 py-2.5 text-sm font-extrabold text-slate-900 shadow-lg transition hover:bg-slate-100">{s.cta}</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
      {n > 1 && (
        <>
          <div className="absolute inset-y-0 left-3 flex items-center sm:left-4"><ChevronBtn dir="prev" label="‹" onClick={() => go(-1)} /></div>
          <div className="absolute inset-y-0 right-3 flex items-center sm:right-4"><ChevronBtn dir="next" label="›" onClick={() => go(1)} /></div>
          <div className="absolute bottom-3.5 left-1/2 flex -translate-x-1/2 gap-1.5">
            {slides.map((_, i) => (
              <button key={i} type="button" aria-label={`Slide ${i + 1}`} onClick={() => setIdx(i)} className={`h-2 rounded-full transition-all ${i === idx ? "w-6 bg-white" : "w-2 bg-white/45 hover:bg-white/70"}`} />
            ))}
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
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white [&>svg]:h-5 [&>svg]:w-5">{icon}</span>
        <div className="min-w-0">
          <h2 className="truncate text-xl font-extrabold text-white sm:text-2xl">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-[13px] text-slate-400">{subtitle}</p>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {extra}
        <Link href={href} className="text-sm font-bold text-cyan-300 hover:text-cyan-200">{t("Xem tất cả")} →</Link>
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
      <div ref={ref} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-5">
        {items.map((item) => (
          <PremiumCard key={item.slug} item={item} base="/premium" className="w-[47%] shrink-0 snap-start sm:w-[31.5%] lg:w-[23.8%]" />
        ))}
      </div>
    </section>
  );
}

/** Thân trang chủ cửa hàng: slider → khối danh mục → nổi bật → bán chạy →
 *  đã xem gần đây, đúng thứ tự khối của shopkey; khung header/footer giữ nguyên. */
export function HomeShop({ slides, cats, all, best }: { slides: HomeSlide[]; cats: HomeCat[]; all: HomeCard[]; best: HomeCard[] }) {
  const { t } = useLang();
  const [cat, setCat] = useState<number | null>(null);
  const [shown, setShown] = useState(PAGE);
  useEffect(() => { setShown(PAGE); }, [cat]);
  const tileRef = useRef<HTMLDivElement>(null);
  const scrollTiles = (d: number) => tileRef.current?.scrollBy({ left: d * 320, behavior: "smooth" });
  const pickCat = (id: number | null, scroll = false) => {
    setCat(id);
    if (scroll) document.getElementById("home-featured")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const filtered = cat == null ? all : all.filter((c) => c.categoryId === cat);
  const recentStored = useRecentItems();
  const byId = new Map(all.map((c) => [c.productId, c]));
  const recent = recentStored.map((r) => byId.get(r.productId)).filter((x): x is HomeCard => !!x);

  return (
    <>
      <HeroSlider slides={slides} />

      {cats.length > 0 && (
        <section className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white [&>svg]:h-5 [&>svg]:w-5">{I.layers}</span>
              <h2 className="text-lg font-extrabold text-white sm:text-xl">{t("Danh mục sản phẩm")}</h2>
            </div>
            <div className="hidden gap-2 sm:flex">
              <ChevronBtn dir="prev" label={t("Trang trước")} onClick={() => scrollTiles(-1)} />
              <ChevronBtn dir="next" label={t("Trang sau")} onClick={() => scrollTiles(1)} />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => pickCat(null)} className={`rounded-full px-4 py-2 text-sm font-bold transition ${cat == null ? "bg-rose-600 text-white" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>{t("Tất cả")}</button>
            {cats.map((c) => (
              <button key={c.id} type="button" onClick={() => pickCat(c.id)} className={`rounded-full px-4 py-2 text-sm font-bold transition ${cat === c.id ? "bg-rose-600 text-white" : "border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}>{c.name}</button>
            ))}
          </div>
          <div ref={tileRef} className="mt-4 flex snap-x gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {cats.map((c) => (
              <button key={c.id} type="button" onClick={() => pickCat(c.id, true)}
                className={`w-[104px] shrink-0 snap-start rounded-2xl border p-2.5 text-center transition ${cat === c.id ? "border-rose-400/60 bg-rose-500/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"}`}>
                <span className="block h-14 w-full overflow-hidden rounded-lg">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl font-black text-white/90" style={{ background: `linear-gradient(135deg, ${c.color}, #0ea5e9)` }}>{c.name.charAt(0).toUpperCase()}</span>
                  )}
                </span>
                <span className="mt-2 line-clamp-2 block min-h-[2.5em] text-xs font-semibold leading-snug text-slate-200">{c.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section id="home-featured" className="mt-10 scroll-mt-28">
        <SectionHead icon={I.star} title={t("Sản phẩm nổi bật")} subtitle={t("Sản phẩm Premium mới nhất trên cửa hàng.")} href={cat == null ? "/premium" : `/premium?cat=${cat}`} />
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
          {filtered.slice(0, shown).map((item) => <PremiumCard key={item.slug} item={item} base="/premium" />)}
        </div>
        {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{t("Chưa có sản phẩm nào phù hợp.")}</p>}
        {shown < filtered.length && (
          <div className="mt-8 text-center">
            <button type="button" onClick={() => setShown((n) => n + PAGE)} className="rounded-full border border-white/25 px-7 py-2.5 text-sm font-bold text-white transition hover:bg-white/10">
              {t("Tải thêm sản phẩm")}
            </button>
          </div>
        )}
      </section>

      <RailSection icon={I.chart} title={t("Sản phẩm bán chạy")} subtitle={t("Được khách hàng mua nhiều nhất trên cửa hàng.")} href="/premium?sort=ban-chay" items={best} />
      <RailSection icon={I.history} title={t("Đã xem gần đây")} subtitle={t("Những sản phẩm bạn vừa xem.")} href="/premium" items={recent} />
    </>
  );
}
