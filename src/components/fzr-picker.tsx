"use client";
import { useEffect, useState } from "react";
import {
  fzrPickSearch, fzrPickEditions, fzrPickLookup, fzrPickTopupFields, fzrPickManualFields,
  famAddGameKey, famAddGameKeyEdition, famAddGiftCardCategory, famAddGiftCardDenomination,
  famAddGiftGame, famAddTelegramPlan, famAddTopupCategory, famAddTopupOffer,
  famAddManualService, famAddManualOffer,
} from "@/app/actions/admin-families";
import { UploadButton } from "@/components/image-upload";

/** FIX11 TASK 3 — Picker chọn sản phẩm TỪ NGUỒN FZR cho các trang admin
 *  Telegram/Steam/Game Key/Gift Card. Admin tìm trong catalog thật của nhà
 *  cung cấp (chỉ nhóm của trang đó) hoặc dán mã để hệ thống kiểm chứng với
 *  nhà cung cấp rồi mới cho lưu — thay cho ô nhập mã tự do, để không gói
 *  nào bị trói nhầm dịch vụ. Các action famAdd* phía máy chủ giữ nguyên
 *  (kiểm tra trùng + dấu CUSTOM); picker chỉ điền đúng mã thật vào form. */

export type PickItem = { id: string; name: string; priceUsd: string | null; extra: string; extra2?: string; minQty?: number | null; maxQty?: number | null; appid?: number | null };

const lbl = "mb-1 block text-[11px] font-semibold text-slate-400";
const inp = "inp !py-2 text-[13px]";

function PickerBox({ group, onPick, picked }: {
  group: string;
  onPick: (item: PickItem) => void;
  picked: PickItem | null;
}) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<PickItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [lookupMsg, setLookupMsg] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  const search = async (toPage = 1) => {
    setBusy(true); setError(""); setLookupMsg("");
    const r = await fzrPickSearch(group, q, toPage);
    setBusy(false);
    if (!r.ok) { setError(r.error || "Lỗi không rõ"); setItems(null); return; }
    setItems(r.items || []);
    setPage(r.page || toPage);
    setHasMore(!!r.hasMore);
  };
  const lookup = async () => {
    if (!lookupId.trim()) return;
    setBusy(true); setLookupMsg("");
    const r = await fzrPickLookup(group, lookupId);
    setBusy(false);
    if (!r.ok || !r.item) { setLookupMsg(r.error || "Không tìm thấy mã"); return; }
    onPick(r.item);
  };

  return (
    <div className="rounded-xl border border-dashed border-brand-200 bg-brand-50/40 p-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-brand-700">Chọn từ catalog nhà cung cấp</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm theo tên trong catalog FZR..." className={`${inp} min-w-[200px] flex-1`}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} />
        <button type="button" onClick={() => search()} disabled={busy} className="btn-primary btn-row !px-3.5 disabled:opacity-50">{busy ? "Đang gọi..." : "Tìm"}</button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={lookupId} onChange={(e) => setLookupId(e.target.value)} placeholder="Hoặc dán mã phía FZR để kiểm chứng" className={`${inp} min-w-[200px] flex-1`} />
        <button type="button" onClick={lookup} disabled={busy} className="btn-ghost btn-row !px-3.5 disabled:opacity-50">Kiểm tra mã</button>
      </div>
      {lookupMsg && <p className="mt-1.5 text-xs font-semibold text-rose-600">{lookupMsg}</p>}
      {error && <p className="mt-1.5 text-xs font-semibold text-rose-600">{error}</p>}
      {items && (
        items.length === 0
          ? <p className="mt-2 text-xs text-slate-400">{page > 1 ? "Đã hết kết quả — quay lại trang trước." : "Không có mục nào khớp trong nhóm này."}</p>
          : (
            <div className="mt-2 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white">
              {items.map((it) => (
                <button key={it.id} type="button" onClick={() => onPick(it)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-brand-50 ${picked?.id === it.id ? "bg-brand-50" : ""}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-bold text-slate-800">{it.name}</span>
                    <span className="block text-[11px] text-slate-400">
                      Mã: {it.id}{it.extra ? ` · ${it.extra}` : ""}{it.extra2 ? ` · ${it.extra2}` : ""}
                    </span>
                  </span>
                  {it.priceUsd && <span className="shrink-0 text-[12px] font-bold text-slate-500">${it.priceUsd}</span>}
                </button>
              ))}
            </div>
          )
      )}
      {items && (page > 1 || hasMore) && (
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-slate-400">Trang {page} — kết quả từ catalog nhà cung cấp{hasMore ? " (còn nữa)" : ""}</span>
          <span className="flex gap-2">
            <button type="button" onClick={() => search(page - 1)} disabled={busy || page <= 1} className="btn-ghost btn-sm !px-3 !py-1.5 disabled:opacity-50">Trang trước</button>
            <button type="button" onClick={() => search(page + 1)} disabled={busy || !hasMore} className="btn-ghost btn-sm !px-3 !py-1.5 disabled:opacity-50">Trang sau</button>
          </span>
        </div>
      )}
      {picked && (
        <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          Đã chọn: {picked.name} (mã {picked.id}) — thông tin bên dưới đã được điền từ nguồn.
        </p>
      )}
    </div>
  );
}

function useEditions(group: string, parentId: string | null) {
  const [editions, setEditions] = useState<PickItem[]>([]);
  const [editionId, setEditionId] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!parentId) { setEditions([]); setEditionId(""); return; }
    let live = true;
    fzrPickEditions(group, parentId).then((r) => {
      if (!live) return;
      if (!r.ok) { setErr(r.error || "Không lấy được danh sách gói"); setEditions([]); return; }
      const list = r.items || [];
      setEditions(list);
      setEditionId(list[0]?.id || "");
      setErr("");
    });
    return () => { live = false; };
  }, [group, parentId]);
  return { editions, editionId, setEditionId, err };
}

const editionSelect = (
  editions: PickItem[], editionId: string, setEditionId: (v: string) => void, exclude: string[] = [],
) => {
  const avail = editions.filter((e) => !exclude.includes(e.id));
  return (
    <label className="block min-w-[220px] flex-1">
      <span className={lbl}>Gói đầu tiên (lấy từ nguồn)</span>
      <select value={editionId} onChange={(e) => setEditionId(e.target.value)} className={`${inp} w-full`} required>
        {avail.length === 0 && <option value="">— Không còn gói nào chưa thêm —</option>}
        {avail.map((e) => (
          <option key={e.id} value={e.id}>{e.name}{e.priceUsd ? ` — $${e.priceUsd}` : ""}{e.extra ? ` (${e.extra})` : ""}</option>
        ))}
      </select>
    </label>
  );
};

function QtyLimitFields({ edition }: { edition?: PickItem }) {
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  useEffect(() => {
    setMin(edition?.minQty != null ? String(edition.minQty) : "");
    setMax(edition?.maxQty != null ? String(edition.maxQty) : "");
  }, [edition?.id, edition?.minQty, edition?.maxQty]);
  return (
    <>
      <label className="block">
        <span className={lbl}>SL tối thiểu/đơn</span>
        <input name="minQty" type="number" min={1} value={min} onChange={(e) => setMin(e.target.value)} placeholder="—" className={`${inp} !w-24`} />
      </label>
      <label className="block">
        <span className={lbl}>SL tối đa/đơn</span>
        <input name="maxQty" type="number" min={1} value={max} onChange={(e) => setMax(e.target.value)} placeholder="—" className={`${inp} !w-24`} />
      </label>
    </>
  );
}

/** Thêm GAME Game Key: chọn game từ nguồn -> chọn edition đầu từ nguồn.
 *  Platform/Region điền sẵn từ nguồn nhưng SỬA ĐƯỢC (chọn giá trị đang có
 *  trong gợi ý hoặc gõ giá trị MỚI — bộ lọc phía khách lấy từ các giá trị
 *  đã lưu này); AppID cũng điền sẵn + sửa được. */
export function GameKeyAddForm({ returnTo, platformOptions = [], regionOptions = [] }: { returnTo: string; platformOptions?: string[]; regionOptions?: string[] }) {
  const [picked, setPicked] = useState<PickItem | null>(null);
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState("");
  const [region, setRegion] = useState("");
  const [appid, setAppid] = useState("");
  const { editions, editionId, setEditionId, err } = useEditions("gamekeys", picked?.id || null);
  const edition = editions.find((e) => e.id === editionId);
  const pick = (it: PickItem) => {
    setPicked(it); setName(it.name);
    setPlatform(it.extra || ""); setRegion(it.extra2 || "");
    setAppid(it.appid != null ? String(it.appid) : "");
  };
  return (
    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
      <PickerBox group="gamekeys" onPick={pick} picked={picked} />
      <form action={famAddGameKey} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="gameId" value={picked?.id || ""} />
        <input type="hidden" name="keyId" value={editionId} />
        <input type="hidden" name="editionName" value={edition?.name || ""} />
        <label className="block">
          <span className={lbl}>Tên game</span>
          <input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên game" className={`${inp} !w-52`} />
        </label>
        <ImageUrlField />
        <label className="block">
          <span className={lbl}>Platform (chọn hoặc gõ mới)</span>
          <input name="platform" value={platform} onChange={(e) => setPlatform(e.target.value)} list="gk-platform-options" placeholder="Steam" className={`${inp} !w-40`} />
          <datalist id="gk-platform-options">{platformOptions.map((o) => <option key={o} value={o} />)}</datalist>
        </label>
        <label className="block">
          <span className={lbl}>Region (chọn hoặc gõ mới)</span>
          <input name="region" value={region} onChange={(e) => setRegion(e.target.value)} list="gk-region-options" placeholder="GLOBAL" className={`${inp} !w-40`} />
          <datalist id="gk-region-options">{regionOptions.map((o) => <option key={o} value={o} />)}</datalist>
        </label>
        <label className="block">
          <span className={lbl}>AppID (tuỳ chọn)</span>
          <input name="appid" type="number" min={1} value={appid} onChange={(e) => setAppid(e.target.value)} placeholder="—" className={`${inp} !w-28`} />
        </label>
        {editionSelect(editions, editionId, setEditionId)}
        <QtyLimitFields edition={edition} />
        <label className="block">
          <span className={lbl}>Giá bán (VNĐ)</span>
          <input name="price" type="number" min={0} required placeholder="1299000" className={`${inp} !w-36`} />
        </label>
        <button disabled={!picked || !editionId} className="btn-primary btn-row !px-3.5 disabled:opacity-50">Thêm game</button>
      </form>
      {err && <p className="mt-1.5 text-xs font-semibold text-rose-600">{err}</p>}
      {!picked && <p className="mt-1.5 text-xs text-slate-400">Tìm hoặc kiểm chứng mã game ở khung trên trước — nút Thêm chỉ mở khi đã chọn đúng game từ nguồn.</p>}
    </div>
  );
}

/** Thêm EDITION vào game đã có: danh sách key lấy thẳng từ nguồn. */
export function GameKeyEditionForm({ productId, gameId, existing, returnTo }: {
  productId: number; gameId: string | null; existing: string[]; returnTo: string;
}) {
  const { editions, editionId, setEditionId, err } = useEditions("gamekeys", gameId);
  if (!gameId) {
    return <p className="border-t border-dashed border-slate-100 bg-slate-50/40 px-4 py-3 text-xs text-slate-400">Game này chưa có Game ID phía FZR nên chưa lấy được danh sách key từ nguồn.</p>;
  }
  const edition = editions.find((e) => e.id === editionId);
  return (
    <form action={famAddGameKeyEdition} className="flex flex-wrap items-end gap-2 border-t border-dashed border-slate-100 bg-slate-50/40 px-4 py-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="keyId" value={editionId} />
      <input type="hidden" name="name" value={edition?.name || ""} />
      {editionSelect(editions, editionId, setEditionId, existing)}
      <QtyLimitFields edition={edition} />
      <label className="block">
        <span className={lbl}>Giá bán (VNĐ)</span>
        <input name="price" type="number" min={0} required placeholder="1299000" className={`${inp} !w-36`} />
      </label>
      <button disabled={!editionId} className="btn-primary btn-row !px-3.5 disabled:opacity-50">Thêm phiên bản</button>
      {err && <p className="w-full text-xs font-semibold text-rose-600">{err}</p>}
    </form>
  );
}

/** Thêm CATEGORY Gift Card: chọn category từ nguồn -> chọn mệnh giá đầu. */
export function GiftCardAddForm({ returnTo }: { returnTo: string }) {
  const [picked, setPicked] = useState<PickItem | null>(null);
  const [name, setName] = useState("");
  const { editions, editionId, setEditionId, err } = useEditions("giftcards", picked?.id || null);
  const edition = editions.find((e) => e.id === editionId);
  const pick = (it: PickItem) => { setPicked(it); setName(it.name); };
  return (
    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
      <PickerBox group="giftcards" onPick={pick} picked={picked} />
      <form action={famAddGiftCardCategory} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="categoryId" value={picked?.id || ""} />
        <input type="hidden" name="cardId" value={editionId} />
        <input type="hidden" name="denomName" value={edition?.name || ""} />
        <label className="block">
          <span className={lbl}>Tên danh mục</span>
          <input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên danh mục" className={`${inp} !w-52`} />
        </label>
        <ImageUrlField />
        {editionSelect(editions, editionId, setEditionId)}
        <QtyLimitFields edition={edition} />
        <label className="block">
          <span className={lbl}>Giá bán (VNĐ)</span>
          <input name="price" type="number" min={0} required placeholder="250000" className={`${inp} !w-36`} />
        </label>
        <button disabled={!picked || !editionId} className="btn-primary btn-row !px-3.5 disabled:opacity-50">Thêm danh mục</button>
      </form>
      {err && <p className="mt-1.5 text-xs font-semibold text-rose-600">{err}</p>}
      {!picked && <p className="mt-1.5 text-xs text-slate-400">Tìm hoặc kiểm chứng mã danh mục ở khung trên trước — nút Thêm chỉ mở khi đã chọn đúng danh mục từ nguồn.</p>}
    </div>
  );
}

/** Thêm MỆNH GIÁ vào category đã có: danh sách offer lấy thẳng từ nguồn. */
export function GiftCardDenomForm({ productId, categoryId, existing, returnTo }: {
  productId: number; categoryId: string | null; existing: string[]; returnTo: string;
}) {
  const { editions, editionId, setEditionId, err } = useEditions("giftcards", categoryId);
  if (!categoryId) {
    return <p className="border-t border-dashed border-slate-100 bg-slate-50/40 px-4 py-3 text-xs text-slate-400">Danh mục này chưa có Category ID phía FZR nên chưa lấy được danh sách mệnh giá từ nguồn.</p>;
  }
  const edition = editions.find((e) => e.id === editionId);
  return (
    <form action={famAddGiftCardDenomination} className="flex flex-wrap items-end gap-2 border-t border-dashed border-slate-100 bg-slate-50/40 px-4 py-3">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="cardId" value={editionId} />
      <input type="hidden" name="name" value={edition?.name || ""} />
      {editionSelect(editions, editionId, setEditionId, existing)}
      <QtyLimitFields edition={edition} />
      <label className="block">
        <span className={lbl}>Giá bán (VNĐ)</span>
        <input name="price" type="number" min={0} required placeholder="25000" className={`${inp} !w-36`} />
      </label>
      <button disabled={!editionId} className="btn-primary btn-row !px-3.5 disabled:opacity-50">Thêm mệnh giá</button>
      {err && <p className="w-full text-xs font-semibold text-rose-600">{err}</p>}
    </form>
  );
}

/** Thêm GAME GIFT Steam: chọn game từ nguồn (tìm theo tên hoặc tra AppID). */
export function SteamGiftAddForm({ returnTo }: { returnTo: string }) {
  const [picked, setPicked] = useState<PickItem | null>(null);
  const [name, setName] = useState("");
  const pick = (it: PickItem) => { setPicked(it); setName(it.name); };
  return (
    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3.5">
      <PickerBox group="steam_gift" onPick={pick} picked={picked} />
      <form action={famAddGiftGame} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="appid" value={picked?.id || ""} />
        <label className="block">
          <span className={lbl}>Tên game</span>
          <input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên game" className={`${inp} !w-52`} />
        </label>
        <ImageUrlField />
        <label className="block">
          <span className={lbl}>Giá bán (VNĐ)</span>
          <input name="price" type="number" min={0} required placeholder="1150000" className={`${inp} !w-36`} />
        </label>
        <button disabled={!picked} className="btn-primary btn-row !px-3.5 disabled:opacity-50">Thêm game</button>
      </form>
      {!picked && <p className="mt-1.5 text-xs text-slate-400">Tìm game hoặc kiểm chứng AppID ở khung trên trước — nút Thêm chỉ mở khi đã chọn đúng game từ nguồn. Giá thật chốt theo offer rẻ nhất lúc mua.</p>}
    </div>
  );
}

/** Thêm gói Telegram Premium: số tháng chọn từ danh sách gói thật của FZR. */
export function TelegramPremiumAddForm({ returnTo }: { returnTo: string }) {
  const [plans, setPlans] = useState<PickItem[] | null>(null);
  const [months, setMonths] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    setBusy(true); setError("");
    const r = await fzrPickSearch("telegram_premium", "");
    setBusy(false);
    if (!r.ok) { setError(r.error || "Lỗi không rõ"); return; }
    setPlans(r.items || []);
    if (r.items?.length) setMonths(r.items[0].id);
  };
  const plan = plans?.find((p) => p.id === months);
  return (
    <form action={famAddTelegramPlan} className="flex flex-wrap items-end gap-2 border-b border-dashed border-slate-100 bg-slate-50/40 px-4 py-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      <label className="block">
        <span className={lbl}>Gói tháng (từ nguồn FZR)</span>
        <span className="flex gap-2">
          <select value={months} onChange={(e) => setMonths(e.target.value)} className={`${inp} !w-44`} required>
            {!plans && <option value="">— Bấm lấy gói từ FZR —</option>}
            {(plans || []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.priceUsd ? ` — $${p.priceUsd}` : ""}</option>)}
          </select>
          <button type="button" onClick={load} disabled={busy} className="btn-ghost btn-sm shrink-0 !px-3 !py-2 disabled:opacity-50">{busy ? "..." : "Lấy từ FZR"}</button>
        </span>
      </label>
      <input type="hidden" name="months" value={months} />
      <label className="block">
        <span className={lbl}>Tên gói</span>
        <input name="name" placeholder={plan ? plan.name : "Premium 3 tháng"} className={`${inp} !w-44`} />
      </label>
      <label className="block">
        <span className={lbl}>Giá bán (VNĐ)</span>
        <input name="price" type="number" min={0} required placeholder="129000" className={`${inp} !w-36`} />
      </label>
      <button disabled={!months} className="btn-primary btn-row !px-3.5 disabled:opacity-50">Thêm gói</button>
      {error && <p className="w-full text-xs font-semibold text-rose-600">{error}</p>}
    </form>
  );
}

type LoadedField = { key: string; label: string; type: "text" | "select"; required: boolean; options?: string[] };

/** Ô ảnh bìa cho các form thêm từ picker: dán URL như cũ HOẶC tải ảnh từ
 *  máy qua pipeline dùng chung (ảnh được đóng dấu mờ, lưu /media/<id>). */
function ImageUrlField() {
  const [v, setV] = useState("");
  return (
    <label className="block">
      <span className={lbl}>Ảnh bìa (URL)</span>
      <span className="flex items-center gap-2">
        <input name="imageUrl" value={v} onChange={(e) => setV(e.target.value)} placeholder="https://…" className={`${inp} !w-44`} />
        <UploadButton onUploaded={setV} />
      </span>
    </label>
  );
}

/** Thêm CATEGORY Top-Up: chọn category từ nguồn -> chọn offer đầu tiên từ
 *  nguồn -> fields[] của category TỰ NẠP từ nhà cung cấp vào form: KEY khoá
 *  cứng (chỉ hiển thị), type + options chỉ đọc, NHÃN sửa được (điền sẵn
 *  nhãn của nhà cung cấp). Lưu kèm fieldsJson gồm key + nhãn admin đặt —
 *  trang khách hiển thị nhãn này, thực thi đơn vẫn gửi key gốc. */
export function TopupAddForm({ returnTo }: { returnTo: string }) {
  const [picked, setPicked] = useState<PickItem | null>(null);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [fields, setFields] = useState<LoadedField[]>([]);
  const [fieldsNote, setFieldsNote] = useState("");
  const { editions, editionId, setEditionId, err } = useEditions("topups", picked?.id || null);
  const edition = editions.find((e) => e.id === editionId);

  useEffect(() => {
    if (!picked) { setFields([]); setFieldsNote(""); return; }
    let live = true;
    setFieldsNote("Đang tải trường tuỳ chỉnh từ nhà cung cấp…");
    fzrPickTopupFields(picked.id).then((r) => {
      if (!live) return;
      if (!r.ok) { setFields([]); setFieldsNote(r.error || "Không tải được trường tuỳ chỉnh"); return; }
      const list = (r.fields || []) as LoadedField[];
      setFields(list);
      if (r.imageUrl) setImageUrl(r.imageUrl);
      setFieldsNote(list.length
        ? `${list.length} trường của nhà cung cấp đã được tải — sửa nhãn tuỳ ý, key giữ nguyên để gửi đơn không sai.`
        : "Danh mục này không có trường tuỳ chỉnh nào phía nhà cung cấp.");
    });
    return () => { live = false; };
  }, [picked]);

  const pick = (it: PickItem) => { setPicked(it); setName(it.name); };
  return (
    <form action={famAddTopupCategory} className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-4 py-3.5">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="categoryId" value={picked?.id || ""} />
      <input type="hidden" name="offerId" value={edition?.id || ""} />
      <input type="hidden" name="offerName" value={edition?.name || ""} />
      <input type="hidden" name="fieldsJson" value={JSON.stringify(fields)} />
      <div className="w-full">
        <span className={lbl}>Chọn category từ nguồn FazerCards</span>
        <PickerBox group="topups" onPick={pick} picked={picked} />
      </div>
      <label className="block min-w-[180px] flex-1">
        <span className={lbl}>Tên danh mục</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Tên hiển thị" className={`${inp} w-full`} />
      </label>
      <label className="block min-w-[180px] flex-1">
        <span className={lbl}>Ảnh bìa (URL)</span>
        <span className="flex items-center gap-2"><input name="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className={`${inp} w-full`} /><UploadButton onUploaded={setImageUrl} /></span>
      </label>
      {editionSelect(editions, editionId, setEditionId)}
      <label className="block">
        <span className={lbl}>Giá bán (VNĐ)</span>
        <input name="price" type="number" min={0} required placeholder="55000" className={`${inp} !w-32`} />
      </label>
      <button disabled={!picked || !edition} className="btn-primary btn-row !px-3.5 disabled:opacity-50">Thêm danh mục</button>
      {err && <p className="w-full text-xs font-semibold text-rose-600">{err}</p>}
      {(fieldsNote || fields.length > 0) && (
        <div className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
          <div className="mb-2 text-xs font-bold text-slate-600">Trường tuỳ chỉnh của nhà cung cấp</div>
          {fieldsNote && <p className="mb-2 text-xs text-slate-500">{fieldsNote}</p>}
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={f.key} className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-[11px] font-semibold text-white" title="Key của nhà cung cấp — khoá cứng, không sửa được">{f.key}</span>
                <span className="text-[11px] font-medium text-slate-400">
                  {f.type === "select" ? `Chọn 1 trong: ${(f.options || []).join(", ") || "—"}` : "Ô nhập 1 dòng"}{f.required ? " · Bắt buộc" : ""}
                </span>
                <label className="block min-w-[200px] flex-1">
                  <input
                    value={f.label}
                    onChange={(e) => setFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="Nhãn hiển thị cho khách"
                    className={`${inp} w-full`}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

/** Thêm DỊCH VỤ Manual Services: chọn category từ nguồn -> chọn offer đầu
 *  từ nguồn -> kind + info + fields[] (chỉ replenishment) TỰ NẠP từ nhà
 *  cung cấp vào form: kind/info chỉ đọc (dữ liệu NCC), KEY trường khoá
 *  cứng, NHÃN trường sửa được. delivery_minutes/note_product của offer do
 *  máy chủ nạp lại khi lưu — form không mang hai giá trị này. */
export function ManualAddForm({ returnTo }: { returnTo: string }) {
  const [picked, setPicked] = useState<PickItem | null>(null);
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [kind, setKind] = useState("");
  const [info, setInfo] = useState("");
  const [fields, setFields] = useState<LoadedField[]>([]);
  const [fieldsNote, setFieldsNote] = useState("");
  const { editions, editionId, setEditionId, err } = useEditions("manual", picked?.id || null);
  const edition = editions.find((e) => e.id === editionId);

  useEffect(() => {
    if (!picked) { setFields([]); setFieldsNote(""); setKind(""); setInfo(""); return; }
    let live = true;
    setFieldsNote("Đang tải dữ liệu dịch vụ từ nhà cung cấp…");
    fzrPickManualFields(picked.id).then((r) => {
      if (!live) return;
      if (!r.ok) { setFields([]); setFieldsNote(r.error || "Không tải được dữ liệu dịch vụ"); return; }
      const list = (r.fields || []) as LoadedField[];
      setFields(list);
      setKind(r.kind || picked.extra || "");
      setInfo(r.info || "");
      if (r.imageUrl) setImageUrl(r.imageUrl);
      setFieldsNote(list.length
        ? `${list.length} trường của nhà cung cấp đã được tải — sửa nhãn tuỳ ý, key giữ nguyên để gửi đơn không sai.`
        : "Dịch vụ này không có trường tuỳ chỉnh nào phía nhà cung cấp (chỉ dịch vụ replenishment mới có).");
    });
    return () => { live = false; };
  }, [picked]);

  const pick = (it: PickItem) => { setPicked(it); setName(it.name); };
  return (
    <form action={famAddManualService} className="flex flex-wrap items-end gap-2 border-b border-slate-100 px-4 py-3.5">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="serviceId" value={picked?.id || ""} />
      <input type="hidden" name="offerId" value={edition?.id || ""} />
      <input type="hidden" name="offerName" value={edition?.name || ""} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="info" value={info} />
      <input type="hidden" name="fieldsJson" value={JSON.stringify(fields)} />
      <div className="w-full">
        <span className={lbl}>Chọn dịch vụ từ nguồn FazerCards</span>
        <PickerBox group="manual" onPick={pick} picked={picked} />
      </div>
      <label className="block min-w-[180px] flex-1">
        <span className={lbl}>Tên dịch vụ</span>
        <input name="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Tên hiển thị" className={`${inp} w-full`} />
      </label>
      <label className="block min-w-[180px] flex-1">
        <span className={lbl}>Ảnh bìa (URL)</span>
        <span className="flex items-center gap-2"><input name="imageUrl" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…" className={`${inp} w-full`} /><UploadButton onUploaded={setImageUrl} /></span>
      </label>
      <label className="block">
        <span className={lbl}>Loại giao (kind của NCC)</span>
        <input value={kind || "—"} readOnly className={`${inp} !w-40 bg-slate-50`} />
      </label>
      {editionSelect(editions, editionId, setEditionId)}
      <label className="block">
        <span className={lbl}>Giá bán (VNĐ)</span>
        <input name="price" type="number" min={0} required placeholder="55000" className={`${inp} !w-32`} />
      </label>
      <button disabled={!picked || !edition} className="btn-primary btn-row !px-3.5 disabled:opacity-50">Thêm dịch vụ</button>
      {err && <p className="w-full text-xs font-semibold text-rose-600">{err}</p>}
      {info && (
        <p className="w-full whitespace-pre-line rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
          <span className="font-bold text-slate-600">Info của nhà cung cấp</span> (lưu vào ghi chú sản phẩm, khách thấy ở trang mua): {info}
        </p>
      )}
      {(fieldsNote || fields.length > 0) && (
        <div className="w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
          <div className="mb-2 text-xs font-bold text-slate-600">Trường tuỳ chỉnh của nhà cung cấp</div>
          {fieldsNote && <p className="mb-2 text-xs text-slate-500">{fieldsNote}</p>}
          <div className="space-y-2">
            {fields.map((f, i) => (
              <div key={f.key} className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-slate-800 px-2 py-1 font-mono text-[11px] font-semibold text-white" title="Key của nhà cung cấp — khoá cứng, không sửa được">{f.key}</span>
                <span className="text-[11px] font-medium text-slate-400">Ô nhập 1 dòng · Bắt buộc</span>
                <label className="block min-w-[200px] flex-1">
                  <input
                    value={f.label}
                    onChange={(e) => setFields((prev) => prev.map((x, xi) => (xi === i ? { ...x, label: e.target.value } : x)))}
                    placeholder="Nhãn hiển thị cho khách"
                    className={`${inp} w-full`}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}

/** Thêm offer từ nguồn cho MỘT dịch vụ Manual đã có. */
export function ManualOfferForm({ productId, serviceId, existing, returnTo }: {
  productId: number; serviceId: string | null; existing: string[]; returnTo: string;
}) {
  const { editions, editionId, setEditionId } = useEditions("manual", serviceId);
  const avail = editions.filter((e) => !existing.includes(e.id));
  const edition = avail.find((e) => e.id === editionId) || avail[0];
  if (!serviceId) return null;
  return (
    <form action={famAddManualOffer} className="flex flex-wrap items-end gap-2 px-4 pb-3.5">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="offerId" value={edition?.id || ""} />
      <label className="block min-w-[220px] flex-1">
        <span className={lbl}>Gói từ nguồn</span>
        <select value={edition?.id || ""} onChange={(e) => setEditionId(e.target.value)} className={`${inp} w-full`} required>
          {avail.length === 0 && <option value="">— Đã thêm hết các gói của dịch vụ —</option>}
          {avail.map((e) => (
            <option key={e.id} value={e.id}>{e.name}{e.priceUsd ? ` — $${e.priceUsd}` : ""}{e.extra ? ` (${e.extra})` : ""}</option>
          ))}
        </select>
      </label>
      <label className="block min-w-[160px] flex-1">
        <span className={lbl}>Tên gói</span>
        <input name="name" defaultValue={edition?.name || ""} key={edition?.id || "none"} required className={`${inp} w-full`} />
      </label>
      <label className="block">
        <span className={lbl}>Giá bán (VNĐ)</span>
        <input name="price" type="number" min={0} required placeholder="55000" className={`${inp} !w-32`} />
      </label>
      <button disabled={!edition} className="btn-ghost btn-row !px-3.5 disabled:opacity-50">Thêm gói</button>
    </form>
  );
}

/** Thêm gói nạp (offer) từ nguồn cho MỘT category Top-Up đã có. */
export function TopupOfferForm({ productId, categoryId, existing, returnTo }: {
  productId: number; categoryId: string | null; existing: string[]; returnTo: string;
}) {
  const { editions, editionId, setEditionId } = useEditions("topups", categoryId);
  const avail = editions.filter((e) => !existing.includes(e.id));
  const edition = avail.find((e) => e.id === editionId) || avail[0];
  if (!categoryId) return null;
  return (
    <form action={famAddTopupOffer} className="flex flex-wrap items-end gap-2 px-4 pb-3.5">
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="offerId" value={edition?.id || ""} />
      <label className="block min-w-[220px] flex-1">
        <span className={lbl}>Gói nạp từ nguồn</span>
        <select value={edition?.id || ""} onChange={(e) => setEditionId(e.target.value)} className={`${inp} w-full`} required>
          {avail.length === 0 && <option value="">— Đã thêm hết các gói của danh mục —</option>}
          {avail.map((e) => (
            <option key={e.id} value={e.id}>{e.name}{e.priceUsd ? ` — $${e.priceUsd}` : ""}</option>
          ))}
        </select>
      </label>
      <label className="block min-w-[160px] flex-1">
        <span className={lbl}>Tên gói</span>
        <input name="name" defaultValue={edition?.name || ""} key={edition?.id || "none"} required className={`${inp} w-full`} />
      </label>
      <label className="block">
        <span className={lbl}>Giá bán (VNĐ)</span>
        <input name="price" type="number" min={0} required placeholder="55000" className={`${inp} !w-32`} />
      </label>
      <button disabled={!edition} className="btn-ghost btn-row !px-3.5 disabled:opacity-50">Thêm gói nạp</button>
    </form>
  );
}
