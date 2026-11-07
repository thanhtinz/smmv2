/** Thẻ xuất CSV báo cáo: chọn loại dữ liệu + khoảng ngày rồi tải file.
 *  Dùng form GET thẳng tới route export (admin mẹ / panel-admin truyền base khác nhau). */
export function ExportCsvCard({ base }: { base: string }) {
  const inputCls = "rounded-lg border border-slate-200 px-2.5 py-2 text-sm";
  return (
    <form action={base} method="get" className="card mb-6 flex flex-wrap items-end gap-3 p-5">
      <div className="mr-2">
        <div className="font-bold text-slate-900">Xuất báo cáo CSV</div>
        <p className="mt-0.5 text-sm text-slate-500">Tải dữ liệu ra file CSV (mở bằng Excel) theo khoảng ngày.</p>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Loại dữ liệu
        <select name="type" className={inputCls} defaultValue="smm">
          <option value="smm">Đơn SMM</option>
          <option value="premium">Đơn Premium</option>
          <option value="deposits">Nạp tiền</option>
          <option value="transactions">Giao dịch ví</option>
          <option value="users">Khách hàng</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Từ ngày
        <input type="date" name="from" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">Đến ngày
        <input type="date" name="to" className={inputCls} />
      </label>
      <button className="btn-primary !py-2">Tải CSV</button>
    </form>
  );
}
