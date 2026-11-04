import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { BackLink, Flash } from "@/components/ui";
import { adminSaveService } from "@/app/actions/admin";
import { PLATFORMS } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AdminServiceForm({ params, searchParams }: { params: { id: string }; searchParams: { msg?: string; err?: string } }) {
  const isNew = params.id === "moi";
  const service = isNew ? null : await prisma.smmService.findUnique({ where: { id: parseInt(params.id) } });
  if (!isNew && !service) notFound();
  const [categories, providers] = await Promise.all([
    prisma.smmCategory.findMany({ orderBy: { sort: "asc" } }),
    prisma.provider.findMany({ orderBy: { id: "asc" } }),
  ]);
  const s = service;
  return (
    <div className="max-w-3xl">
      <BackLink href="/admin/dich-vu">Danh sách dịch vụ</BackLink>
      <h1 className="text-2xl font-bold text-slate-900 mb-5">{isNew ? "Thêm dịch vụ SMM" : `Sửa dịch vụ #${s!.id}`}</h1>
      <Flash msg={searchParams.msg} err={searchParams.err} />
      <form action={adminSaveService} className="card p-6 space-y-4">
        <input type="hidden" name="id" value={s?.id || 0} />
        <div>
          <label className="lbl">Danh mục</label>
          <select className="inp" name="categoryId" defaultValue={s?.categoryId || ""} required>
            <option value="" disabled>— Chọn danh mục —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{PLATFORMS[c.platform]} — {c.name}</option>)}
          </select>
        </div>
        <div><label className="lbl">Tên dịch vụ</label><input className="inp" name="name" required defaultValue={s?.name || ""} /></div>
        <div><label className="lbl">Mô tả (khách thấy khi đặt đơn)</label><textarea className="inp" name="description" rows={4} defaultValue={s?.description || ""} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Giá bán / 1000 (VND)</label><input className="inp" name="rate" type="number" required defaultValue={s?.rate ?? ""} /></div>
          <div><label className="lbl">Giá vốn / 1000 (VND)</label><input className="inp" name="costRate" type="number" defaultValue={s?.costRate ?? 0} /></div>
          <div><label className="lbl">Số lượng tối thiểu</label><input className="inp" name="min" type="number" defaultValue={s?.min ?? 10} /></div>
          <div><label className="lbl">Số lượng tối đa</label><input className="inp" name="max" type="number" defaultValue={s?.max ?? 100000} /></div>
          <div><label className="lbl">Thời gian dự kiến</label><input className="inp" name="avgTime" defaultValue={s?.avgTime || ""} placeholder="Vd: 0-15 phút" /></div>
          <div><label className="lbl">Thứ tự hiển thị</label><input className="inp" name="sort" type="number" defaultValue={s?.sort ?? 0} /></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="lbl">Hình thức xử lý</label>
            <select className="inp" name="fulfillment" defaultValue={s?.fulfillment || "MANUAL"}>
              <option value="MANUAL">Thủ công (admin xử lý trong hàng đợi đơn)</option>
              <option value="API">Tự động qua API nhà cung cấp</option>
            </select>
          </div>
          <div>
            <label className="lbl">Nhà cung cấp (khi chọn API)</label>
            <select className="inp" name="providerId" defaultValue={s?.providerId || ""}>
              <option value="">— Chưa chọn —</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        </div>
        <div><label className="lbl">ID dịch vụ phía nhà cung cấp (khi chọn API)</label><input className="inp" name="providerServiceId" defaultValue={s?.providerServiceId || ""} placeholder="Vd: 1234" /></div>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="refill" defaultChecked={s?.refill} className="w-4 h-4" /> Có bảo hành bù (refill)</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="cancelable" defaultChecked={s?.cancelable} className="w-4 h-4" /> Cho phép huỷ</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="dripfeed" defaultChecked={s?.dripfeed} className="w-4 h-4" /> Hỗ trợ drip-feed</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={s ? s.active : true} className="w-4 h-4" /> Đang bán</label>
        </div>
        <button className="btn-primary w-full !py-3">{isNew ? "Thêm dịch vụ" : "Lưu thay đổi"}</button>
      </form>
    </div>
  );
}
