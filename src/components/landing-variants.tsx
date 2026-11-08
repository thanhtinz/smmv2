import Link from "next/link";
import { I } from "@/components/ui";
import { num, PLATFORMS } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";
import type { LandingView } from "@/components/landing";
import { PublicBurger } from "@/components/public-burger";
import { NotificationBell } from "@/components/notification-bell";

type P = React.ComponentProps<typeof LandingView>;

const FAQ = [
  { q: "SMM panel là gì?", a: "Là nền tảng để bạn đặt các dịch vụ tăng tương tác — follow, like, view, comment — cho tài khoản mạng xã hội, theo số lượng và trả theo lượt. Bạn chỉ cần link công khai; hệ thống lo phần còn lại." },
  { q: "Đơn bắt đầu chạy nhanh cỡ nào?", a: "Đơn dịch vụ API bắt đầu trong vài giây sau khi đặt. Tổng thời gian giao phụ thuộc dịch vụ và số lượng, và bạn theo dõi được tiến độ (số bắt đầu, số còn lại) theo thời gian thực." },
  { q: "Có cần mật khẩu tài khoản của tôi không?", a: "Không bao giờ. Mọi dịch vụ chạy từ link công khai như link trang cá nhân hay bài viết. Đừng chia sẻ mật khẩu của bạn cho bất kỳ ai." },
  { q: "Nạp tiền bằng cách nào?", a: "Chuyển khoản ngân hàng (quét VietQR) và MoMo. Chuyển đúng nội dung SMM + mã nạp của bạn, tiền được cộng tự động trong vài phút, 24/7; có thưởng theo mốc nạp nếu đang áp dụng." },
  { q: "Bù (refill) và huỷ hoạt động thế nào?", a: "Dịch vụ hỗ trợ được ghi rõ refill/cancel trong bảng giá. Yêu cầu bù ngay trong chi tiết đơn đã hoàn thành; huỷ đơn được hoàn tiền về số dư." },
  { q: "Có API cho đại lý không?", a: "Có. API v2 cho phép liệt kê dịch vụ, đặt đơn, tra trạng thái (tối đa 100 đơn/lần), huỷ, yêu cầu bù và xem số dư — cộng thêm API mua tài khoản Premium theo chu kỳ." },
];

const platName = (k: string) => PLATFORMS[k] || k;
const check = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-emerald-500"><path d="m4.5 12.5 5 5 10-11" /></svg>
);

/** Mẫu SÁNG RỰC — kiểu SMMFlare (SMM quốc tế): nền sáng, hero giữa, dải số
 *  liệu, thẻ nền tảng, tính năng, 3 bước, FAQ. */
export async function LandingLight(props: P) {
  const { L, Ld, M } = await getServerI18n();
  const { brandName, stats, platforms, premiums, links } = props;
  const showSmm = props.showSmm !== false;
  const showPremium = props.showPremium !== false;
  return (
    <div className="min-h-screen bg-slate-50 text-slate-600 antialiased">
      {props.announcement && <div className="bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white">{props.announcement}</div>}
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <PublicBurger tone="light" home="/" loggedIn={props.loggedIn} registerHref={links.register} items={[{ href: "#tinh-nang", label: L("Tính năng") }, ...(showSmm ? [{ href: "#dich-vu", label: L("Dịch vụ") }] : []), { href: "#quy-trinh", label: L("Quy trình") }, { href: links.api, label: L("Tài liệu API") }, { href: "#faq", label: L("Hỏi đáp") }, { href: links.services, label: L("Bảng giá") }, { href: links.order, label: L("Đặt đơn SMM") }]} />
          <span className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-base font-black text-white">{brandName.charAt(0).toUpperCase()}</span>
            <span className="text-lg font-extrabold tracking-tight text-slate-900">{brandName}</span>
          </span>
          <nav className="mx-auto hidden items-center gap-7 text-sm font-medium lg:flex">
            <a href="#tinh-nang" className="transition hover:text-brand-600">{L("Tính năng")}</a>
            {showSmm && <a href="#dich-vu" className="transition hover:text-brand-600">{L("Dịch vụ")}</a>}
            <a href="#quy-trinh" className="transition hover:text-brand-600">{L("Quy trình")}</a>
            <a href="#faq" className="transition hover:text-brand-600">{L("Hỏi đáp")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {props.loggedIn && <NotificationBell />}
            {props.loggedIn ? (
              <Link href={links.dashboard} className="btn-primary btn-sm !px-4 !py-2">{L("Bảng điều khiển")}</Link>
            ) : (
              <>
                <Link href={links.login} className="btn-ghost btn-sm !px-4 !py-2">{L("Đăng nhập")}</Link>
                <Link href={links.register} className="btn-primary btn-sm !px-4 !py-2">{L("Đăng ký")}</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 pb-14 pt-16 text-center lg:pt-20">
        <span className="inline-block rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-brand-700">{L("SMM Panel — dịch vụ mạng xã hội tự động")}</span>
        <h1 className="mt-6 text-4xl font-black leading-[1.12] tracking-tight text-slate-900 sm:text-5xl">
          {props.headline || <>{L("Tăng trưởng mạng xã hội,")}<br className="hidden sm:block" /> {L("nhanh và gọn hơn.")}</>}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-500">{props.tagline || L("Đặt dịch vụ tăng tương tác cho mọi nền tảng — hệ thống xử lý tự động, theo dõi tiến độ theo thời gian thực.")}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={props.loggedIn ? links.dashboard : links.register} className="btn-primary !px-7 !py-3.5 !text-[15px]">{L("Bắt đầu ngay")}</Link>
          <Link href={links.services} className="btn-ghost !px-7 !py-3.5 !text-[15px]">{L("Xem bảng giá")}</Link>
        </div>
        {platforms.length > 0 && (
          <div className="mt-9 flex flex-wrap items-center justify-center gap-2">
            {platforms.slice(0, 8).map((p) => (
              <span key={p.platform} className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-sm font-semibold text-slate-700 shadow-sm">{platName(p.platform)}</span>
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-slate-200 bg-slate-200 shadow-sm lg:grid-cols-4">
          {[
            { v: num(stats.services), l: L("Dịch vụ đang bán") },
            { v: num(stats.orders), l: L("Đơn đã xử lý") },
            { v: num(stats.users), l: L("Người dùng") },
            { v: `${stats.completion}%`, l: L("Tỉ lệ hoàn thành") },
          ].map((x) => (
            <div key={x.l} className="bg-white px-6 py-6 text-center">
              <div className="text-3xl font-black tracking-tight text-brand-600">{x.v}</div>
              <div className="mt-1 text-sm font-medium text-slate-500">{x.l}</div>
            </div>
          ))}
        </div>
      </section>

      {showSmm && platforms.length > 0 && (
        <section id="dich-vu" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 lg:py-20">
          <div className="mb-10 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{L("Dịch vụ theo nền tảng")}</h2>
            <p className="mt-2.5 text-slate-500">{L("Giá tính theo 1.000 lượt — đặt bao nhiêu trả bấy nhiêu.")}</p>
          </div>
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {platforms.map((p) => (
              <div key={p.platform} className="flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
                <div className="flex items-center justify-between">
                  <div className="text-lg font-extrabold text-slate-900">{platName(p.platform)}</div>
                  <span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">{p.count}{L(" dịch vụ")}</span>
                </div>
                <div className="mt-2 text-sm text-slate-500">{L("Từ")} <b className="text-base text-slate-900">{M(p.from)}</b> {L("/ 1.000 lượt")}</div>
                <ul className="mt-4 flex-1 space-y-2 text-sm">
                  {p.points.slice(0, 3).map((pt) => (
                    <li key={pt} className="flex gap-2">{check}<span>{pt}</span></li>
                  ))}
                </ul>
                <Link href={links.order} className="mt-5 font-bold text-brand-600 transition hover:text-brand-700">{L("Đặt đơn →")}</Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {showPremium && premiums.length > 0 && (
        <section className="border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 lg:py-20">
            <div className="mb-10 text-center">
              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{L("Tài khoản Premium")}</h2>
              <p className="mt-2.5 text-slate-500">{L("Kích hoạt tự động ngay sau khi thanh toán.")}</p>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {premiums.map((p) => (
                <Link key={p.name} href={p.href} className="rounded-3xl border border-slate-200 bg-slate-50 p-6 transition hover:border-brand-300 hover:shadow-md">
                  <span className="text-brand-600 [&>svg]:h-8 [&>svg]:w-8">{I.gem}</span>
                  <div className="mt-3 font-extrabold text-slate-900">{p.name}</div>
                  {p.tagline && <p className="mt-1 line-clamp-2 text-sm text-slate-500">{p.tagline}</p>}
                  <div className="mt-3 text-sm text-slate-500">{L("Từ")} <b className="text-slate-900">{M(p.from)}</b></div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      <section id="tinh-nang" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 lg:py-20">
        <div className="mb-10 text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">{L("Vì sao chọn ")}{brandName}?</h2>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: I.cart, t: L("Đặt đơn tự động"), d: L("Đơn được gửi đi ngay khi đặt, chạy 24/7 kể cả ngày lễ.") },
            { icon: I.wallet, t: L("Nạp tiền tự động"), d: L("Quét QR chuyển khoản, số dư cộng trong vài phút.") },
            { icon: I.key, t: L("API cho đại lý"), d: L("API v2 chuẩn SMM — nối panel riêng của bạn trong vài phút.") },
            { icon: I.ticket, t: L("Hỗ trợ qua ticket"), d: L("Đội hỗ trợ xử lý ticket và yêu cầu bù/huỷ ngay trong đơn.") },
          ].map((f) => (
            <div key={f.t} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 [&>svg]:h-5 [&>svg]:w-5">{f.icon}</span>
              <div className="mt-4 font-bold text-slate-900">{f.t}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="quy-trinh" className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-16 lg:pb-20">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {[
            { n: "1", t: L("Đăng ký tài khoản"), d: L("Miễn phí, chỉ cần tên đăng nhập và email.") },
            { n: "2", t: L("Nạp tiền vào ví"), d: L("Chuyển khoản QR — tiền vào tự động, có thưởng theo mốc nạp.") },
            { n: "3", t: L("Đặt đơn và theo dõi"), d: L("Dán link, chọn số lượng — hệ thống chạy và cập nhật tiến độ.") },
          ].map((s) => (
            <div key={s.n} className="flex gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-black text-white">{s.n}</span>
              <div>
                <div className="font-bold text-slate-900">{s.t}</div>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-4xl scroll-mt-24 px-4 pb-20">
        <h2 className="mb-8 text-center text-3xl font-extrabold tracking-tight text-slate-900">{L("Hỏi đáp thường gặp")}</h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-slate-200 bg-white px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-800">
                {L(f.q)}
                <span className="shrink-0 text-xl leading-none text-brand-600 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-500">{L(f.a)}</p>
            </details>
          ))}
        </div>
        <div className="mt-14 rounded-3xl bg-gradient-to-r from-brand-600 to-brand-800 px-6 py-10 text-center text-white">
          <div className="text-2xl font-extrabold">{L("Sẵn sàng tăng trưởng cùng ")}{brandName}?</div>
          <Link href={props.loggedIn ? links.dashboard : links.register} className="mt-5 inline-block rounded-full bg-white px-7 py-3 text-sm font-bold text-brand-700 transition hover:bg-brand-50">{L("Tạo tài khoản miễn phí")}</Link>
        </div>
      </section>
      {props.footer}
    </div>
  );
}

/** Mẫu CỔ ĐIỂN — kiểu panel SMM truyền thống: nền navy đậm, hero giữa,
 *  bảng nền tảng dạng bảng, các bước ngang. */
export async function LandingClassic(props: P) {
  const { L, M } = await getServerI18n();
  const { brandName, stats, platforms, premiums, links } = props;
  const showSmm = props.showSmm !== false;
  const showPremium = props.showPremium !== false;
  return (
    <div className="min-h-screen bg-[#0b1220] text-slate-300 antialiased">
      {props.announcement && <div className="bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white">{props.announcement}</div>}
      <header className="border-b border-white/10">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
          <PublicBurger tone="dark" home="/" loggedIn={props.loggedIn} registerHref={links.register} items={[{ href: "#tinh-nang", label: L("Tính năng") }, ...(showSmm ? [{ href: "#dich-vu", label: L("Dịch vụ") }] : []), { href: "#quy-trinh", label: L("Quy trình") }, { href: links.api, label: L("Tài liệu API") }, { href: "#faq", label: L("Hỏi đáp") }, { href: links.services, label: L("Bảng giá") }, { href: links.order, label: L("Đặt đơn SMM") }]} />
          <span className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-base font-black text-white">{brandName.charAt(0).toUpperCase()}</span>
            <span className="text-lg font-extrabold tracking-tight text-white">{brandName}</span>
          </span>
          <nav className="mx-auto hidden items-center gap-7 text-sm font-medium lg:flex">
            {showSmm && <a href="#dich-vu" className="transition hover:text-white">{L("Dịch vụ")}</a>}
            <a href="#quy-trinh" className="transition hover:text-white">{L("Quy trình")}</a>
            <Link href={links.api} className="transition hover:text-white">{L("Tài liệu API")}</Link>
            <a href="#faq" className="transition hover:text-white">{L("Hỏi đáp")}</a>
          </nav>
          <div className="ml-auto flex items-center gap-2 lg:ml-0">
            {props.loggedIn && <NotificationBell tone="dark" />}
            {props.loggedIn ? (
              <Link href={links.dashboard} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-500">{L("Bảng điều khiển")}</Link>
            ) : (
              <>
                <Link href={links.login} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10">{L("Đăng nhập")}</Link>
                <Link href={links.register} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-500">{L("Đăng ký")}</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-4 pb-14 pt-16 text-center">
        <h1 className="text-4xl font-black leading-[1.12] tracking-tight text-white sm:text-5xl">
          {props.headline || <>{L("Tăng trưởng mạng xã hội,")}<br className="hidden sm:block" /> {L("nhanh và gọn hơn.")}</>}
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">{props.tagline || L("Đặt dịch vụ tăng tương tác cho mọi nền tảng — hệ thống xử lý tự động, theo dõi tiến độ theo thời gian thực.")}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={props.loggedIn ? links.dashboard : links.register} className="rounded-lg bg-brand-600 px-7 py-3.5 text-[15px] font-bold text-white transition hover:bg-brand-500">{L("Bắt đầu ngay")}</Link>
          <Link href={links.services} className="rounded-lg border border-white/15 px-7 py-3.5 text-[15px] font-bold text-white transition hover:bg-white/10">{L("Xem bảng giá")}</Link>
        </div>
        <div className="mx-auto mt-12 grid max-w-3xl grid-cols-2 gap-6 lg:grid-cols-4">
          {[
            { v: num(stats.services), l: L("Dịch vụ") },
            { v: num(stats.orders), l: L("Đơn đã xử lý") },
            { v: num(stats.users), l: L("Người dùng") },
            { v: `${stats.completion}%`, l: L("Hoàn thành") },
          ].map((x) => (
            <div key={x.l}>
              <div className="text-3xl font-black tracking-tight text-white">{x.v}</div>
              <div className="mt-1 text-sm text-slate-400">{x.l}</div>
            </div>
          ))}
        </div>
      </section>

      {showSmm && platforms.length > 0 && (
        <section id="dich-vu" className="mx-auto max-w-5xl scroll-mt-24 px-4 pb-16">
          <div className="overflow-hidden rounded-2xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-white/[0.06] text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3.5 font-bold">{L("Nền tảng")}</th>
                  <th className="hidden px-5 py-3.5 font-bold sm:table-cell">{L("Số dịch vụ")}</th>
                  <th className="px-5 py-3.5 font-bold">{L("Giá từ / 1.000")}</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {platforms.map((p) => (
                  <tr key={p.platform} className="border-t border-white/[0.06] transition hover:bg-white/[0.03]">
                    <td className="px-5 py-4 font-bold text-white">{platName(p.platform)}</td>
                    <td className="hidden px-5 py-4 sm:table-cell">{p.count}</td>
                    <td className="px-5 py-4 font-semibold text-brand-300">{M(p.from)}</td>
                    <td className="whitespace-nowrap px-5 py-4 text-right"><Link href={links.order} className="font-bold text-brand-300 transition hover:text-brand-200">{L("Đặt đơn →")}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {showPremium && premiums.length > 0 && (
        <section className="mx-auto max-w-7xl px-4 pb-16">
          <h2 className="mb-6 text-center text-2xl font-extrabold text-white">{L("Tài khoản Premium")}</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {premiums.map((p) => (
              <Link key={p.name} href={p.href} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:border-brand-400/50">
                <div className="font-extrabold text-white">{p.name}</div>
                {p.tagline && <p className="mt-1 line-clamp-2 text-sm text-slate-400">{p.tagline}</p>}
                <div className="mt-3 text-sm text-slate-400">{L("Từ")} <b className="text-white">{M(p.from)}</b></div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section id="quy-trinh" className="mx-auto max-w-7xl scroll-mt-24 px-4 pb-16">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { n: "1", t: L("Đăng ký tài khoản"), d: L("Miễn phí, chỉ cần tên đăng nhập và email.") },
            { n: "2", t: L("Nạp tiền vào ví"), d: L("Chuyển khoản QR — tiền vào tự động, có thưởng theo mốc nạp.") },
            { n: "3", t: L("Đặt đơn và theo dõi"), d: L("Dán link, chọn số lượng — hệ thống chạy và cập nhật tiến độ.") },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
              <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-lg font-black text-white">{s.n}</span>
              <div className="mt-4 font-bold text-white">{s.t}</div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="faq" className="mx-auto max-w-4xl scroll-mt-24 px-4 pb-20">
        <h2 className="mb-8 text-center text-2xl font-extrabold text-white">{L("Hỏi đáp thường gặp")}</h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-100">
                {L(f.q)}
                <span className="shrink-0 text-xl leading-none text-brand-300 transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-400">{L(f.a)}</p>
            </details>
          ))}
        </div>
      </section>
      {props.footer}
    </div>
  );
}
