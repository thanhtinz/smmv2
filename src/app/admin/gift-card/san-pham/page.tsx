import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, I } from "@/components/ui";
import { VariantRow, AreaSyncCard, AdminPager, ProductSyncButton } from "@/components/admin-families";
import { famSaveGiftProduct } from "@/app/actions/admin-families";
import { GiftCardAddForm, GiftCardDenomForm, BulkAddPanel } from "@/components/fzr-picker";
import { loadGiftCardFamilies } from "@/lib/families";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const RT = "/admin/gift-card/san-pham";

/** Sản phẩm Gift Card theo đúng cấu trúc FZR (đọc OpenAPI trước khi làm):
 *  1 category = 1 sản phẩm (category_id), ghi chú (note) của NCC lưu ở
 *  description và hiện ở thẻ NOTE phía khách; mệnh giá = các offer của
 *  category (card_id, giá bán sửa ở đây là giá tính tiền, tồn kho là số
 *  phía FZR tại lần đồng bộ gần nhất). Mệnh giá admin tự thêm mang dấu
 *  CUSTOM — đồng bộ không ghi đè giá và không tắt. KHÔNG trang cấu hình
 *  riêng: tỉ giá + mọi markup đều ở form nhà cung cấp (Admin → Nhà cung cấp). */
export default async function AdminGiftCardProducts( { searchParams: searchParamsPromise }: { searchParams: Promise<{ msg?: string; err?: string; q?: string; page?: string }> }) {
  const searchParams = await searchParamsPromise;
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const q = (searchParams.q || "").trim();
  const { providers, groups, total, page, pages } = await loadGiftCardFamilies({ q, page: parseInt(searchParams.page || "1") || 1 });
  return (
    <div>
      <PageHead
        title={L("Sản phẩm Gift Card")}
      />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      {providers.length === 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Chưa có nhà cung cấp FZR đang bật — thêm nhà cung cấp ở Admin → Nhà cung cấp (API) rồi đồng bộ catalog để có danh mục thẻ.
        </div>
      )}
      {providers[0] && <AreaSyncCard provider={providers[0]} groups={["giftcards"]} returnTo={RT} />}

      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="text-brand-600">{I.gift}</span>
          <h2 className="text-[15px] font-bold text-slate-800">Gift Card</h2>
          
        </div>
        <GiftCardAddForm returnTo={RT} />
        <BulkAddPanel group="giftcards" returnTo={RT} />
        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <input name="q" defaultValue={q} placeholder="Tìm danh mục theo tên..." className="inp min-w-[220px] flex-1 !py-2 text-[13px] sm:max-w-[400px]" />
          <button className="btn-primary btn-sm h-[38px] !px-3.5">Tìm kiếm</button>
          {q && <a href={RT} className="btn-ghost btn-sm h-[38px] !px-3.5">Xoá lọc</a>}
        </form>
        {groups.length ? (
          groups.map(({ product, variants }) => (
            <div key={product.id} className="border-b border-slate-100 last:border-0">
              <div className="flex flex-wrap items-start gap-3 px-4 pt-3.5">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-lg font-black text-white">
                    {(product.name || "G").slice(0, 1)}
                  </span>
                )}
                <div className="min-w-[220px] flex-1">
                  <form action={famSaveGiftProduct} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="returnTo" value={RT} />
                    <label className="block min-w-[180px] flex-1">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-400">Tên danh mục</span>
                      <input name="name" defaultValue={product.name} className="inp !py-2 text-[13px]" />
                    </label>
                    <label className="block min-w-[200px] flex-1">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-400">Ảnh bìa (URL)</span>
                      <input name="imageUrl" defaultValue={product.imageUrl || ""} placeholder="https://…" className="inp !py-2 text-[13px]" />
                    </label>
                    <label className="block w-full">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-400">Ghi chú của nhà cung cấp (sửa được — khách thấy ở trang mua)</span>
                      <textarea name="note" rows={2} defaultValue={product.description || ""} placeholder="—" className="inp w-full !py-2 text-[13px]" />
                    </label>
                    <button className="btn-primary btn-row !px-3.5">Lưu danh mục</button>
                  </form>
                  <div className="mt-1.5 text-xs text-slate-400">
                    Category ID: {product.providerProductId || "—"}
                    {!product.active && <span className="ml-1 font-bold text-rose-500">· Sản phẩm đang tắt</span>}
                  </div>
                  {product.description ? (
                    <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-400">Ghi chú NCC: {product.description}</p>
                  ) : null}
                  <ProductSyncButton productId={product.id} bound={!!product.providerProductId} returnTo={RT} />
                </div>
              </div>
              {variants.map((v) => (
                <VariantRow
                  key={v.id} v={v} returnTo={RT}
                  meta={`Card ID: ${v.providerItemId || "—"} · Tồn kho NCC: ${v.providerStock == null ? "—" : v.providerStock}${v.minOrderQty != null || v.maxOrderQty != null ? ` · SL/đơn: ${v.minOrderQty ?? "—"}–${v.maxOrderQty ?? "—"}` : ""}`}
                />
              ))}
              <GiftCardDenomForm productId={product.id} categoryId={product.providerProductId} existing={variants.map((v) => v.providerItemId || "")} returnTo={RT} />
            </div>
          ))
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">{q ? `Không có danh mục nào khớp “${q}”.` : "Chưa có danh mục nào — đồng bộ catalog FZR ở trang Nhà cung cấp hoặc thêm danh mục ở trên."}</p>
        )}
        <div className="px-4">
          <AdminPager basePath={RT} page={page} pages={pages} total={total} unit="danh mục" params={{ q }} />
        </div>
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Quyền sở hữu khi đồng bộ FZR: gói do đồng bộ tạo có thể bị ghi đè giá (khi nhà cung cấp bật Tự cập nhật giá), ghi đè tên/ảnh/ghi chú (khi bật Đồng bộ nội dung) và được bật lại nếu FZR còn bán; gói gắn nhãn “Tự thêm” do admin tạo thì đồng bộ không đụng vào. Tồn kho hiển thị là số phía FZR tại lần đồng bộ gần nhất — khi đặt đơn FZR kiểm tra tồn kho thật và trả lỗi dứt khoát nếu hết, đơn sẽ được hoàn tiền tự động.
      </p>
    </div>
  );
}
