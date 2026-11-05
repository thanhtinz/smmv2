import { prisma } from "./db";
import type { Provider } from "@prisma/client";

/**
 * Client đấu API nhà cung cấp theo chuẩn SMM API v2 (Perfect Panel / ThaTim / slike...):
 *   POST {apiUrl}  key=...&action=services|balance|add|status|cancel|refill|refill_status
 * Kèm API mua sản phẩm kiểu ThaTim: action=category|buy|history (xem phần cuối file).
 */

export type ProviderService = {
  service: string | number;
  name: string;
  type?: string;
  category?: string;
  rate: string | number; // giá / 1000 theo tiền gốc của provider
  min: string | number;
  max: string | number;
  refill?: boolean;
  cancel?: boolean;
  dripfeed?: boolean;
};

async function call<T = any>(provider: Provider, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ key: provider.apiKey, ...params });
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
  const r = await call<{ balance: string; currency: string }>(provider, { action: "balance" });
  const raw = parseFloat(r.balance || "0");
  const vnd = Math.round(raw * provider.exchangeRate);
  await prisma.provider.update({ where: { id: provider.id }, data: { balanceCache: vnd } });
  return { raw, vnd, currency: r.currency || provider.currency };
}

export async function providerServices(provider: Provider): Promise<ProviderService[]> {
  const r: any = await call<any>(provider, { action: "services" });
  // Chuẩn SMM v2 cổ điển: mảng phẳng. Kiểu ThaTim: {status, data:[{name, services:[...]}]} lồng theo danh mục.
  let arr: any[] = [];
  if (Array.isArray(r)) arr = r;
  else if (Array.isArray(r?.data)) {
    for (const item of r.data) {
      if (Array.isArray(item?.services)) {
        for (const s of item.services) arr.push({ ...s, category: s.category || item.name });
      } else if (item && (item.id !== undefined || item.service !== undefined)) arr.push(item);
    }
  }
  if (!arr.length) throw new Error("Provider không trả danh sách dịch vụ dạng mảng");
  return arr
    .filter((s) => !s.status || s.status === "selling")
    .map((s) => ({
      service: s.service ?? s.id,
      name: String(s.name || `Dịch vụ ${s.service ?? s.id}`),
      type: s.type,
      category: s.category,
      rate: s.rate ?? s.price ?? 0, // ThaTim dùng "price" (giá / price_per lượt, thường là 1000)
      min: s.min ?? 1,
      max: s.max ?? 100000,
      refill: !!s.refill,
      cancel: !!s.cancel,
      dripfeed: !!s.dripfeed,
    }));
}

export type SmmExtraParams = {
  comments?: string; // danh sách comment, mỗi dòng 1 cái (dịch vụ comment kiểu ThaTim)
  reaction?: string; // like|love|haha|wow|sad|angry — nhiều loại cách nhau bằng |
  minutes?: number; // số phút (dịch vụ watch time)
  duration?: number;
  posts?: number; // số bài viết (gói subscription)
};

export async function providerAddOrder(
  provider: Provider,
  providerServiceId: string,
  link: string,
  quantity: number,
  extra?: SmmExtraParams
): Promise<string> {
  const params: Record<string, string> = {
    action: "add",
    service: providerServiceId,
    link,
    quantity: String(quantity),
  };
  if (extra?.comments) params.comments = extra.comments;
  if (extra?.reaction) params.reaction = extra.reaction;
  if (extra?.minutes) params.minutes = String(extra.minutes);
  if (extra?.duration) params.duration = String(extra.duration);
  if (extra?.posts) params.posts = String(extra.posts);
  const r = await call<{ order: string | number }>(provider, params);
  if (r.order === undefined || r.order === null || r.order === "") throw new Error("Provider không trả mã đơn");
  return String(r.order);
}

export type ProviderOrderStatus = {
  charge?: string;
  start_count?: string;
  status?: string; // Pending | In progress | Processing | Completed | Partial | Canceled
  remains?: string;
  currency?: string;
};

export async function providerOrderStatus(provider: Provider, providerOrderId: string) {
  return call<ProviderOrderStatus>(provider, { action: "status", order: providerOrderId });
}

export async function providerCancel(provider: Provider, providerOrderId: string) {
  try {
    await call(provider, { action: "cancel", orders: providerOrderId });
    return true;
  } catch {
    return false;
  }
}

/** Yêu cầu refill (bù tụt) thật sang provider — chuẩn ThaTim/SMM v2 */
export async function providerRefill(provider: Provider, providerOrderId: string): Promise<string> {
  const r = await call<{ refill: string | number }>(provider, { action: "refill", order: providerOrderId });
  if (r.refill === undefined || r.refill === null) throw new Error("Provider không trả mã refill");
  return String(r.refill);
}

export async function providerRefillStatus(provider: Provider, refillId: string) {
  return call<{ status?: string }>(provider, { action: "refill_status", refill: refillId });
}

export function mapProviderStatus(s?: string): "PENDING" | "PROCESSING" | "IN_PROGRESS" | "COMPLETED" | "PARTIAL" | "CANCELED" {
  switch ((s || "").toLowerCase()) {
    case "completed":
      return "COMPLETED";
    case "partial":
      return "PARTIAL";
    case "canceled":
    case "cancelled":
      return "CANCELED";
    case "in progress":
      return "IN_PROGRESS";
    case "processing":
      return "PROCESSING";
    default:
      return "PENDING";
  }
}

/**
 * Đồng bộ dịch vụ SMM từ provider: tạo/cập nhật SmmService theo providerServiceId.
 * Giá bán = giá vốn quy VND * (1 + markup%).
 */
export async function syncProviderServices(provider: Provider) {
  const list = await providerServices(provider);
  let created = 0,
    updated = 0;
  const catCache = new Map<string, number>();

  async function categoryId(name: string): Promise<number> {
    const key = name.trim().toLowerCase();
    if (catCache.has(key)) return catCache.get(key)!;
    const platform = guessPlatform(name);
    let cat = await prisma.smmCategory.findFirst({ where: { name, platform } });
    if (!cat) cat = await prisma.smmCategory.create({ data: { name, platform } });
    catCache.set(key, cat.id);
    return cat.id;
  }

  for (const sv of list) {
    const costVnd = Math.ceil(parseFloat(String(sv.rate)) * provider.exchangeRate);
    const sell = Math.ceil(costVnd * (1 + provider.markupPercent / 100));
    const catId = await categoryId(sv.category || "Dịch vụ khác");
    const existing = await prisma.smmService.findFirst({
      where: { providerId: provider.id, providerServiceId: String(sv.service) },
    });
    const data = {
      categoryId: catId,
      name: sv.name,
      rate: sell,
      costRate: costVnd,
      min: parseInt(String(sv.min)) || 10,
      max: parseInt(String(sv.max)) || 100000,
      refill: !!sv.refill,
      cancelable: !!sv.cancel,
      dripfeed: !!sv.dripfeed,
      fulfillment: "API" as const,
      providerId: provider.id,
      providerServiceId: String(sv.service),
    };
    if (existing) {
      // Price Monitor: giá vốn thay đổi -> ghi log để admin theo dõi biến động giá của provider
      if (existing.costRate !== costVnd) {
        await prisma.apiLog.create({
          data: { kind: "price_change", ref: `${provider.name}/${sv.service}`, detail: `service=${existing.id} "${existing.name}" costRate ${existing.costRate} -> ${costVnd}` },
        });
      }
      await prisma.smmService.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await prisma.smmService.create({ data });
      created++;
    }
  }
  await prisma.provider.update({ where: { id: provider.id }, data: { lastSyncAt: new Date() } });
  await prisma.apiLog.create({
    data: { kind: "provider_sync", ref: provider.name, detail: `created=${created} updated=${updated} total=${list.length}` },
  });
  return { created, updated, total: list.length };
}

export function guessPlatform(text: string): string {
  const t = text.toLowerCase();
  if (t.includes("facebook") || t.includes("fb")) return "facebook";
  if (t.includes("tiktok")) return "tiktok";
  if (t.includes("instagram") || t.includes("ig")) return "instagram";
  if (t.includes("youtube") || t.includes("yt")) return "youtube";
  if (t.includes("telegram")) return "telegram";
  if (t.includes("shopee")) return "shopee";
  if (t.includes("twitter") || t.includes("x ")) return "x";
  if (t.includes("spotify")) return "spotify";
  return "other";
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

/** Suy endpoint sản phẩm từ apiUrl SMM: .../api/v2 -> .../api/product */
export function productEndpoint(provider: Provider): string {
  const u = provider.apiUrl.replace(/\/+$/, "");
  if (u.endsWith("/api/v2")) return `${u.slice(0, -"/v2".length)}/product`;
  if (u.endsWith("/api")) return `${u}/product`;
  return `${u}/api/product`;
}

async function callProduct<T = any>(provider: Provider, params: Record<string, string>): Promise<T> {
  const body = new URLSearchParams({ key: provider.apiKey, ...params });
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
