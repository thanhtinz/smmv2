import { prisma } from "@/lib/db";
import { requireAdminPage } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead, Flash, Badge } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { adminSaveMethodsAction, adminBoltPingAction, adminStripeTestAction, adminPaypalTestAction, adminSepayStatusAction, adminFetchRatesNowAction } from "@/app/actions/admin";
import { saveRatesAction } from "@/app/actions/admin-features";
import { getServerI18n } from "@/lib/lang-server";
import { fxCodesFromSettings, manualRateFor, autoRateFor, isFxLocked, fxMode, effectiveFxRate } from "@/lib/rates";

export const dynamic = "force-dynamic";

type TestLog = { at: string; ok: boolean; detail: string };
const parseTestLog = (raw?: string): TestLog | null => {
  try {
    const j = JSON.parse(raw || "");
    return j && j.at ? (j as TestLog) : null;
  } catch {
    return null;
  }
};

/** Dòng "lần kiểm tra gần nhất" dưới nút test của mỗi thẻ cổng (log lưu ở Settings). */
function TestLogLine({ raw, L, Ld }: { raw?: string; L: (t: string) => string; Ld: (t: string) => string }) {
  const log = parseTestLog(raw);
  if (!log) return null;
  return (
    <p className="text-xs leading-relaxed text-slate-400">
      {L("Lần kiểm tra gần nhất")}: {new Date(log.at).toLocaleString("vi-VN")} ·{" "}
      <b className={log.ok ? "text-emerald-600" : "text-rose-600"}>{log.ok ? L("Đạt") : L("Chưa đạt")}</b>
      {log.detail ? ` — ${Ld(log.detail)}` : ""}
    </p>
  );
}

/** Cặp tick mục đích của 1 method: "Nạp vào ví" (= setting *_enabled cũ) và
 *  "Thanh toán trực tiếp" (= direct_*_enabled). Hai tick ĐỘC LẬP: method có
 *  thể phục vụ một hoặc cả hai mục đích; cả hai tắt = method không dùng nữa. */
function PurposeTicks({ walletKey, walletOn, directKey, directOn, walletDesc, directDesc, L }: {
  walletKey: string; walletOn: boolean; directKey: string; directOn: boolean;
  walletDesc: string; directDesc: string; L: (t: string) => string;
}) {
  const box = "flex cursor-pointer items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3";
  const cb = "mt-0.5 h-5 w-5 shrink-0 accent-brand-600";
  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      <label className={box}>
        <input type="hidden" name={`${walletKey}_present`} value="1" />
        <input type="checkbox" name={walletKey} value="1" defaultChecked={walletOn} className={cb} />
        <span>
          <span className="block text-sm font-bold text-slate-800">{L("Nạp vào ví")}</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-slate-500">{walletDesc}</span>
        </span>
      </label>
      <label className={box}>
        <input type="hidden" name={`${directKey}_present`} value="1" />
        <input type="checkbox" name={directKey} value="1" defaultChecked={directOn} className={cb} />
        <span>
          <span className="block text-sm font-bold text-slate-800">{L("Thanh toán trực tiếp")}</span>
          <span className="mt-0.5 block text-[13px] leading-relaxed text-slate-500">{directDesc}</span>
        </span>
      </label>
    </div>
  );
}

const fmtRate = (v: number) => (v > 0 ? v.toLocaleString("vi-VN") : "—");

/** Cấu hình các phương thức nạp tiền của web mẹ: SePay (ngân hàng/MoMo), USDT, PayPal, Stripe. */
export default async function AdminMethodConfig({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const s = await getSettings();
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn";
  const banks = await prisma.bankAccount.findMany({ where: { active: true }, orderBy: { id: "asc" } });
  const back = "/admin/cau-hinh-nap-tien";
  // Lần webhook SePay gần nhất hệ thống nhận được (cho khối trạng thái trung thực)
  const lastHookLog = await prisma.apiLog.findFirst({ where: { kind: "webhook" }, orderBy: { id: "desc" }, select: { createdAt: true } });
  const lastReceipt = await prisma.webhookReceipt.findFirst({ orderBy: { id: "desc" }, select: { createdAt: true } });
  const lastSepayAt = lastHookLog?.createdAt || lastReceipt?.createdAt || null;
  const fxCodes = fxCodesFromSettings(s);
  const directOnNames = [
    s.direct_sepay_enabled === "1" ? "SePay" : null,
    s.direct_boltutil_enabled === "1" ? "BoltUtil" : null,
    s.direct_stripe_enabled === "1" ? "Stripe" : null,
    s.direct_paypal_enabled === "1" ? "PayPal" : null,
  ].filter(Boolean) as string[];
  return (
    <div>
      <PageHead title={L("Cấu hình nạp tiền")} desc={L("Bật/tắt và cấu hình từng phương thức nạp tiền của hệ thống.")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <div className="grid items-start gap-6 xl:grid-cols-2">
        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">{L("QR ngân hàng (SePay)")}</div>
            {s.sepay_secret ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đã có secret")}</Badge> : <Badge cls="bg-rose-100 text-rose-700">{L("Chưa có secret")}</Badge>}
          </div>
          <p className="text-sm text-slate-500">{L("Ngân hàng và MoMo dùng chung kênh này — khách chuyển đúng nội dung là tiền cộng tự động.")}</p>
          <div>
            <label className="lbl">{L("Webhook URL (dán vào SePay)")}</label>
            <div className="flex items-center gap-2">
              <input className="inp font-mono !text-xs" readOnly value={`${base}/api/webhooks/sepay`} />
              <CopyBtn text={`${base}/api/webhooks/sepay`} />
            </div>
          </div>
          <div>
            <label className="lbl">{L("Secret webhook (API Key của SePay)")} {s.sepay_secret && <span className="font-semibold text-emerald-600">{L("— đã lưu")}</span>}</label>
            <input className="inp" name="sepay_secret" type="password" autoComplete="off" placeholder={s.sepay_secret ? L("Để trống = giữ nguyên") : L("Dán API Key từ SePay vào đây")} />
          </div>
          <PurposeTicks
            walletKey="sepay_enabled" walletOn={s.sepay_enabled !== "0"}
            directKey="direct_sepay_enabled" directOn={s.direct_sepay_enabled === "1"}
            walletDesc={L("Hiện QR ngân hàng & MoMo ở trang nạp tiền.")}
            directDesc={L("Khách mua giỏ hàng trả thẳng bằng QR này (nội dung chứa mã phiên mua), không qua ví.")}
            L={L}
          />
          <div className="rounded-xl bg-slate-50 px-3.5 py-3">
            <div className="text-sm font-bold text-slate-800">{L("Trạng thái webhook")}</div>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{L("SePay không có API gọi thử tương đương cho secret webhook — kiểm tra ở đây chỉ đối chiếu URL webhook ở trên và lần webhook gần nhất hệ thống nhận được, không giả vờ đã gọi thử SePay.")}</p>
            <p className="mt-1.5 text-[13px] text-slate-500">
              {L("Webhook gần nhất")}: <b className="text-slate-700">{lastSepayAt ? new Date(lastSepayAt).toLocaleString("vi-VN") : L("Chưa nhận webhook nào")}</b>
            </p>
            <TestLogLine raw={s.gateway_test_sepay} L={L} Ld={Ld} />
          </div>
          <p className="text-sm text-slate-500">
            {L("Đang có") + " " + banks.length + " " + L("tài khoản nhận tiền") + (banks.length ? `: ${banks.map((b) => b.bankName).join(", ")}` : "") + " " + L("— quản lý ở trang Ngân hàng.")}
          </p>
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-500">{L("Khách ghi đúng nội dung chứa mã nạp thì hệ thống tự đối soát và cộng tiền trong vài phút; sai nội dung sẽ chờ duyệt tay ở trang Quản lý nạp tiền.")}</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary !py-2.5">{L("Lưu SePay")}</button>
            <button formAction={adminSepayStatusAction} className="btn-ghost !py-2.5" title={L("Đối chiếu URL webhook và lần webhook gần nhất nhận được")}>{L("Kiểm tra trạng thái webhook")}</button>
            <a href="/admin/ngan-hang" className="btn-ghost !py-2.5">{L("Mở trang Ngân hàng")}</a>
          </div>
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">USDT qua BoltUtil</div>
            {s.boltutil_enabled === "1" ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đang bật")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Đang tắt")}</Badge>}
          </div>
          <div><label className="lbl">{L("API key (X-Bolt-Key)")}</label><input className="inp" type="password" name="boltutil_api_key" placeholder={s.boltutil_api_key ? "•••••••• (đã đặt — nhập để thay)" : "bolt_..."} autoComplete="off" /></div>
          <div><label className="lbl">{L("Webhook secret (khoá ký HMAC)")}</label><input className="inp" type="password" name="boltutil_webhook_secret" placeholder={s.boltutil_webhook_secret ? "•••••••• (đã đặt — nhập để thay)" : "whsec_..."} autoComplete="off" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="lbl">{L("Mạng mặc định")}</label>
              <select className="inp" name="boltutil_default_network" defaultValue={s.boltutil_default_network || "TRON"}>
                {["TRON", "BSC", "ETHEREUM", "SOLANA", "ARBITRUM", "BASE"].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div><label className="lbl">{L("Phiên hết hạn sau (phút)")}</label><input className="inp" name="boltutil_expires_minutes" type="number" min={5} max={60} defaultValue={s.boltutil_expires_minutes || "30"} /></div>
          </div>
          <div>
            <label className="lbl">{L("Các mạng cho phép nạp")}</label>
            <input type="hidden" name="boltutil_networks_present" value="1" />
            <div className="flex flex-wrap gap-2">
              {([
                { code: "TRON", name: "Tron" },
                { code: "ETHEREUM", name: "Ethereum" },
                { code: "BSC", name: "BNB Chain" },
                { code: "ARBITRUM", name: "Arbitrum" },
                { code: "BASE", name: "Base" },
                { code: "SOLANA", name: "Solana" },
              ] as const).map((n) => {
                const selected = String(s.boltutil_networks || "TRON").split(",").map((x) => x.trim().toUpperCase()).includes(n.code);
                return (
                  <label key={n.code} className="cursor-pointer">
                    <input type="checkbox" name="boltutil_networks" value={n.code} defaultChecked={selected} className="peer sr-only" />
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-500 transition peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white">
                      <span className="font-extrabold tracking-wide">{n.code}</span>
                      <span className="font-medium opacity-70">· {n.name}</span>
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{L("Bấm để chọn — không cần gõ tay mã mạng. Chỉ hiện các mạng đã cấu hình ví nhận trong dashboard BoltUtil.")}</p>
          </div>
          <div>
            <label className="lbl">{L("Cách khách trả USDT")}</label>
            <select className="inp" name="boltutil_payment_method" defaultValue={s.boltutil_payment_method || "MANUAL_TRANSFER"}>
              <option value="MANUAL_TRANSFER">{L("Chuyển khoản thủ công tới địa chỉ ví hiển thị")}</option><option value="WALLET">{L("Trang thanh toán BoltUtil")}</option>
            </select>
            <p className="mt-1 text-xs text-slate-400">{L("Thủ công: khách tự chuyển USDT tới địa chỉ ví hiện ở bước thanh toán. Trang BoltUtil: khách được đưa sang trang thanh toán của BoltUtil để trả.")}</p>
          </div>
          <div>
            <label className="lbl">{L("URL webhook (dán vào BoltUtil → Integrations → API)")}</label>
            <input className="inp" readOnly value="https://smmv2-zeta.vercel.app/api/webhooks/boltutil" />
          </div>
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-500">{L("BoltUtil không giữ tiền — USDT về thẳng ví nhận đã cấu hình trong dashboard BoltUtil; tiền cộng cho khách theo số thực nhận khi giao dịch đủ xác nhận.")}</p>
          <PurposeTicks
            walletKey="boltutil_enabled" walletOn={s.boltutil_enabled === "1"}
            directKey="direct_boltutil_enabled" directOn={s.direct_boltutil_enabled === "1"}
            walletDesc={L("Hiện nạp USDT ở trang nạp tiền.")}
            directDesc={L("Khách mua giỏ hàng trả thẳng bằng USDT qua BoltUtil (mạng mặc định ở trên), không qua ví.")}
            L={L}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary !py-2.5">{L("Lưu BoltUtil")}</button>
            <button formAction={adminBoltPingAction} className="btn-ghost !py-2.5" title={L("Gọi thử endpoint ping bằng API key và khoá ký ở trên (hoặc đã lưu)")}>{L("Kiểm tra kết nối")}</button>
          </div>
          <TestLogLine raw={s.gateway_test_boltutil} L={L} Ld={Ld} />
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">PayPal</div>
            {s.paypal_enabled === "1" ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đang bật")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Đang tắt")}</Badge>}
          </div>
          <div><label className="lbl">Client ID</label><input className="inp" name="paypal_client_id" defaultValue={s.paypal_client_id} /></div>
          <div><label className="lbl">Client Secret</label><input className="inp" name="paypal_client_secret" type="password" autoComplete="off" placeholder={s.paypal_client_secret ? L("Để trống = giữ nguyên") : ""} /></div>
          <div>
            <label className="lbl">{L("Môi trường")}</label>
            <select className="inp" name="paypal_mode" defaultValue={s.paypal_mode}>
              <option value="sandbox">{L("Sandbox (thử nghiệm)")}</option><option value="live">{L("Live (thật)")}</option>
            </select>
          </div>
          <p className="rounded-xl bg-slate-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-slate-500">{L("Lấy Client ID / Secret tại PayPal Developer → Apps & Credentials, chọn đúng môi trường khớp ô Môi trường ở trên. PayPal không cần cấu hình webhook.")}</p>
          <PurposeTicks
            walletKey="paypal_enabled" walletOn={s.paypal_enabled === "1"}
            directKey="direct_paypal_enabled" directOn={s.direct_paypal_enabled === "1"}
            walletDesc={L("Hiện PayPal ở trang nạp tiền.")}
            directDesc={L("Khách mua giỏ hàng trả thẳng qua PayPal, không qua ví.")}
            L={L}
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary !py-2.5">{L("Lưu PayPal")}</button>
            <button formAction={adminPaypalTestAction} className="btn-ghost !py-2.5" title={L("Xin thử access token OAuth bằng Client ID/Secret ở trên (hoặc đã lưu)")}>{L("Kiểm tra kết nối")}</button>
          </div>
          <TestLogLine raw={s.gateway_test_paypal} L={L} Ld={Ld} />
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6">
          <input type="hidden" name="back" value={back} />
          <div className="flex items-center justify-between">
            <div className="font-bold text-slate-900">Stripe</div>
            {s.stripe_enabled === "1" ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Đang bật")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Đang tắt")}</Badge>}
          </div>
          <div><label className="lbl">Publishable Key (pk_...)</label><input className="inp" name="stripe_publishable_key" defaultValue={s.stripe_publishable_key} /></div>
          <div><label className="lbl">Secret Key (sk_...)</label><input className="inp" name="stripe_secret_key" type="password" autoComplete="off" placeholder={s.stripe_secret_key ? L("Để trống = giữ nguyên") : ""} /></div>
          <div><label className="lbl">Webhook Secret (whsec_...)</label><input className="inp" name="stripe_webhook_secret" type="password" autoComplete="off" placeholder={s.stripe_webhook_secret ? L("Để trống = giữ nguyên") : ""} /></div>
          <div>
            <label className="lbl">{L("Webhook URL (dán vào Stripe)")}</label>
            <div className="flex items-center gap-2">
              <input className="inp font-mono !text-xs" readOnly value={`${base}/api/webhooks/stripe`} />
              <CopyBtn text={`${base}/api/webhooks/stripe`} />
            </div>
          </div>
          <PurposeTicks
            walletKey="stripe_enabled" walletOn={s.stripe_enabled === "1"}
            directKey="direct_stripe_enabled" directOn={s.direct_stripe_enabled === "1"}
            walletDesc={L("Hiện Stripe ở trang nạp tiền.")}
            directDesc={L("Khách mua giỏ hàng trả thẳng qua Stripe Checkout, không qua ví.")}
            L={L}
          />
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary !py-2.5">{L("Lưu Stripe")}</button>
            <button formAction={adminStripeTestAction} className="btn-ghost !py-2.5" title={L("Gọi thử API số dư Stripe bằng Secret Key ở trên (hoặc key đã lưu)")}>{L("Kiểm tra kết nối")}</button>
          </div>
          <TestLogLine raw={s.gateway_test_stripe} L={L} Ld={Ld} />
        </form>

        <form action={adminSaveMethodsAction} className="card space-y-4 p-6 xl:col-span-2">
          <input type="hidden" name="back" value={back} />
          <div className="font-bold text-slate-900">{L("Thanh toán trực tiếp ở giỏ hàng")}</div>
          <p className="text-sm text-slate-500">{L("Khách chọn trả thẳng bằng cổng ở bước xác nhận của giỏ — đơn chỉ được tạo sau khi cổng xác nhận đã trả tiền.")}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="lbl">{L("Thời hạn chờ thanh toán (phút)")}</label>
              <input className="inp" name="purchase_payment_expires_minutes" type="number" min={5} max={120} defaultValue={s.purchase_payment_expires_minutes || "30"} />
              <p className="mt-1 text-xs text-slate-400">{L("Hết hạn mà chưa trả: không tạo đơn nào, giỏ hàng giữ nguyên, ví không bị trừ.")}</p>
            </div>
            <div>
              <label className="lbl">{L("Đang mở thanh toán trực tiếp")}</label>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {directOnNames.length ? directOnNames.map((n) => <Badge key={n} cls="bg-brand-50 text-brand-700">{n}</Badge>) : <span className="text-sm text-slate-400">{L("Chưa mở cổng nào — tick “Thanh toán trực tiếp” ở thẻ của từng cổng.")}</span>}
              </div>
            </div>
          </div>
          <div>
            <button className="btn-primary !py-2.5">{L("Lưu cài đặt thanh toán trực tiếp")}</button>
          </div>
        </form>

        <form action={saveRatesAction} className="card space-y-4 p-6 xl:col-span-2">
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="rates_form_full" value="1" />
          <input type="hidden" name="fx_codes" value={fxCodes.join(",")} />
          <div className="font-bold text-slate-900">{L("Tỉ giá & tiền tệ")}</div>
          <p className="text-sm text-slate-500">{L("Tỉ giá quy đổi VNĐ cho nạp quốc tế (PayPal/Stripe theo USD, BoltUtil theo USDT) và cho hiển thị ngoại tệ phía khách. Tiền thật trong hệ thống luôn là VNĐ.")}</p>
          <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-[13px] leading-relaxed text-amber-800">{L("Giới hạn nguồn: cả hai nguồn tỉ giá tự động đều là tỉ giá tham chiếu theo NGÀY (tổng hợp từ ngân hàng trung ương), không phải giá thị trường theo phút.")}</p>
          <div>
            <div className="hidden gap-3 border-b border-slate-100 pb-2 text-xs font-bold uppercase tracking-wide text-slate-400 md:grid md:grid-cols-[110px_1fr_1fr_90px_1fr]">
              <span>{L("Tiền tệ")}</span><span>{L("Tỉ giá tay (VNĐ)")}</span><span>{L("Tỉ giá tự động gần nhất")}</span><span>{L("Khoá tay")}</span><span>{L("Đang dùng")}</span>
            </div>
            {fxCodes.map((code) => {
              const manual = manualRateFor(s, code);
              const auto = autoRateFor(s, code);
              const mode = fxMode(s, code);
              const eff = effectiveFxRate(s, code);
              const autoAt = s[`fx_auto_at_${code.toLowerCase()}`];
              const note = code === "USD" ? L("Nạp PayPal / Stripe") : code === "USDT" ? L("Nạp BoltUtil") : L("Chỉ quy đổi hiển thị");
              return (
                <div key={code} className="grid gap-3 border-b border-slate-100 py-3 md:grid-cols-[110px_1fr_1fr_90px_1fr] md:items-center">
                  <div>
                    <span className="font-extrabold tracking-wide text-slate-900">{code}</span>
                    <span className="block text-xs text-slate-400">{note}</span>
                  </div>
                  <div>
                    <label className="lbl md:hidden">{L("Tỉ giá tay (VNĐ)")}</label>
                    <input className="inp" name={`fx_manual_${code}`} type="number" step="any" min={0} defaultValue={code === "USDT" && !s.fx_manual_usdt ? "" : manual || ""} placeholder={code === "USDT" ? L("Trống = theo USD") : undefined} />
                  </div>
                  <div className="text-sm text-slate-600">
                    <span className="font-semibold text-slate-800">{fmtRate(auto)}</span>
                    <span className="block text-xs text-slate-400">{autoAt ? `${L("Cập nhật lần cuối")}: ${new Date(autoAt).toLocaleString("vi-VN")}` : L("Chưa cập nhật lần nào")}</span>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
                    <input type="checkbox" name={`fx_lock_${code}`} value="1" defaultChecked={isFxLocked(s, code)} className="h-5 w-5 accent-brand-600" />
                    {L("Khoá tay")}
                  </label>
                  <div className="flex items-center gap-2 text-sm">
                    <b className="text-slate-900">{fmtRate(eff)}đ</b>
                    {mode === "auto" ? <Badge cls="bg-emerald-100 text-emerald-800">{L("Tự động")}</Badge> : <Badge cls="bg-slate-100 text-slate-500">{L("Tay")}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="lbl">{L("Biên an toàn khi cộng tiền nạp (%)")}</label>
              <input className="inp" name="fx_safety_margin_percent" type="number" step="0.1" min={0} max={50} defaultValue={s.fx_safety_margin_percent || "1"} />
              <p className="mt-1 text-xs leading-relaxed text-slate-400">{L("Chỉ áp khi tỉ giá đang dùng là tỉ giá TỰ ĐỘNG và tiền tệ không khoá tay: VNĐ được cộng = số tiền ngoại tệ × tỉ giá × (1 − biên/100) — khách được cộng ít hơn một chút để bù độ trôi của tỉ giá tham chiếu theo ngày. Tỉ giá tay/khoá tay dùng đúng số đã nhập, không trừ biên. Trang nạp của khách luôn hiển thị tỉ giá sau biên — đúng tỉ giá sẽ được cộng.")}</p>
            </div>
            <div>
              <label className="lbl">{L("Số tiền nạp quốc tế tối thiểu (USD)")}</label>
              <input className="inp" name="intl_min_usd" type="number" min={1} defaultValue={s.intl_min_usd} />
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3.5">
            <label className="flex cursor-pointer items-start gap-3">
              <input type="checkbox" name="rates_auto_enabled" defaultChecked={s.rates_auto_enabled === "1"} className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600" />
              <span>
                <span className="block text-sm font-bold text-slate-800">{L("Tự động cập nhật tỉ giá thị trường")}</span>
                <span className="mt-0.5 block text-[13px] leading-relaxed text-slate-500">{L("Khi bật, vòng đồng bộ (cron) tự kéo tỉ giá về; tiền tệ nào khoá tay thì không bị ghi đè, đồng nào nguồn không có dữ liệu thì giữ nguyên. Khi tắt, tỉ giá tay là tỉ giá hiệu lực.")}</span>
              </span>
            </label>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-slate-500">
              <span>{L("Nguồn chính")}: <b className="text-slate-700">Frankfurter v2 (api.frankfurter.dev, gốc USD)</b></span>
              <span>{L("Nguồn dự phòng")}: <b className="text-slate-700">open.er-api.com (ExchangeRate-API, gốc USD)</b></span>
              <span>{L("Nguồn đã dùng lần gần nhất")}: <b className="text-slate-700">{s.rates_auto_source ? Ld(s.rates_auto_source) : "—"}</b></span>
              <span>{L("Cập nhật lần cuối")}: <b className="text-slate-700">{s.rates_auto_updated_at ? new Date(s.rates_auto_updated_at).toLocaleString("vi-VN") : L("Chưa cập nhật lần nào")}</b></span>
            </div>
            {s.rates_auto_error ? (
              <p className="mt-2 text-[13px] text-rose-600">{L("Lỗi cập nhật gần nhất")}: {Ld(s.rates_auto_error)}</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div>
              <label className="lbl">{L("Thêm tiền tệ — mã 3 chữ cái")}</label>
              <input className="inp uppercase" name="fx_new_code" maxLength={3} placeholder="GBP" autoComplete="off" />
            </div>
            <div>
              <label className="lbl">{L("Tỉ giá tay (VNĐ)")}</label>
              <input className="inp" name="fx_new_rate" type="number" step="any" min={0} placeholder="32000" />
            </div>
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" name="fx_new_lock" value="1" className="h-5 w-5 accent-brand-600" />
              {L("Khoá tay")}
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary !py-2.5">{L("Lưu tỉ giá")}</button>
            <button formAction={adminFetchRatesNowAction} className="btn-ghost !py-2.5" title={L("Kéo tỉ giá thị trường về ngay, không chờ cron")}>{L("Cập nhật ngay")}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
