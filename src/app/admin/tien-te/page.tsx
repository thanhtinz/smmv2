import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash } from "@/components/ui";
import { saveRatesAction } from "@/app/actions/admin-features";

export const dynamic = "force-dynamic";

const CURRENCIES = [
  { key: "usd_rate", code: "USD", name: "Đô la Mỹ", note: "Cũng là tỉ giá quy đổi khi khách nạp qua PayPal / Stripe" },
  { key: "rate_eur", code: "EUR", name: "Euro", note: "Chỉ quy đổi hiển thị" },
  { key: "rate_cny", code: "CNY", name: "Nhân dân tệ", note: "Chỉ quy đổi hiển thị" },
  { key: "rate_thb", code: "THB", name: "Baht Thái", note: "Chỉ quy đổi hiển thị" },
  { key: "rate_jpy", code: "JPY", name: "Yên Nhật", note: "Chỉ quy đổi hiển thị" },
  { key: "rate_krw", code: "KRW", name: "Won Hàn", note: "Chỉ quy đổi hiển thị" },
] as const;

/** Quản lý tiền tệ — tỉ giá quy đổi HIỂN THỊ cho khách chọn ngoại tệ ở nút Cài đặt.
 *  Tiền thật trong hệ thống luôn là VNĐ; tỉ giá ở đây chỉ đổi cách khách nhìn thấy giá. */
export default async function AdminCurrencyPage({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const s = await getSettings();
  return (
    <div>
      <PageHead title="Quản lý tiền tệ" desc="Tỉ giá quy đổi hiển thị khi khách đổi tiền tệ ở nút Cài đặt hiển thị. Số dư và thanh toán thật luôn tính bằng VNĐ." />
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form action={saveRatesAction} className="card p-6">
        <div className="font-bold text-slate-900">Tỉ giá: 1 đơn vị ngoại tệ = ? VNĐ</div>
        <div className="mt-4 grid gap-x-10 gap-y-4 lg:grid-cols-2">
          {CURRENCIES.map((c) => (
            <div key={c.key} className="grid grid-cols-[86px_1fr] items-center gap-3 sm:grid-cols-[86px_180px_1fr]">
              <div><span className="font-extrabold text-slate-800">{c.code}</span><div className="text-xs text-slate-400">{c.name}</div></div>
              <input className="inp" name={c.key} type="number" step="any" min="0" defaultValue={s[c.key] || ""} />
              <p className="text-xs text-slate-400">{c.note}</p>
            </div>
          ))}
        </div>
        <button className="btn-primary mt-6 !py-2.5 px-6">Lưu tỉ giá</button>
      </form>
    </div>
  );
}
