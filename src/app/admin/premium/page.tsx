import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { ProductsClient } from "@/components/admin-premium";
import { AdminPager } from "@/components/admin-families";
import { loadAdminPremiumData } from "@/lib/admin-premium-data";
import { prisma } from "@/lib/db";
import { getServerI18n } from "@/lib/lang-server";
import { adminProductPageSize } from "@/lib/settings";

export const dynamic = "force-dynamic";

const RT = "/admin/premium";

export default async function AdminPremiumProducts( { searchParams: searchParamsPromise }: { searchParams: Promise<{ q?: string; cat?: string; status?: string; page?: string; msg?: string; err?: string }> }) {
  const searchParams = await searchParamsPromise;
  const PAGE_SIZE = await adminProductPageSize();
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const where: any = {};
  if (searchParams.q) where.OR = [{ name: { contains: searchParams.q, mode: "insensitive" } }, { slug: { contains: searchParams.q.toLowerCase(), mode: "insensitive" } }];
  if (searchParams.cat) where.categoryId = parseInt(searchParams.cat);
  if (searchParams.status === "on") where.active = true;
  if (searchParams.status === "off") where.active = false;
  // Phân trang phía máy chủ (10 sản phẩm/trang) — bộ lọc q/cat/status giữ
  // nguyên qua query khi lật trang.
  const total = await prisma.premiumProduct.count({ where: { ...where, panelId: null } });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(searchParams.page || "1") || 1));
  const { products: dtos, categories: catDtos, providers } = await loadAdminPremiumData(where, { skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  const categories = catDtos;
  return (
    <div>
      <PageHead title={L("Quản lý Sản phẩm Premium")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <ProductsClient
        products={dtos}
        categories={catDtos}
        providers={providers}
        filterForm={(
          <form method="get" className="card mb-4 flex flex-wrap items-center gap-3 p-4">
            <input name="q" defaultValue={searchParams.q || ""} className="inp min-w-[220px] flex-1 sm:max-w-[400px]" placeholder={L("Tìm theo tên sản phẩm hoặc slug...")} />
            <select name="cat" defaultValue={searchParams.cat || ""} className="inp !w-52">
              <option value="">{L("Tất cả danh mục")}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select name="status" defaultValue={searchParams.status || ""} className="inp !w-52">
              <option value="">{L("Tất cả trạng thái")}</option>
              <option value="on">{L("Đang bán")}</option>
              <option value="off">{L("Tạm dừng")}</option>
            </select>
            <button className="btn-primary btn-sm h-[42px] !px-4">{L("Tìm kiếm")}</button>
          </form>
        )}
      />
      <AdminPager basePath={RT} page={page} pages={pages} total={total} unit={L("sản phẩm")} params={{ q: searchParams.q || "", cat: searchParams.cat || "", status: searchParams.status || "" }} />
    </div>
  );
}
