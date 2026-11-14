import { prisma } from "./db";
import { decryptSecret } from "./secret-box";
import { fzrBalance, decimalToNumber } from "./fzr";
import type { Provider } from "@prisma/client";

/**
 * Client đấu API nhà cung cấp NGUỒN HÀNG PREMIUM:
 * - Số dư nhà cung cấp (mọi driver): FZR qua lib/fzr; nhà cung cấp chuẩn
 *   SMM API v2 (kiểu ThaTim) qua POST {apiUrl} key=...&action=balance.
 * - API mua sản phẩm kiểu ThaTim: action=category|buy|history (phần cuối file).
 * Phần client dịch vụ SMM (services/add/status/cancel/refill) đã gỡ khỏi web
 * này (lệnh Tín 2026-11-12 — web tách thành Digital Shop thuần, SMM làm web
 * riêng); code cũ còn trong git history.
 */

async function call<T = any>(provider: Provider, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ key: decryptSecret(provider.apiKey), ...params });
  const res = await fetch(provider.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Provider trả về dữ liệu không hợp lệ (HTTP ${res.status})`);
  }
  if (json?.error) throw new Error(String(json.error));
  return json as T;
}

export async function providerBalance(provider: Provider): Promise<{ raw: number; vnd: number; currency: string }> {
  if (provider.driver === "FZR") {
    // FazerCards: GET /api/v2/balance — số dư USD dạng chuỗi thập phân
    const fb = await fzrBalance(provider);
    const raw = decimalToNumber(fb.balance);
    const vnd = Math.round(raw * provider.exchangeRate);
    await prisma.provider.update({ where: { id: provider.id }, data: { balanceCache: vnd } });
    return { raw, vnd, currency: fb.currency || "USD" };
  }
  const r = await call<{ balance: string; currency: string }>(provider, { action: "balance" });
  const raw = parseFloat(r.balance || "0");
  const vnd = Math.round(raw * provider.exchangeRate);
  await prisma.provider.update({ where: { id: provider.id }, data: { balanceCache: vnd } });
  return { raw, vnd, currency: r.currency || provider.currency };
}

/* =====================================================================
 * API MUA SẢN PHẨM (Premium) kiểu ThaTim — endpoint RIÊNG /api/product
 * (không phải /api/v2 của SMM), hỗ trợ GET/POST form, cùng API key:
 *   action=category -> {status, data:[{id,name,slug,...,products:[{product_id,
 *                      product_name, time_data:[{cycle_id, cycle (nhãn), price,
 *                      original_price, description}]}]}]}
 *   action=buy      -> product=<product_id>, cycle=<số tháng>, note=<thông tin giao>
 *                      trả {status, data:{order_id, order_code, total}}
 *   action=history  -> page/limit/status/product_id; mỗi mục có order_code,
 *                      status (pending|processing|completed|cancelled|failed|
 *                      refunded) và "data" = dữ liệu bàn giao khi hoàn thành.
 * (Đã đối chiếu tài liệu + trang api-docs thật của thatim.vn ngày 2026-11-04.)
 * ===================================================================== */

/** Suy endpoint sản phẩm từ apiUrl SMM: .../api/v2 -> .../api/product.
 *  Nếu admin dán thẳng link sản phẩm (.../api/product) thì dùng nguyên —
 *  tránh lỗi suy thành .../api/product/api/product (404) như ca Thatim 2026-11-13. */
export function productEndpoint(provider: Provider): string {
  const u = provider.apiUrl.replace(/\/+$/, "");
  if (u.endsWith("/api/product")) return u;
  if (u.endsWith("/api/v2")) return `${u.slice(0, -"/v2".length)}/product`;
  if (u.endsWith("/api")) return `${u}/product`;
  return `${u}/api/product`;
}

async function callProduct<T = any>(provider: Provider, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ key: decryptSecret(provider.apiKey), ...params });
  const res = await fetch(productEndpoint(provider), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Provider (sản phẩm) trả về dữ liệu không hợp lệ (HTTP ${res.status})`);
  }
  if (json?.error) throw new Error(String(json.error));
  if (json?.status && json.status !== "success") throw new Error(String(json.message || "Provider báo lỗi"));
  return json as T;
}

export async function providerProductCategoriesRaw(provider: Provider): Promise<any> {
  return callProduct<any>(provider, { action: "category" });
}

export async function providerBuyProduct(
  provider: Provider,
  providerProductId: string,
  cycle: number,
  note: string
): Promise<{ orderCode: string; raw: any }> {
  const r = await callProduct<any>(provider, {
    action: "buy",
    product: providerProductId,
    cycle: String(cycle),
    note: note || "",
  });
  const orderCode = r?.data?.order_code || r?.order_code || r?.orderCode || r?.code || r?.order || r?.data?.order_id || r?.id;
  if (!orderCode) throw new Error("Provider không trả order_code cho đơn sản phẩm");
  return { orderCode: String(orderCode), raw: r };
}

/** Lịch sử mua sản phẩm phía provider (action=history, có phân trang + lọc) */
export async function providerProductHistory(
  provider: Provider,
  opts: { productId?: string; page?: number; limit?: number; status?: string } = {}
): Promise<any> {
  const params: Record<string, string> = { action: "history", page: String(opts.page ?? 1), limit: String(opts.limit ?? 50) };
  if (opts.productId) params.product_id = opts.productId;
  if (opts.status) params.status = opts.status;
  return callProduct<any>(provider, params);
}

/** Tìm 1 đơn premium trong history phía provider theo order_code (lật tối đa maxPages trang) */
export async function findPremiumOrderInHistory(
  provider: Provider,
  providerProductId: string | undefined,
  orderCode: string,
  maxPages = 5
): Promise<any | null> {
  for (let page = 1; page <= maxPages; page++) {
    const raw = await providerProductHistory(provider, { productId: providerProductId, page, limit: 50 });
    const found = findHistoryEntry(raw, orderCode);
    if (found) return found;
    const lastPage = Number(raw?.pagination?.last_page ?? page);
    if (page >= lastPage) break;
  }
  return null;
}

export type NormalizedProduct = {
  providerProductId: string;
  name: string;
  categoryName: string;
  variants: { cycle: number; priceRaw: number; label?: string }[];
};

/** Nhãn chu kỳ kiểu ThaTim ("1 Tháng", "1 Năm", "23 Ngày") -> số tháng để gọi action=buy */
export function parseCycleMonths(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Math.round(v);
  const s = String(v).toLowerCase();
  const num = parseFloat(s.replace(",", "."));
  if (isNaN(num)) return 0;
  if (s.includes("năm") || s.includes("year")) return Math.round(num * 12);
  if (s.includes("ngày") || s.includes("ngay") || s.includes("day")) return Math.max(1, Math.round(num / 30));
  return Math.round(num);
}

export function normalizeProducts(raw: any): NormalizedProduct[] {
  const out: NormalizedProduct[] = [];
  const pushProduct = (p: any, categoryName: string) => {
    if (!p || (p.id === undefined && p.product_id === undefined)) return;
    const variants: { cycle: number; priceRaw: number; label?: string }[] = [];
    const pushVar = (cycle: any, price: any, label?: string) => {
      const c = parseCycleMonths(cycle);
      const pr = parseFloat(String(price));
      if (c > 0 && pr > 0) variants.push({ cycle: c, priceRaw: pr, label });
    };
    const arr = p.time_data || p.cycles || p.plans || p.prices || p.durations || p.packages;
    if (Array.isArray(arr)) {
      for (const v of arr) {
        if (typeof v === "object") {
          pushVar(v.cycle ?? v.months ?? v.duration ?? v.time, v.price ?? v.rate ?? v.amount, typeof v.cycle === "string" ? v.cycle : undefined);
        }
      }
    }
    for (const k of Object.keys(p)) {
      const m = k.match(/(?:price|cycle|month)[_\-]?(\d{1,2})$/i);
      if (m && (typeof p[k] === "number" || /^\d+$/.test(String(p[k])))) pushVar(m[1], p[k]);
    }
    if (variants.length === 0 && (p.price !== undefined || p.rate !== undefined)) {
      pushVar(p.cycle ?? p.months ?? p.duration ?? 1, p.price ?? p.rate);
    }
    if (!variants.length) return;
    const dedup = new Map<number, { cycle: number; priceRaw: number; label?: string }>();
    for (const v of variants) if (!dedup.has(v.cycle)) dedup.set(v.cycle, v);
    out.push({
      providerProductId: String(p.id ?? p.product_id),
      name: String(p.product_name || p.name || p.title || `Sản phẩm ${p.id ?? p.product_id}`),
      categoryName: String(p.category || p.category_name || categoryName || "Sản phẩm khác"),
      variants: Array.from(dedup.values()).sort((a, b) => a.cycle - b.cycle),
    });
  };
  const walk = (node: any, categoryName = "") => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, categoryName);
      return;
    }
    if (typeof node === "object") {
      const children = node.products || node.items || node.list;
      if (Array.isArray(children)) {
        const catName = String(node.name || node.title || categoryName || "Sản phẩm khác");
        for (const p of children) pushProduct(p, catName);
        return;
      }
      if (node.data || node.categories) {
        walk(node.data || node.categories, categoryName);
        return;
      }
      pushProduct(node, categoryName);
    }
  };
  walk(raw);
  return out;
}

export function findHistoryEntry(raw: any, orderCode: string): any | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw.find((x) => String(x?.order_code || x?.code || x?.id) === orderCode) || null;
  if (typeof raw === "object") {
    if (raw[orderCode]) return raw[orderCode];
    if (Array.isArray(raw.data)) return findHistoryEntry(raw.data, orderCode);
    if (raw.order_code && String(raw.order_code) === orderCode) return raw;
    for (const v of Object.values(raw)) {
      const f = findHistoryEntry(v, orderCode);
      if (f) return f;
    }
  }
  return null;
}

export function extractDelivery(entry: any): { delivery?: string; status?: string } {
  if (!entry || typeof entry !== "object") return {};
  const delivery =
    entry.delivery || entry.product_data || entry.data || entry.account || entry.accounts ||
    entry.info || entry.content || entry.result || entry.note_result || undefined;
  return {
    delivery: delivery !== undefined ? (typeof delivery === "string" ? delivery : JSON.stringify(delivery)) : undefined,
    status: entry.status ? String(entry.status) : undefined,
  };
}

export async function syncProviderPremium(provider: Provider) {
  const raw = await providerProductCategoriesRaw(provider);
  const products = normalizeProducts(raw);
  let created = 0,
    updated = 0,
    variantCount = 0;
  const catCache = new Map<string, number>();
  async function categoryId(name: string): Promise<number> {
    if (catCache.has(name)) return catCache.get(name)!;
    const slug =
      name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "khac";
    let cat = await prisma.premiumCategory.findFirst({ where: { name } });
    if (!cat) cat = await prisma.premiumCategory.create({ data: { name, slug: `${slug}-${provider.id}` } });
    catCache.set(name, cat.id);
    return cat.id;
  }
  for (const p of products) {
    const catId = await categoryId(p.categoryName);
    const existing = await prisma.premiumProduct.findFirst({
      where: { providerId: provider.id, providerProductId: p.providerProductId },
    });
    let productId: number;
    if (existing) {
      await prisma.premiumProduct.update({ where: { id: existing.id }, data: { name: p.name, categoryId: catId, fulfillment: "API" } });
      productId = existing.id;
      updated++;
    } else {
      const np = await prisma.premiumProduct.create({
        data: {
          categoryId: catId,
          name: p.name,
          slug: `sp-${provider.id}-${p.providerProductId}`.replace(/[^a-zA-Z0-9-]/g, "-"),
          tagline: `Cung cấp tự động qua ${provider.name}`,
          fulfillment: "API",
          providerId: provider.id,
          providerProductId: p.providerProductId,
        },
      });
      productId = np.id;
      created++;
    }
    for (const v of p.variants) {
      const costVnd = Math.ceil(v.priceRaw * provider.exchangeRate);
      const sell = Math.ceil(costVnd * (1 + provider.markupPercent / 100));
      const ev = await prisma.premiumVariant.findFirst({ where: { productId, providerCycle: v.cycle } });
      const data = {
        productId,
        name: v.label?.trim() || (v.cycle >= 12 && v.cycle % 12 === 0 ? `${v.cycle / 12} năm` : `${v.cycle} tháng`),
        price: sell,
        cost: costVnd,
        warrantyDays: 0,
        providerCycle: v.cycle,
      };
      if (ev) await prisma.premiumVariant.update({ where: { id: ev.id }, data });
      else await prisma.premiumVariant.create({ data });
      variantCount++;
    }
  }
  await prisma.apiLog.create({
    data: { kind: "provider_sync", ref: provider.name, detail: `premium created=${created} updated=${updated} variants=${variantCount} total=${products.length}` },
  });
  return { created, updated, variants: variantCount, total: products.length };
}
