import { SiteHeader, SiteFooter } from "@/components/site";
import { getSettings } from "@/lib/settings";

export default async function ApiDocsPage() {
  const s = await getSettings();
  const base = (process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn") + "/api/v2";
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full">
        <h1 className="text-3xl font-extrabold text-slate-900">API cho đại lý (SMM API v2)</h1>
        <p className="text-slate-500 mt-3 leading-relaxed">
          Chuẩn API chung của các SMM panel (tương thích Perfect Panel): một endpoint duy nhất, xác thực bằng API key cá nhân.
          Lấy key tại <b>Bảng điều khiển → API đại lý</b> sau khi đăng nhập. Tiền tệ: VND, giá dịch vụ tính trên 1000 lượt.
        </p>
        <div className="card p-5 mt-6 font-mono text-sm break-all">POST {base}</div>

        <Section title="1. Lấy danh sách dịch vụ" code={`key=YOUR_KEY&action=services`} res={`[
  { "service": 12, "name": "TikTok Followers | ...", "type": "Default",
    "category": "TikTok Followers", "rate": "25000", "min": 10, "max": 100000,
    "refill": true, "cancel": false, "dripfeed": false }
]`} />
        <Section title="2. Xem số dư" code={`key=YOUR_KEY&action=balance`} res={`{ "balance": "1500000", "currency": "VND" }`} />
        <Section title="3. Đặt đơn" code={`key=YOUR_KEY&action=add&service=12&link=https://www.tiktok.com/@user&quantity=1000`} res={`{ "order": 48213 }`} />
        <Section title="4. Trạng thái 1 đơn" code={`key=YOUR_KEY&action=status&order=48213`} res={`{ "charge": "25000", "start_count": 1200, "status": "In progress", "remains": 300, "currency": "VND" }
Trạng thái: Pending | Processing | In progress | Completed | Partial | Canceled`} />
        <Section title="5. Trạng thái nhiều đơn (tối đa 100)" code={`key=YOUR_KEY&action=orders&orders=48213,48214`} res={`{ "48213": { "charge": "25000", "start_count": 1200, "status": "Completed", "remains": 0, "currency": "VND" } }`} />
        <Section title="6. Huỷ đơn (chỉ dịch vụ cho phép huỷ, khi còn Pending/Processing)" code={`key=YOUR_KEY&action=cancel&orders=48213`} res={`[ { "order": 48213, "cancel": true } ]`} />
        <Section title="7. Yêu cầu refill (bù tụt)" code={`key=YOUR_KEY&action=refill&order=48213`} res={`{ "refill": 48213 }`} />

        <div className="border-t border-slate-200 mt-10 pt-8">
          <h2 className="text-2xl font-extrabold text-slate-900">API mua sản phẩm Premium</h2>
          <p className="text-slate-500 mt-2">Cùng endpoint và key như trên — theo đúng chuẩn API sản phẩm kiểu ThaTim để bạn tích hợp vào panel/shop của mình.</p>
        </div>
        <Section title="8. Danh mục + sản phẩm Premium" code={`key=YOUR_KEY&action=category`} res={`[
  { "id": 1, "name": "Xem phim & Video", "products": [
    { "id": 5, "name": "Netflix Premium 4K", "cycles": [
      { "variant": 21, "cycle": null, "name": "1 tháng — 1 profile 4K", "price": 70000 } ] } ] }
]`} />
        <Section title="9. Mua sản phẩm" code={`key=YOUR_KEY&action=buy&product=21&note=email-nhan-goi@gmail.com
# hoặc theo sản phẩm + chu kỳ (kiểu ThaTim):
key=YOUR_KEY&action=buy&product=5&cycle=1&note=email-nhan-goi@gmail.com`} res={`{ "order_code": "PRE100042", "status": "DELIVERED", "delivery": "..." }
Sản phẩm kho tự động được giao ngay trong response; sản phẩm thủ công/đấu API trả status PENDING và nội dung giao xuất hiện trong history khi hoàn tất.`} />
        <Section title="10. Lịch sử mua sản phẩm" code={`key=YOUR_KEY&action=history
key=YOUR_KEY&action=history&ids=PRE100042,PRE100043`} res={`[
  { "order_code": "PRE100042", "product": "Netflix Premium 4K", "variant": "1 tháng — 1 profile 4K",
    "price": 70000, "status": "DELIVERED", "delivery": "Email: ... | Mật khẩu: ...", "created_at": "..." }
]`} />
        <Section title="Tham số phụ khi đặt đơn SMM (dịch vụ đặc thù)" code={`# Dịch vụ comment: comments = nội dung, mỗi dòng 1 comment
key=...&action=add&service=31&link=...&quantity=2&comments=Hay quá\\nRất chất lượng
# Dịch vụ cảm xúc: reaction = like|love|haha|wow|sad|angry (nhiều loại cách nhau dấu |)
key=...&action=add&service=9&link=...&quantity=100&reaction=like|love
# Dịch vụ watch time: minutes / duration; gói subscription: posts
key=...&action=add&service=40&link=...&quantity=100&minutes=30`} res={`Các tham số này được chuyển thẳng sang nhà cung cấp nguồn (kiểu ThaTim) khi dịch vụ đấu API.`} />

        <div className="card p-6 mt-8">
          <h3 className="font-bold text-slate-900 mb-2">Lưu ý tích hợp panel con</h3>
          <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
            <li>API của {s.site_name} đóng vai trò nhà cung cấp: bạn có thể khai báo URL <span className="font-mono">{base}</span> và key của bạn vào bất kỳ panel nào hỗ trợ chuẩn SMM v2 để bán lại.</li>
            <li>Đơn Partial được hoàn tiền tự động phần chưa chạy — số dư của bạn luôn khớp trạng thái đơn.</li>
            <li>Nâng cấp bậc (Đại lý +5%, Tổng đại lý +10%, VIP +15% chiết khấu) bằng cách nạp và doanh số tích luỹ — liên hệ hỗ trợ để xét duyệt.</li>
          </ul>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}

function Section({ title, code, res }: { title: string; code: string; res: string }) {
  return (
    <section className="mt-8">
      <h2 className="font-bold text-slate-900">{title}</h2>
      <pre className="bg-slate-950 text-slate-100 rounded-2xl p-4 text-xs sm:text-sm overflow-x-auto mt-3">{code}</pre>
      <pre className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs sm:text-sm overflow-x-auto mt-2 text-slate-600">{res}</pre>
    </section>
  );
}
