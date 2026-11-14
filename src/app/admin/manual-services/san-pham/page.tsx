import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, I } from "@/components/ui";
import { VariantRow, AreaSyncCard, AdminPager, ProductSyncButton } from "@/components/admin-families";
import { famSaveGiftProduct, famSaveFieldLabels } from "@/app/actions/admin-families";
import { ManualAddForm, ManualOfferForm, BulkAddPanel } from "@/components/fzr-picker";
import { loadManualFamilies } from "@/lib/families";
import { parsePremiumFields } from "@/lib/format";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const RT = "/admin/manual-services/san-pham";

/** Sản phẩm Manual Services theo đúng cấu trúc FZR (đọc OpenAPI trước khi
 *  làm): 1 category = 1 sản phẩm (providerProductId = manual_service_id,
 *  kind của category ở providerKind, info của NCC ở description); offer =
 *  variant (delivery_minutes + note_product của NCC lưu kèm, chỉ để hiện).
 *  fields[] CHỈ có khi kind = replenishment ({ code, name }) — key khoá
 *  cứng, NHÃN sửa được tại khối "Trường tuỳ chỉnh" và được giữ khi đồng bộ
 *  lại (gộp theo key). Gói admin tự thêm mang dấu CUSTOM — đồng bộ không
 *  ghi đè giá và không tắt. KHÔNG trang cấu hình riêng: tỉ giá + mọi
 *  markup đều ở form nhà cung cấp (Admin → Nhà cung cấp). */
export default async function AdminManualProducts( { searchParams: searchParamsPromise }: { searchParams: Promise<{ msg?: string; err?: string; q?: string; page?: string }> }) {
  const searchParams = await searchParamsPromise;
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const q = (searchParams.q || "").trim();
  const { providers, groups, total, page, pages } = await loadManualFamilies({ q, page: parseInt(searchParams.page || "1") || 1 });
  return (
    <div>
      <PageHead
        title={L("Sản phẩm Manual Services")}
      />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      {providers.length === 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Chưa có nhà cung cấp FZR đang bật — thêm nhà cung cấp ở Admin → Nhà cung cấp (API) rồi đồng bộ catalog để có dịch vụ thủ công.
        </div>
      )}
      {providers[0] && <AreaSyncCard provider={providers[0]} groups={["manual"]} returnTo={RT} />}

      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="text-brand-600">{I.box}</span>
          <h2 className="text-[15px] font-bold text-slate-800">Manual Services</h2>
          <span className="text-xs text-slate-400">Dịch vụ / gói / trường người mua lấy từ dữ liệu FazerCards khi đồng bộ</span>
        </div>
        <ManualAddForm returnTo={RT} />
        <BulkAddPanel group="manual" returnTo={RT} />
        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <input name="q" defaultValue={q} placeholder="Tìm dịch vụ theo tên..." className="inp min-w-[220px] flex-1 !py-2 text-[13px] sm:max-w-[400px]" />
          <button className="btn-primary btn-sm h-[38px] !px-3.5">Tìm kiếm</button>
          {q && <a href={RT} className="btn-ghost btn-sm h-[38px] !px-3.5">Xoá lọc</a>}
        </form>
        {groups.length ? (
          groups.map(({ product, variants }) => {
            const fields = parsePremiumFields(product.customFields);
            return (
              <div key={product.id} className="border-b border-slate-100 last:border-0">
                <div className="flex flex-wrap items-start gap-3 px-4 pt-3.5">
                  {product.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-lg font-black text-white">
                      {(product.name || "M").slice(0, 1)}
                    </span>
                  )}
                  <div className="min-w-[220px] flex-1">
                    <form action={famSaveGiftProduct} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="productId" value={product.id} />
                      <input type="hidden" name="returnTo" value={RT} />
                      <label className="block min-w-[180px] flex-1">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-400">Tên dịch vụ</span>
                        <input name="name" defaultValue={product.name} className="inp !py-2 text-[13px]" />
                      </label>
                      <label className="block min-w-[200px] flex-1">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-400">Ảnh bìa (URL)</span>
                        <input name="imageUrl" defaultValue={product.imageUrl || ""} placeholder="https://…" className="inp !py-2 text-[13px]" />
                      </label>
                      <label className="block w-full">
                        <span className="mb-1 block text-[11px] font-semibold text-slate-400">Info của nhà cung cấp (sửa được — khách thấy ở trang mua)</span>
                        <textarea name="note" rows={2} defaultValue={product.description || ""} placeholder="—" className="inp w-full !py-2 text-[13px]" />
                      </label>
                      <button className="btn-primary btn-row !px-3.5">Lưu dịch vụ</button>
                    </form>
                    <div className="mt-1.5 text-xs text-slate-400">
                      Service ID: {product.providerProductId || "—"}
                      {product.providerKind && <span> · Loại giao (kind): <span className="font-semibold text-slate-500">{product.providerKind}</span></span>}
                      {!product.active && <span className="ml-1 font-bold text-rose-500">· Sản phẩm đang tắt</span>}
                    </div>
                    {product.description ? (
                      <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-400">Info NCC: {product.description}</p>
                    ) : null}
                    <ProductSyncButton productId={product.id} bound={!!product.providerProductId} returnTo={RT} />
                  </div>
                </div>
                {variants.map((v) => (
                  <VariantRow
                    key={v.id} v={v} returnTo={RT}
                    meta={`Offer ID: ${v.providerItemId || "—"}${v.deliveryMinutes != null ? ` · Giao ~${v.deliveryMinutes} phút` : ""}${v.providerNote ? ` · ${v.providerNote}` : ""}`}
                  />
                ))}
                <ManualOfferForm productId={product.id} serviceId={product.providerProductId} existing={variants.map((v) => v.providerItemId || "")} returnTo={RT} />
                {fields.length > 0 && (
                  <form action={famSaveFieldLabels} className="mx-4 mb-3.5 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="returnTo" value={RT} />
                    <div className="mb-1 text-xs font-bold text-slate-600">Trường tuỳ chỉnh của nhà cung cấp</div>
                    <p className="mb-2 text-xs text-slate-400">Key và loại trường do nhà cung cấp định nghĩa (khoá cứng) — chỉ sửa NHÃN hiển thị cho khách; nhãn mới được giữ nguyên khi đồng bộ lại.</p>
                    <div className="space-y-2">
                      {fields.map((f, i) => (
                        <div key={`${f.key || f.label}-${i}`} className="flex flex-wrap items-center gap-2">
                          {f.key ? (
                            <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-[11px] font-semibold text-white">{f.key}</span>
                          ) : (
                            <span className="rounded-md bg-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500">thủ công</span>
                          )}
                          <span className="text-[11px] font-medium text-slate-400">
                            {f.type === "select" ? `Chọn 1 trong: ${(f.options || []).join(", ") || "—"}` : f.type === "textarea" ? "Ô nhập nhiều dòng" : "Ô nhập 1 dòng"}{f.required ? " · Bắt buộc" : ""}
                          </span>
                          <label className="block min-w-[200px] flex-1">
                            <input name={`flabel_${i}`} defaultValue={f.label} className="inp !py-2 text-[13px] w-full" />
                          </label>
                        </div>
                      ))}
                    </div>
                    <button className="btn-primary btn-row mt-3 !px-3.5">Lưu nhãn trường</button>
                  </form>
                )}
              </div>
            );
          })
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">{q ? `Không có dịch vụ nào khớp “${q}”.` : "Chưa có dịch vụ nào — đồng bộ catalog FZR ở trang Nhà cung cấp hoặc thêm dịch vụ ở trên."}</p>
        )}
        <div className="px-4">
          <AdminPager basePath={RT} page={page} pages={pages} total={total} unit="dịch vụ" params={{ q }} />
        </div>
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Quyền sở hữu khi đồng bộ FZR: gói do đồng bộ tạo có thể bị ghi đè giá (khi nhà cung cấp bật Tự cập nhật giá), ghi đè tên/ảnh/info (khi bật Đồng bộ nội dung) và được bật lại nếu FZR còn bán; gói gắn nhãn “Tự thêm” do admin tạo thì đồng bộ không đụng vào. Nhãn trường tuỳ chỉnh do admin đặt luôn được giữ khi đồng bộ lại (gộp theo key của nhà cung cấp).
      </p>
    </div>
  );
}
