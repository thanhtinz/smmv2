import { requirePanelOwnerPage } from "@/lib/panel-access";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Stat, I } from "@/components/ui";
import { panelSaveRatesAction } from "@/app/actions/panel";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const CURS: { key: "rateUsd" | "rateEur" | "rateCny" | "rateThb" | "rateJpy" | "rateKrw"; code: string; label: string; setting: string; step: string }[] = [
  { key: "rateUsd", code: "USD", label: "Đô la Mỹ", setting: "usd_rate", step: "1" },
  { key: "rateEur", code: "EUR", label: "Euro", setting: "rate_eur", step: "1" },
  { key: "rateCny", code: "CNY", label: "Nhân dân tệ", setting: "rate_cny", step: "1" },
  { key: "rateThb", code: "THB", label: "Baht Thái", setting: "rate_thb", step: "1" },
  { key: "rateJpy", code: "JPY", label: "Yên Nhật", setting: "rate_jpy", step: "1" },
  { key: "rateKrw", code: "KRW", label: "Won Hàn", setting: "rate_krw", step: "0.1" },
];

/** Tiền tệ — như web mẹ nhưng là tỉ giá quy đổi HIỂN THỊ riêng của panel:
 *  khách của panel thấy giá quy đổi theo tỉ giá này; để trống ô nào thì ô đó dùng tỉ giá web mẹ. */
export default async function PanelCurrency({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  const { panel } = await requirePanelOwnerPage();
  const { L, Ld } = await getServerI18n((panel as { langConfig?: string | null }).langConfig ?? null);
  const s = await getSettings();
  return (
    <div>
      <PageHead title={L("Tiền tệ")} desc={L("Tỉ giá quy đổi hiển thị cho khách của panel (1 đơn vị ngoại tệ = bao nhiêu VNĐ). Chỉ là quy đổi HIỂN THỊ — tiền thật trong hệ thống luôn là VNĐ. Ô để trống sẽ dùng tỉ giá của web mẹ.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        {CURS.map((c) => (
          <Stat key={c.code} label={Ld(`1 ${c.code} = ?`)} value={panel[c.key] ? Ld(`${Number(panel[c.key]).toLocaleString("vi-VN")}đ (riêng panel)`) : Ld(`${Number(s[c.setting] || 0).toLocaleString("vi-VN")}đ (của web mẹ)`)} icon={I.money} tone="amber" />
        ))}
      </div>
      <form action={panelSaveRatesAction} className="card max-w-3xl space-y-4 p-6">
        <div className="font-bold text-slate-900">{L("Tỉ giá riêng của panel")}</div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {CURS.map((c) => (
            <div key={c.key}>
              <label className="lbl">{Ld(`${c.code} — ${L(c.label)} (VNĐ)`)}</label>
              <input className="inp" name={c.key} type="number" step={c.step} min={0} defaultValue={panel[c.key] || ""} placeholder={Ld(`Đang dùng của web mẹ: ${s[c.setting] || "—"}`)} />
            </div>
          ))}
        </div>
        <button className="btn-primary !py-2.5">{L("Lưu tỉ giá")}</button>
      </form>
    </div>
  );
}
