import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { ProductsClient } from "@/components/admin-premium";
import { loadAdminPremiumData } from "@/lib/admin-premium-data";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

export default async function AdminPremiumProducts({ searchParams }: { searchParams: { q?: string; cat?: string; status?: string; msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const where: any = {};
  if (searchParams.q) where.OR = [{ name: { contains: searchParams.q, mode: "insensitive" } }, { slug: { contains: searchParams.q.toLowerCase(), mode: "insensitive" } }];
  if (searchParams.cat) where.categoryId = parseInt(searchParams.cat);
  if (searchParams.status === "on") where.active = true;
  if (searchParams.status === "off") where.active = false;
  const { products: dtos, categories: catDtos, providers } = await loadAdminPremiumData(where);
  const categories = catDtos;
  return (
    <div>
      <PageHead title={L("Quản lý Sản phẩm Premium")} desc={L("Thêm, sửa, xóa sản phẩm và các gói thời hạn (1 tháng, 3 tháng, 1 năm...)")} />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form method="get" className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <input name="q" defaultValue={searchParams.q || ""} className="inp min-w-[220px] flex-1" placeholder={L("Tìm theo tên sản phẩm hoặc slug...")} />
        <select name="cat" defaultValue={searchParams.cat || ""} className="inp !w-52">
          <option value="">{L("Tất cả danh mục")}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="status" defaultValue={searchParams.status || ""} className="inp !w-44">
          <option value="">{L("Tất cả trạng thái")}</option>
          <option value="on">{L("Đang bán")}</option>
          <option value="off">{L("Tạm dừng")}</option>
        </select>
        <button className="btn-primary btn-sm !px-4 !py-2.5">{L("Tìm kiếm")}</button>
      </form>
      <ProductsClient products={dtos} categories={catDtos} providers={providers} />
    </div>
  );
}
