import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash } from "@/components/ui";
import { ProductsClient } from "@/components/admin-premium";
import { loadAdminPremiumData, scopedProductWhere } from "@/lib/admin-premium-data";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/** Sản phẩm Telegram (FIX7 E3): cùng editor với /admin/premium nhưng lọc sẵn
 *  về khu Telegram — sản phẩm có gói thuộc nhóm telegram_stars /
 *  telegram_premium (kể cả 2 sản phẩm tổng hợp của đồng bộ FZR) hoặc slug
 *  chứa "telegram". Thêm mới ngay tại đây: lưu xong quay về trang này kèm
 *  ?q=slug, mở Gói và gán nhóm NCC là sản phẩm thuộc khu. */
export default async function AdminTelegramProducts({ searchParams }: { searchParams: { q?: string; cat?: string; status?: string; msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const where = scopedProductWhere(["telegram_stars", "telegram_premium"], "telegram", searchParams.q, searchParams.cat, searchParams.status);
  const { products: dtos, categories, providers } = await loadAdminPremiumData(where);
  return (
    <div>
      <PageHead title={L("Quản lý Sản phẩm Telegram")} desc={L("Sản phẩm và gói thuộc nhóm Telegram (Stars, Premium) — quản lý ngay trong khu Telegram, không cần qua danh sách Premium chung.")} />
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
      <ProductsClient products={dtos} categories={categories} providers={providers} returnTo="/admin/telegram/san-pham" />
    </div>
  );
}
