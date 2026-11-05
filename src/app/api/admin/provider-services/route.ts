import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { providerServices, guessPlatform } from "@/lib/provider";

export const dynamic = "force-dynamic";

/** Import dịch vụ CHỌN LỌC từ nhà cung cấp (khác Đồng bộ = nhập tất cả):
 *  GET  ?providerId= → danh sách dịch vụ phía nhà cung cấp + cờ đã nhập chưa.
 *  POST {providerId, markup, ids[]} → tạo SmmService cho các mục đã chọn (bỏ qua mục đã có). */

async function adminOnly() {
  const u = await getCurrentUser();
  return u && u.role === "ADMIN" ? u : null;
}

/** Tìm/tạo danh mục SMM theo tên phía nhà cung cấp (cùng cách với đồng bộ tự động). */
async function categoryIdFor(name: string, cache: Map<string, number>): Promise<number> {
  const key = name.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key)!;
  const platform = guessPlatform(name);
  let cat = await prisma.smmCategory.findFirst({ where: { name, platform } });
  if (!cat) cat = await prisma.smmCategory.create({ data: { name, platform } });
  cache.set(key, cat.id);
  return cat.id;
}

export async function GET(req: NextRequest) {
  if (!(await adminOnly())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const providerId = parseInt(req.nextUrl.searchParams.get("providerId") || "0");
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider) return NextResponse.json({ error: "Không tìm thấy nhà cung cấp" }, { status: 404 });
  try {
    const list = await providerServices(provider);
    const existing = await prisma.smmService.findMany({ where: { providerId: provider.id }, select: { providerServiceId: true } });
    const have = new Set(existing.map((s) => s.providerServiceId));
    const services = list.map((s) => ({
      id: String(s.service),
      name: s.name,
      category: s.category || "Dịch vụ khác",
      costVnd: Math.ceil(parseFloat(String(s.rate)) * provider.exchangeRate),
      min: parseInt(String(s.min)) || 10,
      max: parseInt(String(s.max)) || 100000,
      imported: have.has(String(s.service)),
    }));
    return NextResponse.json({ provider: { id: provider.id, name: provider.name, markupPercent: provider.markupPercent }, services });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "Không lấy được danh sách từ nhà cung cấp") }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await adminOnly())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const providerId = parseInt(String(body?.providerId || 0));
  const markup = Math.max(0, Math.min(500, parseFloat(String(body?.markup ?? 0)) || 0));
  const ids: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider || !ids.length) return NextResponse.json({ error: "Thiếu nhà cung cấp hoặc chưa chọn dịch vụ nào" }, { status: 400 });
  try {
    const list = await providerServices(provider);
    const catCache = new Map<string, number>();
    let created = 0, skipped = 0;
    for (const sv of list) {
      if (!ids.includes(String(sv.service))) continue;
      const exists = await prisma.smmService.findFirst({ where: { providerId: provider.id, providerServiceId: String(sv.service) }, select: { id: true } });
      if (exists) { skipped++; continue; }
      const costVnd = Math.ceil(parseFloat(String(sv.rate)) * provider.exchangeRate);
      const sell = Math.ceil(costVnd * (1 + markup / 100));
      await prisma.smmService.create({
        data: {
          categoryId: await categoryIdFor(sv.category || "Dịch vụ khác", catCache),
          name: sv.name,
          rate: sell,
          costRate: costVnd,
          min: parseInt(String(sv.min)) || 10,
          max: parseInt(String(sv.max)) || 100000,
          refill: !!sv.refill,
          cancelable: !!sv.cancel,
          dripfeed: !!sv.dripfeed,
          fulfillment: "API",
          providerId: provider.id,
          providerServiceId: String(sv.service),
        },
      });
      created++;
    }
    await prisma.apiLog.create({ data: { kind: "provider_import", ref: provider.name, detail: `created=${created} skipped=${skipped} markup=${markup}%` } });
    return NextResponse.json({ created, skipped });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || "Import thất bại") }, { status: 400 });
  }
}
