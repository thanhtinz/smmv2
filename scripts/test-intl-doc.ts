/**
 * Kiểm chứng Phase 2 cho PayPal + Stripe ở mức hợp đồng:
 *  A) Chặn fetch: Stripe create checkout KHÔNG gửi expires_at khi không
 *     truyền (giữ mặc định 24h theo tài liệu), CÓ gửi đúng expires_at khi
 *     truyền (luồng mua giỏ); PayPal create order + capture đều mang header
 *     PayPal-Request-Id theo tài liệu Orders v2; số tiền dạng chuỗi 2 số lẻ.
 *  B) API THẬT với thông tin giả: cả hai cổng phải trả lỗi trung thực
 *     (không treo, không "OK giả", không cộng tiền).
 * Chạy: npx tsx scripts/test-intl-doc.ts
 */
let pass = 0, fail = 0;
const check = (n: string, c: boolean, x = "") => { if (c) { pass++; console.log(`PASS  ${n}${x ? " — " + x : ""}`); } else { fail++; console.log(`FAIL  ${n}${x ? " — " + x : ""}`); } };

const realFetch = globalThis.fetch;
let captured: { url: string; method: string; headers: any; body: string }[] = [];
function stubFetch(mode: "stripe" | "paypal") {
  captured = [];
  globalThis.fetch = (async (url: any, init: any = {}) => {
    const u = String(url);
    const body = typeof init.body === "string" ? init.body : init.body instanceof URLSearchParams ? init.body.toString() : "";
    captured.push({ url: u, method: init.method || "GET", headers: init.headers || {}, body });
    const json = (obj: any, status = 200) => new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });
    if (mode === "stripe" && u.includes("/v1/checkout/sessions")) return json({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" });
    if (mode === "paypal" && u.includes("/v1/oauth2/token")) return json({ access_token: "tok_test", token_type: "Bearer", expires_in: 3600 });
    if (mode === "paypal" && u.endsWith("/v2/checkout/orders")) return json({ id: "ORDER123", status: "CREATED", links: [{ rel: "approve", href: "https://www.sandbox.paypal.com/checkoutnow?token=ORDER123" }] });
    if (mode === "paypal" && u.includes("/capture")) return json({ id: "ORDER123", status: "COMPLETED", purchase_units: [{ payments: { captures: [{ id: "CAP1", amount: { value: "10.00", currency_code: "USD" } }] } }] });
    if (mode === "paypal" && u.includes("/v2/checkout/orders/ORDER123")) return json({ id: "ORDER123", status: "APPROVED", purchase_units: [{ payments: { captures: [] } }] });
    return json({ error: "unexpected" }, 500);
  }) as any;
}

async function main() {
  const { stripeCreateCheckout, paypalAccessToken, paypalCreateOrder, paypalCaptureFlow, stripeTestConnection, paypalTestConnection } = await import("../src/lib/payments");

  // --- A1) Stripe: không truyền expiresAtSec -> KHÔNG có expires_at (mặc định 24h của Stripe)
  stubFetch("stripe");
  const s1 = await stripeCreateCheckout("sk_test_x", { amountCents: 1000, depositCode: "NAP1", successUrl: "https://x/ok", cancelUrl: "https://x/no" });
  const b1 = new URLSearchParams(captured[0].body);
  check("Stripe nạp ví: session tạo OK, KHÔNG gửi expires_at (mặc định 24h theo tài liệu)", s1.id === "cs_test_123" && !b1.has("expires_at"));
  // --- A2) Stripe: truyền expiresAtSec -> gửi đúng expires_at
  stubFetch("stripe");
  const expSec = Math.floor(Date.now() / 1000) + 31 * 60;
  await stripeCreateCheckout("sk_test_x", { amountCents: 1000, depositCode: "MUA1", successUrl: "https://x/ok", cancelUrl: "https://x/no", expiresAtSec: expSec });
  const b2 = new URLSearchParams(captured[0].body);
  check("Stripe mua giỏ: gửi expires_at đúng hạn phiên nội bộ đã kẹp 30ph–24h", b2.get("expires_at") === String(expSec), b2.get("expires_at") || "");

  // --- A3) PayPal: create mang PayPal-Request-Id = mã phiên; amount chuỗi 2 số lẻ
  stubFetch("paypal");
  const tok = await paypalAccessToken("cid", "sec", "sandbox");
  const ord = await paypalCreateOrder(tok, "sandbox", { amountUsd: "10.00", depositCode: "NAP100200", returnUrl: "https://x/return", cancelUrl: "https://x/cancel" });
  const createCall = captured.find((c) => c.url.endsWith("/v2/checkout/orders"));
  check("PayPal create: header PayPal-Request-Id = mã phiên (idempotency theo tài liệu)", createCall?.headers?.["PayPal-Request-Id"] === "NAP100200");
  const createBody = JSON.parse(createCall?.body || "{}");
  check("PayPal create: intent CAPTURE + amount.value chuỗi '10.00' USD + return_url", createBody.intent === "CAPTURE" && createBody.purchase_units?.[0]?.amount?.value === "10.00" && !!createBody.application_context?.return_url);
  check("PayPal create: lấy đúng link approve", ord.approveUrl.includes("token=ORDER123"));
  // --- A4) PayPal capture: PayPal-Request-Id = order id; COMPLETED đọc đúng cents
  const cap = await paypalCaptureFlow(tok, "sandbox", "ORDER123");
  const capCall = captured.find((c) => c.url.includes("/capture"));
  check("PayPal capture: header PayPal-Request-Id = order id", capCall?.headers?.["PayPal-Request-Id"] === "ORDER123");
  check("PayPal capture flow: APPROVED -> capture -> COMPLETED 1000 cents", cap.status === "COMPLETED" && cap.cents === 1000);

  // --- B) API thật, thông tin giả -> lỗi trung thực
  globalThis.fetch = realFetch;
  const stripeErr = await stripeTestConnection("sk_test_FAKE_000").then(() => "").catch((e: any) => String(e?.message || e));
  check("Stripe API thật + key giả -> lỗi trung thực từ Stripe", /invalid|stripe/i.test(stripeErr), stripeErr.slice(0, 90));
  const ppErr = await paypalTestConnection("fake_client", "fake_secret", "sandbox").then(() => "").catch((e: any) => String(e?.message || e));
  check("PayPal sandbox thật + creds giả -> lỗi trung thực", ppErr.length > 0, ppErr.slice(0, 90));

  console.log(fail === 0 ? `\nALL PASS (${pass})` : `\n${fail} FAIL / ${pass} PASS`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
