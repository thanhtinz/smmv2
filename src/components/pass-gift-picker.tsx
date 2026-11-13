"use client";
import { useState } from "react";

/** Bộ chọn QUÀ THÁNG của Pass trong Cấu hình admin: chọn 1 sản phẩm Premium
 *  + 1 gói của nó. Gói đi theo sản phẩm đang chọn (đổi sản phẩm là gói nhảy
 *  về gói đầu tiên của sản phẩm đó). Giá trị rỗng = tháng đó không có quà.
 *  Hai <select> mang đúng name của settings pass_gift_product_id /
 *  pass_gift_variant_id để adminSaveSettings lưu như các ô cấu hình khác. */
export function PassGiftPicker({
  products,
  defaultProductId,
  defaultVariantId,
  labels,
}: {
  products: { id: number; name: string; variants: { id: number; name: string }[] }[];
  defaultProductId: string;
  defaultVariantId: string;
  labels: { product: string; variant: string; none: string };
}) {
  const [pid, setPid] = useState(defaultProductId);
  const product = products.find((p) => String(p.id) === pid);
  const [vid, setVid] = useState(defaultVariantId && product?.variants.some((v) => String(v.id) === defaultVariantId) ? defaultVariantId : "");
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="lbl">{labels.product}</label>
        <select
          className="inp"
          name="pass_gift_product_id"
          value={pid}
          onChange={(e) => { setPid(e.target.value); setVid(""); }}
        >
          <option value="">{labels.none}</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="lbl">{labels.variant}</label>
        <select className="inp" name="pass_gift_variant_id" value={vid} onChange={(e) => setVid(e.target.value)} disabled={!product}>
          <option value="">{labels.none}</option>
          {(product?.variants || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
    </div>
  );
}
