/** Lớp giao diện dùng chung cho mọi trang auth (mẫu shopkey): thẻ trắng
 *  ~600px viền mảnh bo ~12px, ô nhập xám nhạt chỉ placeholder, nút chính
 *  chữ hoa đậm. Module thuần chuỗi — import được cả phía server lẫn client. */
export const authCardCls =
  "w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10";
export const authSwitchCardCls =
  "mt-5 w-full rounded-xl border border-slate-200 bg-white px-6 py-5 text-center text-sm text-slate-500 shadow-sm";
export const authInpCls = "inp border-slate-200 bg-slate-100 py-3 focus:bg-white";
export const authBtnCls = "btn-primary w-full !py-3 text-sm font-extrabold uppercase tracking-wide";
