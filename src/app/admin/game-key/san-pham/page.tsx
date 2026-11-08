import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, I } from "@/components/ui";
import { VariantRow, AreaSyncCard, AdminPager } from "@/components/admin-families";
import { famSaveGiftProduct } from "@/app/actions/admin-families";
import { GameKeyAddForm, GameKeyEditionForm } from "@/components/fzr-picker";
import { loadGameKeyFamilies } from "@/lib/families";
import { getSettings } from "@/lib/settings";
import { fzrMarkupKey } from "@/lib/fzr-markup";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

const RT = "/admin/game-key/san-pham";

/** FIX10 — Sản phẩm Game Key theo đúng cấu trúc FZR (đọc OpenAPI trước khi
 *  làm): 1 game = 1 sản phẩm (game_id), platform/region là dữ liệu thật từ
 *  API (chỉ hiện, không sửa tay ở đây); editions = các key của game
 *  (key_id, giá bán sửa ở đây là giá tính tiền, tồn kho là số phía FZR tại
 *  lần đồng bộ gần nhất). Edition admin tự thêm mang dấu CUSTOM — đồng bộ
 *  không ghi đè giá và không tắt. KHÔNG trang cấu hình riêng: tỉ giá +
 *  markup chung ở form nhà cung cấp (Admin → Nhà cung cấp), markup riêng
 *  của khu ở thẻ AreaSyncCard bên dưới. */
export default async function AdminGameKeyProducts({ searchParams }: { searchParams: { msg?: string; err?: string; q?: string; page?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const q = (searchParams.q || "").trim();
  const { providers, groups, total, page, pages } = await loadGameKeyFamilies({ q, page: parseInt(searchParams.page || "1") || 1 });
  const settings = await getSettings();
  const areaOverrides = { gamekeys: settings[fzrMarkupKey("gamekeys")] || "" };
  return (
    <div>
      <PageHead
        title={L("Sản phẩm Game Key")}
        desc={L("Mỗi game là một sản phẩm theo Game ID của FazerCards; các phiên bản (edition) là các key bán của game đó. Sửa giá/tên/bật tắt tại đây áp dụng ngay cho trang Mua game.")}
      />
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />

      {providers.length === 0 && (
        <div className="card mb-4 border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
          Chưa có nhà cung cấp FZR đang bật — thêm nhà cung cấp ở Admin → Nhà cung cấp (API) rồi đồng bộ catalog để có game.
        </div>
      )}
      {providers[0] && <AreaSyncCard provider={providers[0]} groups={["gamekeys"]} overrides={areaOverrides} returnTo={RT} />}

      <section className="card mb-4 overflow-hidden">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <span className="text-brand-600">{I.key}</span>
          <h2 className="text-[15px] font-bold text-slate-800">Game Key</h2>
          <span className="text-xs text-slate-400">Nền tảng / vùng / tồn kho lấy từ dữ liệu FazerCards khi đồng bộ</span>
        </div>
        <GameKeyAddForm returnTo={RT} />
        <form method="get" className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/60 px-4 py-3">
          <input name="q" defaultValue={q} placeholder="Tìm game theo tên..." className="inp min-w-[220px] flex-1 !py-2 text-[13px]" />
          <button className="btn-primary btn-sm !px-3.5 !py-2">Tìm kiếm</button>
          {q && <a href={RT} className="btn-ghost btn-sm !px-3.5 !py-2">Xoá lọc</a>}
        </form>
        {groups.length ? (
          groups.map(({ product, variants }) => (
            <div key={product.id} className="border-b border-slate-100 last:border-0">
              <div className="flex flex-wrap items-start gap-3 px-4 pt-3.5">
                {product.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.imageUrl} alt="" className="h-14 w-11 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-14 w-11 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-lg font-black text-white">
                    {(product.name || "G").slice(0, 1)}
                  </span>
                )}
                <div className="min-w-[220px] flex-1">
                  <form action={famSaveGiftProduct} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="productId" value={product.id} />
                    <input type="hidden" name="returnTo" value={RT} />
                    <label className="block min-w-[180px] flex-1">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-400">Tên game</span>
                      <input name="name" defaultValue={product.name} className="inp !py-2 text-[13px]" />
                    </label>
                    <label className="block min-w-[200px] flex-1">
                      <span className="mb-1 block text-[11px] font-semibold text-slate-400">Ảnh bìa (URL)</span>
                      <input name="imageUrl" defaultValue={product.imageUrl || ""} placeholder="https://…" className="inp !py-2 text-[13px]" />
                    </label>
                    <button className="btn-primary btn-sm !px-3.5 !py-2">Lưu game</button>
                  </form>
                  <div className="mt-1.5 text-xs text-slate-400">
                    Game ID: {product.providerProductId || "—"} · Nền tảng: {product.providerPlatform || "—"} · Vùng: {product.providerRegion || "—"}
                    {!product.active && <span className="ml-1 font-bold text-rose-500">· Sản phẩm đang tắt</span>}
                  </div>
                </div>
              </div>
              {variants.map((v) => (
                <VariantRow
                  key={v.id} v={v} returnTo={RT}
                  meta={`Key ID: ${v.providerItemId || "—"} · Tồn kho NCC: ${v.providerStock == null ? "—" : v.providerStock}`}
                />
              ))}
              <GameKeyEditionForm productId={product.id} gameId={product.providerProductId} existing={variants.map((v) => v.providerItemId || "")} returnTo={RT} />
            </div>
          ))
        ) : (
          <p className="px-5 py-4 text-sm text-slate-400">{q ? `Không có game nào khớp “${q}”.` : "Chưa có game nào — đồng bộ catalog FZR ở trang Nhà cung cấp hoặc thêm game ở trên."}</p>
        )}
        <div className="px-4">
          <AdminPager basePath={RT} page={page} pages={pages} total={total} unit="game" params={{ q }} />
        </div>
      </section>

      <p className="px-1 text-xs leading-relaxed text-slate-400">
        Quyền sở hữu khi đồng bộ FZR: gói do đồng bộ tạo có thể bị ghi đè giá (khi nhà cung cấp bật Tự cập nhật giá), ghi đè tên/ảnh (khi bật Đồng bộ nội dung) và được bật lại nếu FZR còn bán; gói gắn nhãn “Tự thêm” do admin tạo thì đồng bộ không đụng vào. Tồn kho hiển thị là số phía FZR tại lần đồng bộ gần nhất — khi đặt đơn FZR kiểm tra tồn kho thật và trả lỗi dứt khoát nếu hết, đơn sẽ được hoàn tiền tự động.
      </p>
    </div>
  );
}
