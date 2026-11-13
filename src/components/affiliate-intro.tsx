import { I } from "./ui";
import { getServerI18n } from "@/lib/lang-server";
import { enrollAffiliateAction } from "@/app/actions/affiliate";

/** TRANG GIỚI THIỆU CHƯƠNG TRÌNH GIỚI THIỆU (cổng tham gia — mẫu ldshop
 *  /account/aff, trang đích không mở được 403 nên dựng theo brief của chủ
 *  web + cấu trúc landing affiliate chuẩn): khách đã đăng nhập nhưng CHƯA
 *  ghi danh (affiliateEnrolledAt = null) vào route hoa hồng sẽ thấy trang
 *  này thay cho dashboard. Mọi con số (tỉ lệ %, mức rút tối thiểu) lấy từ
 *  cấu hình admin thật — engine chỉ trả hoa hồng trên ĐƠN HÀNG nên trang
 *  chỉ nêu nguồn đó, không hứa thêm nguồn nào khác. */
export async function AffiliateIntro({ pct, withdrawMin }: { pct: number; withdrawMin: number }) {
  const { L, M } = await getServerI18n();

  const steps = [
    { icon: I.share, title: L("Chia sẻ link giới thiệu"), desc: L("Gửi link giới thiệu cá nhân của bạn cho bạn bè.") },
    { icon: I.users, title: L("Bạn bè đăng ký và mua hàng"), desc: L("Tài khoản đăng ký qua link của bạn sẽ được gắn với bạn.") },
    { icon: I.handCoin, title: L("Nhận hoa hồng"), desc: L("Mỗi đơn hàng hoàn tất cộng {pct}% vào số dư hoa hồng của bạn.").replace("{pct}", String(pct)) },
    { icon: I.wallet, title: L("Rút về ví chính"), desc: L("Đạt mức tối thiểu {min} thì rút hoa hồng về ví chính để mua hàng.").replace("{min}", M(withdrawMin)) },
  ];
  const rules = [
    L("Hoa hồng áp dụng cho cả đơn dịch vụ SMM và đơn mua sản phẩm Premium."),
    L("Đơn hàng bị hoàn tiền sẽ thu hồi phần hoa hồng tương ứng."),
    L("Không giới hạn số bạn bè được giới thiệu."),
    L("Hoa hồng cộng vào số dư riêng, chỉ rút được khi đạt mức tối thiểu."),
  ];

  return (
    <div className="space-y-5">
      {/* Hero: tên chương trình + tỉ lệ thật + nút tham gia */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-600 to-teal-500 p-6 text-white shadow-lg sm:p-8" aria-label={L("Giới thiệu bạn bè")}>
        <span className="absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" aria-hidden />
        <span className="absolute -bottom-14 right-32 h-40 w-40 rounded-full bg-white/10" aria-hidden />
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-bold">
            <span className="grid h-4 w-4 place-items-center">{I.gift}</span>
            {L("Chương trình giới thiệu bạn bè")}
          </span>
          <h1 className="mt-4 max-w-xl text-2xl font-extrabold leading-snug sm:text-3xl">
            {L("Giới thiệu bạn bè, nhận hoa hồng trên mỗi đơn hàng")}
          </h1>
          <p className="mt-2 max-w-xl text-sm text-white/85">
            {L("Bạn bè mua hàng qua link của bạn, bạn nhận hoa hồng vào số dư riêng và rút về ví chính khi đủ mức.")}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="rounded-2xl bg-white/15 px-4 py-2.5">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-white/80">{L("Hoa hồng đơn hàng")}</span>
              <span className="text-xl font-extrabold">{pct}%</span>
            </span>
            <span className="rounded-2xl bg-white/15 px-4 py-2.5">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-white/80">{L("Mức rút tối thiểu")}</span>
              <span className="text-xl font-extrabold">{M(withdrawMin)}</span>
            </span>
            <form action={enrollAffiliateAction}>
              <button type="submit" className="rounded-2xl bg-white px-6 py-3.5 text-sm font-extrabold text-brand-700 shadow transition hover:bg-brand-50">
                {L("Đăng ký tham gia")}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Cách hoạt động */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-extrabold text-slate-800">{L("Cách hoạt động")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={s.title} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <div className="flex items-center gap-2">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white [&>svg]:h-5 [&>svg]:w-5">{s.icon}</span>
                <span className="text-xs font-extrabold text-slate-400">{L("Bước")} {i + 1}</span>
              </div>
              <p className="mt-3 text-sm font-bold text-slate-800">{s.title}</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Quyền lợi & quy định — mỗi dòng một ý, đúng luật thật của hệ thống */}
      <section className="card p-5 sm:p-6">
        <h2 className="text-base font-extrabold text-slate-800">{L("Quyền lợi & quy định")}</h2>
        <ul className="mt-3 grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
          {rules.map((r) => (
            <li key={r} className="flex items-start gap-2 text-sm text-slate-600">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-600 [&>svg]:h-3.5 [&>svg]:w-3.5">{I.check}</span>
              {r}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
