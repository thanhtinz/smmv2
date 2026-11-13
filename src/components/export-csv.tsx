import { getServerI18n } from "@/lib/lang-server";

/** Thẻ xuất CSV báo cáo: chọn loại dữ liệu + khoảng ngày rồi tải file.
 *  Dùng form GET thẳng tới route export (admin mẹ / panel-admin truyền base khác nhau).
 *  Lưu ý: chỉ nhãn giao diện của thẻ được dịch tại render; nội dung file CSV tải xuống
 *  do route export sinh, không qua M()/vnd() ở đây. */
export async function ExportCsvCard({ base }: { base: string }) {
  const { L } = await getServerI18n();
  const inputCls = "rounded-lg border border-slate-200 px-2.5 py-2 text-sm";
  return (
    <form action={base} method="get" className="card mb-6 flex flex-wrap items-end gap-3 p-5">
      <div className="mr-2">
        <div className="font-bold text-slate-900">{L("Xuất báo cáo CSV")}</div>
        <p className="mt-0.5 text-sm text-slate-500">{L("Tải dữ liệu ra file CSV (mở bằng Excel) theo khoảng ngày.")}</p>
      </div>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">{L("Loại dữ liệu")}
        <select name="type" className={inputCls} defaultValue="premium">
          <option value="premium">{L("Đơn Premium")}</option>
          <option value="deposits">{L("Nạp tiền")}</option>
          <option value="transactions">{L("Giao dịch ví")}</option>
          <option value="users">{L("Khách hàng")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">{L("Từ ngày")}
        <input type="date" name="from" className={inputCls} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-semibold text-slate-500">{L("Đến ngày")}
        <input type="date" name="to" className={inputCls} />
      </label>
      <button className="btn-primary !py-2">{L("Tải CSV")}</button>
    </form>
  );
}
