import { getSettings } from "@/lib/settings";
import { requireAdminPage } from "@/lib/auth";
import { PageHead, Flash, I } from "@/components/ui";
import { CopyBtn } from "@/components/client";
import { adminSaveSettings } from "@/app/actions/admin";
import SettingsTabs from "@/components/settings-tabs";
import { BonusTiersEditor, TelegramBotsEditor, ToolKeyField } from "@/components/settings-editors";
import { RichTextEditor } from "@/components/rich-editor";
import { ImageUpload } from "@/components/image-upload";
import { getServerI18n } from "@/lib/lang-server";
import { parseSeasonalTheme, type SeasonalTheme } from "@/lib/seasonal";

export const dynamic = "force-dynamic";

/* ---- Trang trí mùa lễ hội: 9 chủ đề + bản xem trước mini (mẫu hạt rơi,
 * dùng đúng hình/màu hạt thật trong components/seasonal-decor — trang trí
 * chỉ còn hiệu ứng hạt rơi, không vòng treo/vật phẩm). ---- */
const SEASONAL_OPTIONS: Array<{ theme: SeasonalTheme; name: string; desc: string }> = [
  { theme: "tet", name: "Tết Nguyên Đán", desc: "Cánh hoa đào và hoa mai rơi" },
  { theme: "noel", name: "Giáng sinh", desc: "Tuyết rơi" },
  { theme: "halloween", name: "Halloween", desc: "Lá thu rơi và dơi bay" },
  { theme: "trungthu", name: "Trung thu", desc: "Sao sáng và đốm lồng đèn trôi" },
  { theme: "phucsinh", name: "Lễ Phục sinh", desc: "Trứng pastel và cánh hoa xuân rơi" },
  { theme: "blackfriday", name: "Black Friday", desc: "Thẻ giảm giá và giấy màu rơi" },
  { theme: "valentine", name: "Lễ Tình nhân", desc: "Trái tim hồng đỏ rơi" },
  { theme: "nammoi", name: "Năm mới", desc: "Giấy màu và tia lửa vàng rơi" },
  { theme: "quockhanh", name: "Quốc khánh", desc: "Sao vàng và giấy màu đỏ vàng rơi" },
];

/** Ô xem trước: nền tối nhẹ rải các hạt đúng hình/màu của hiệu ứng thật —
 *  mai vàng + cánh đào (Tết), bông tuyết (Noel), lá cam + dơi (Halloween),
 *  sao + đốm sáng (Trung thu), trứng pastel (Phục sinh), thẻ giá (Black
 *  Friday), trái tim (Valentine), giấy màu + tia lửa (Năm mới), sao vàng
 *  + giấy màu đỏ vàng (Quốc khánh). */
function SeasonalPreview({ theme }: { theme: SeasonalTheme }) {
  const bg = theme === "tet" ? "#FFF7ED" : theme === "noel" ? "#EFF6FF" : theme === "halloween" ? "#1F2937"
    : theme === "phucsinh" ? "#F0FDF4" : theme === "blackfriday" ? "#111827" : theme === "valentine" ? "#FFF1F2"
    : theme === "nammoi" ? "#172554" : theme === "quockhanh" ? "#7F1D1D" : "#1E1B4B";
  return (
    <svg viewBox="0 0 132 46" className="block h-11 w-full" aria-hidden>
      <rect x="0" y="0" width="132" height="46" rx="4" fill={bg} />
      {theme === "tet" && (
        <g>
          {[[18, 12], [52, 30], [88, 10], [116, 26]].map(([x, y], i) => (
            <path key={i} transform={`translate(${x},${y}) rotate(${i * 37})`} d="M0,-5 C3.4,-1.8 2.6,3.2 0,5.6 C-2.6,3.2 -3.4,-1.8 0,-5 Z" fill={["#F8A5C2", "#FFD1DC", "#F8A5C2", "#FCE4EC"][i]} />
          ))}
          {[[34, 22], [70, 14], [102, 34]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              {[0, 72, 144, 216, 288].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                return <circle key={deg} cx={Math.cos(rad) * 2.6} cy={Math.sin(rad) * 2.6} r="2.1" fill="#FFC93C" />;
              })}
              <circle r="1.3" fill="#E8590C" />
            </g>
          ))}
        </g>
      )}
      {theme === "noel" && (
        <g stroke="#FFFFFF" strokeWidth="1.1" strokeLinecap="round">
          {[[16, 12, 4.6], [42, 28, 3.4], [66, 10, 5.2], [90, 24, 3.8], [114, 12, 4.4], [28, 36, 3], [78, 36, 3.2], [104, 38, 2.8]].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x},${y})`}>
              <path d={`M${-s},0 H${s} M${-s * 0.7},${-s * 0.7} L${s * 0.7},${s * 0.7} M${-s * 0.7},${s * 0.7} L${s * 0.7},${-s * 0.7}`} />
              <circle r="1.2" fill="#FFFFFF" stroke="none" />
            </g>
          ))}
        </g>
      )}
      {theme === "halloween" && (
        <g>
          {[[20, 14], [50, 30], [84, 28], [112, 12]].map(([x, y], i) => (
            <path key={i} transform={`translate(${x},${y}) rotate(${i * 43 - 20})`} d="M0,-5.6 C3.8,-2 3,3.6 0,6.2 C-3,3.6 -3.8,-2 0,-5.6 Z" fill={["#F97316", "#F59E0B", "#EA580C", "#B45309"][i]} />
          ))}
          <path transform="translate(66,14)" d="M0,-1.4 C-2.6,-4.6 -7.4,-5 -10.6,-2.4 C-8.8,-1.2 -8.2,0.2 -8.4,1.8 C-5.6,0 -2.6,0.4 0,2.6 C2.6,0.4 5.6,0 8.4,1.8 C8.2,0.2 8.8,-1.2 10.6,-2.4 C7.4,-5 2.6,-4.6 0,-1.4 Z" fill="#0B0F16" />
        </g>
      )}
      {theme === "trungthu" && (
        <g>
          {[[24, 14, "#FDE68A"], [64, 30, "#FBCFE8"], [104, 12, "#FDE68A"]].map(([x, y, c], i) => (
            <path key={i} transform={`translate(${x},${y})`} d="M0,-6 C0.8,-1.6 1.6,-0.8 6,0 C1.6,0.8 0.8,1.6 0,6 C-0.8,1.6 -1.6,0.8 -6,0 C-1.6,-0.8 -0.8,-1.6 0,-6 Z" fill={c as string} />
          ))}
          {[[44, 34, "#FB923C"], [86, 34, "#38BDF8"], [120, 32, "#F472B6"]].map(([x, y, c], i) => (
            <g key={i}>
              <circle cx={x as number} cy={y as number} r="6.5" fill={c as string} opacity="0.28" />
              <circle cx={x as number} cy={y as number} r="2.6" fill={c as string} opacity="0.9" />
            </g>
          ))}
        </g>
      )}
      {theme === "phucsinh" && (
        <g>
          {[[24, 18, "#FBCFE8", "#F472B6"], [62, 26, "#A7F3D0", "#34D399"], [100, 16, "#DDD6FE", "#8B5CF6"]].map(([x, y, b, d], i) => (
            <g key={i} transform={`translate(${x},${y}) rotate(${i * 14 - 10})`}>
              <path d="M0,-7 C3.2,-7 5.4,-2.8 5.4,0.6 C5.4,4.4 3.2,7 0,7 C-3.2,7 -5.4,4.4 -5.4,0.6 C-5.4,-2.8 -3.2,-7 0,-7 Z" fill={b as string} />
              {i === 0 && <g fill={d as string}><circle cx="-2" cy="-2" r="1.1" /><circle cx="2.2" cy="0.6" r="1.1" /><circle cx="-1.4" cy="3.4" r="1.1" /></g>}
              {i === 1 && <g fill={d as string}><rect x="-5.4" y="-2.6" width="10.8" height="1.8" /><rect x="-5.4" y="1.6" width="10.8" height="1.8" /></g>}
              {i === 2 && <path d="M-5,0.4 L-2.5,-1.4 L0,0.4 L2.5,-1.4 L5,0.4" stroke={d as string} strokeWidth="1.4" fill="none" />}
            </g>
          ))}
          {[[42, 12], [84, 34], [118, 32]].map(([x, y], i) => (
            <path key={i} transform={`translate(${x},${y}) rotate(${i * 41})`} d="M0,-4.6 C3,-1.6 2.4,3 0,5.2 C-2.4,3 -3,-1.6 0,-4.6 Z" fill={["#F8BBD0", "#FFFFFF", "#FCE4EC"][i]} />
          ))}
        </g>
      )}
      {theme === "blackfriday" && (
        <g>
          {[[34, 20, "#DC2626"], [92, 26, "#111827"]].map(([x, y, c], i) => (
            <g key={i} transform={`translate(${x},${y}) rotate(${i === 0 ? -14 : 12})`}>
              <path d="M-13,-6.4 L2,-6.4 L13,0 L2,6.4 L-13,6.4 Z" fill={c as string} stroke="#374151" strokeWidth="0.7" />
              <circle cx="-8" cy="0" r="1.7" fill="#F9FAFB" />
              <text x="2.5" y="0.5" textAnchor="middle" dominantBaseline="middle" fontSize="9" fontWeight="700" fill="#FFFFFF">%</text>
            </g>
          ))}
          {[[12, 34, "#F59E0B", 20], [58, 10, "#DC2626", -30], [70, 36, "#FACC15", 45], [116, 10, "#F59E0B", 10], [120, 38, "#DC2626", 60]].map(([x, y, c, r], i) => (
            <rect key={i} x={-4.4} y={-2.4} width="8.8" height="4.8" transform={`translate(${x},${y}) rotate(${r})`} fill={c as string} />
          ))}
        </g>
      )}
      {theme === "valentine" && (
        <g>
          {[[22, 16, "#F43F5E", 1], [52, 30, "#EC4899", 0.78], [82, 14, "#FB7185", 0.9], [110, 28, "#E11D48", 0.84], [38, 36, "#F9A8D4", 0.6], [98, 38, "#F472B6", 0.62]].map(([x, y, c, k], i) => (
            <path key={i} transform={`translate(${x},${y}) scale(${k})`} d="M0,6.4 C-0.8,5.2 -7.4,1.6 -7.4,-2.4 C-7.4,-5.4 -5.2,-7 -3,-7 C-1.2,-7 0,-5.8 0,-4.4 C0,-5.8 1.2,-7 3,-7 C5.2,-7 7.4,-5.4 7.4,-2.4 C7.4,1.6 0.8,5.2 0,6.4 Z" fill={c as string} />
          ))}
        </g>
      )}
      {theme === "nammoi" && (
        <g>
          {[[16, 12, "#EF4444", 24], [38, 30, "#F59E0B", -32], [60, 14, "#10B981", 52], [84, 32, "#3B82F6", 12], [106, 12, "#A855F7", -18], [122, 30, "#EC4899", 38], [28, 38, "#FACC15", 66]].map(([x, y, c, r], i) => (
            <rect key={i} x={-4.6} y={-2.5} width="9.2" height="5" transform={`translate(${x},${y}) rotate(${r})`} fill={c as string} />
          ))}
          {[[48, 36], [96, 22], [118, 38]].map(([x, y], i) => (
            <path key={i} transform={`translate(${x},${y})`} d="M0,-4.6 C0.6,-1.2 1.2,-0.6 4.6,0 C1.2,0.6 0.6,1.2 0,4.6 C-0.6,1.2 -1.2,0.6 -4.6,0 C-1.2,-0.6 -0.6,-1.2 0,-4.6 Z" fill="#FDE047" />
          ))}
        </g>
      )}
      {theme === "quockhanh" && (
        <g>
          {[[26, 16, 6.4], [66, 28, 5.2], [104, 14, 6], [46, 36, 4.4], [118, 34, 4.6]].map(([x, y, s], i) => (
            <path key={i} transform={`translate(${x},${y}) rotate(${i * 18 - 12})`} d={`M0,${-(s as number)} L${(s as number) * 0.24},${-(s as number) * 0.32} L${(s as number) * 0.95},${-(s as number) * 0.31} L${(s as number) * 0.38},${(s as number) * 0.12} L${(s as number) * 0.59},${(s as number) * 0.81} L0,${(s as number) * 0.42} L${-(s as number) * 0.59},${(s as number) * 0.81} L${-(s as number) * 0.38},${(s as number) * 0.12} L${-(s as number) * 0.95},${-(s as number) * 0.31} L${-(s as number) * 0.24},${-(s as number) * 0.32} Z`} fill={["#FACC15", "#F59E0B", "#FDE047", "#FACC15", "#F59E0B"][i]} />
          ))}
          {[[14, 36, "#DC2626", 30], [84, 10, "#F59E0B", -24], [96, 38, "#DC2626", 48]].map(([x, y, c, r], i) => (
            <rect key={i} x={-4.2} y={-2.3} width="8.4" height="4.6" transform={`translate(${x},${y}) rotate(${r})`} fill={c as string} />
          ))}
        </g>
      )}
    </svg>
  );
}

/** Trang Cài đặt admin — dựng theo bố cục panel mẫu: các tab gạch chân cuộn ngang
 *  (Chung → Thanh toán → Email → Telegram → Thông báo → Google → Khuyến mãi →
 *  Giới thiệu → Bảo mật → Cron Job → SMM Tool API → AI Kiểm tra → USDT →
 *  Script/HTML), MỘT nút Lưu cài đặt ở góc phải header cho toàn trang.
 *  (Tab chọn kiểu trang Đăng nhập/Đăng ký đã bỏ — auth chỉ còn MỘT thiết kế.) */
export default async function AdminSettings({ searchParams }: { searchParams: { msg?: string; err?: string } }) {
  await requireAdminPage();
  const { L, Ld } = await getServerI18n(null);
  const s = await getSettings();
  const seasonalTheme = parseSeasonalTheme(s.seasonal_theme) || "tet";
  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://your-domain.vn";
  const cronUrl = `${base}/api/cron/sync?secret=${s.cron_secret || "<CRON_SECRET>"}&services=1`;
  const webhookUrl = `${base}/api/webhooks/sepay`;

  const infoBox = "rounded-xl bg-brand-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600";
  const warnBox = "rounded-xl bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-700";

  /* ---------------- Chung ---------------- */
  const chung = (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
      <div className="space-y-6">
        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">{L("Thương hiệu")}</div>
          <div><label className="lbl">{L("Tên website")}</label><input className="inp" name="site_name" defaultValue={s.site_name} /></div>
          <div><label className="lbl">{L("Khẩu hiệu (tagline)")}</label><input className="inp" name="site_tagline" defaultValue={s.site_tagline} /></div>
          <div><label className="lbl">{L("Logo (để trống dùng chữ viết tắt)")}</label><ImageUpload name="logo_url" defaultValue={s.logo_url} stamp={false} /><p className="mt-1 text-xs text-slate-400">{L("PNG, JPG — hiển thị ở header. Logo là dấu hiệu thương hiệu nên KHÔNG bị đóng dấu mờ.")}</p></div>
          <div><label className="lbl">{L("Logo menu (ảnh ngang — để trống dùng logo nhỏ)")}</label><ImageUpload name="logo_menu_url" defaultValue={s.logo_menu_url} stamp={false} /><p className="mt-1 text-xs text-slate-400">{L("PNG, JPG — hiển thị ở đầu ngăn kéo menu trên điện thoại.")}</p></div>
          <div><label className="lbl">{L("Favicon")}</label><ImageUpload name="favicon_url" defaultValue={s.favicon_url} stamp={false} previewClass="h-16 w-16" /><p className="mt-1 text-xs text-slate-400">{L("Ảnh vuông (tỉ lệ 1x1) hiển thị trên tab trình duyệt, ICO hoặc PNG.")}</p></div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="text-sm font-bold text-slate-800">{L("Đóng dấu mờ (watermark) lên ảnh tải lên")}</div>
            <p className="mt-1 text-xs text-slate-400">{L("Ảnh sản phẩm, banner, ảnh bìa... tải lên qua các ô ảnh trong admin sẽ có thêm bản đã đóng dấu mờ lặp chéo; mặt công khai chỉ hiển thị bản đó. Logo/favicon không bị đóng dấu.")}</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div><label className="lbl">{L("Bật đóng dấu")}</label><select className="inp" name="watermark_enabled" defaultValue={s.watermark_enabled || "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt")}</option></select></div>
              <div><label className="lbl">{L("Chữ đóng dấu (để trống = tên website)")}</label><input className="inp" name="watermark_text" defaultValue={s.watermark_text} placeholder={s.site_name} /></div>
              <div><label className="lbl">{L("Độ đậm dấu mờ (%)")}</label><input className="inp" name="watermark_opacity" type="number" min={5} max={80} defaultValue={s.watermark_opacity || "35"} /></div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="lbl">{L("Màu chủ đạo mặc định (khách mới)")}</label>
              <select className="inp" name="default_accent" defaultValue={s.default_accent || "blue"}>
                <option value="blue">{L("Xanh dương")}</option><option value="violet">{L("Tím")}</option><option value="emerald">{L("Xanh lá")}</option>
                <option value="orange">{L("Cam")}</option><option value="rose">{L("Hồng")}</option><option value="teal">{L("Ngọc")}</option>
              </select>
            </div>
            <div>
              <label className="lbl">{L("Chế độ nền mặc định")}</label>
              <select className="inp" name="default_mode" defaultValue={s.default_mode || "light"}>
                <option value="light">{L("Sáng")}</option><option value="dark">{L("Tối")}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="lbl">{L("Chế độ bảo trì (chặn khách, admin vẫn vào được)")}</label>
            <select className="inp" name="maintenance" defaultValue={s.maintenance === "1" ? "1" : "0"}>
              <option value="0">{L("Tắt — site hoạt động bình thường")}</option>
              <option value="1">{L("Bật — đang bảo trì")}</option>
            </select>
          </div>
        </section>
        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">{L("Thông tin khác")}</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="lbl">{L("Email liên hệ")}</label><input className="inp" name="contact_email" defaultValue={s.contact_email} placeholder="support@domain.vn" /></div>
            <div><label className="lbl">Hotline</label><input className="inp" name="support_hotline" defaultValue={s.support_hotline} /></div>
            <div><label className="lbl">{L("Telegram hỗ trợ")}</label><input className="inp" name="support_telegram" defaultValue={s.support_telegram} placeholder="@username" /></div>
            <div><label className="lbl">{L("Zalo hỗ trợ (số điện thoại hoặc link)")}</label><input className="inp" name="support_zalo" defaultValue={s.support_zalo} placeholder={L("09xx xxx xxx hoặc https://zalo.me/...")} /></div>
            <div><label className="lbl">{L("Facebook hỗ trợ")}</label><input className="inp" name="support_facebook" defaultValue={s.support_facebook} /></div>
          </div>
          <div><label className="lbl">{L("Chữ chân trang (footer) — để trống dùng mặc định")}</label><input className="inp" name="footer_text" defaultValue={s.footer_text} /></div>
        </section>
        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">{L("Phân trang danh sách")}</div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div><label className="lbl">{L("Số sản phẩm mỗi trang ở danh mục khách")}</label><input className="inp" name="catalog_page_size" type="number" min="1" max="100" defaultValue={s.catalog_page_size} /></div>
            <div><label className="lbl">{L("Số đơn mỗi trang ở lịch sử khách")}</label><input className="inp" name="history_page_size" type="number" min="1" max="100" defaultValue={s.history_page_size} /></div>
            <div><label className="lbl">{L("Số sản phẩm mỗi trang ở trang quản trị sản phẩm")}</label><input className="inp" name="admin_product_page_size" type="number" min="1" max="100" defaultValue={s.admin_product_page_size} /></div>
            <div><label className="lbl">{L("Số dòng mỗi trang ở danh sách quản trị")}</label><input className="inp" name="admin_list_page_size" type="number" min="1" max="200" defaultValue={s.admin_list_page_size} /></div>
          </div>
          <p className="text-xs text-slate-400">{L("Áp dụng cho danh mục các khu Game Key, Gift Card, Top-Up, Manual Services, các trang lịch sử đơn và toàn bộ trang sản phẩm trong quản trị.")}</p>
        </section>
      </div>
      <div className="space-y-6">
        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">SEO & Meta Tags</div>
          <div><label className="lbl">{L("Mô tả SEO (Meta Description)")}</label><textarea className="inp" name="meta_description" rows={3} defaultValue={s.meta_description} placeholder={L("Mô tả ngắn hiển thị trên Google...")} /><p className="mt-1 text-xs text-slate-400">{L("Khuyến nghị tối đa ~160 ký tự.")}</p></div>
          <div><label className="lbl">{L("Từ khoá SEO (Meta Keywords, cách nhau dấu phẩy)")}</label><input className="inp" name="meta_keywords" defaultValue={s.meta_keywords} /></div>
          <div><label className="lbl">{L("Ảnh chia sẻ (OG Image)")}</label><ImageUpload name="og_image_url" defaultValue={s.og_image_url} stamp /><p className="mt-1 text-xs text-slate-400">{L("Ảnh hiển thị khi chia sẻ link website lên mạng xã hội (Zalo, Facebook...). Kích thước khuyến nghị: 1200x630.")}</p></div>
          <div><label className="lbl">{L("Google Analytics — GA4 Measurement ID")}</label><input className="inp" name="ga_id" defaultValue={s.ga_id} placeholder="G-XXXXXXXXXX" /><p className="mt-1 text-xs text-slate-400">{L("Điền ID đo lường GA4, hệ thống tự chèn mã theo dõi vào mọi trang.")}</p></div>
          <div><label className="lbl">{L("Google Search Console — mã xác minh")}</label><input className="inp" name="gsc_verification" defaultValue={s.gsc_verification} placeholder={L("Mã trong thẻ meta google-site-verification")} /><p className="mt-1 text-xs text-slate-400">{L("Chỉ dán phần mã (content), hệ thống tự sinh thẻ meta xác minh.")}</p></div>
        </section>
        <section className="card p-6 space-y-3">
          <div className="font-bold text-slate-900">{L("Xem trước SEO (Google)")}</div>
          <div className="rounded-xl border border-slate-200 px-4 py-3">
            <div className="truncate text-lg leading-snug text-[#1a0dab]">{s.site_name || L("Tên website")}{s.site_tagline ? ` — ${s.site_tagline}` : ""}</div>
            <div className="truncate text-sm text-[#006621]">{base.replace(/^https?:\/\//, "")}</div>
            <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-slate-600">{s.meta_description || L("Chưa có mô tả SEO — điền ở thẻ SEO & Meta Tags phía trên để kết quả tìm kiếm hiển thị đẹp hơn.")}</p>
          </div>
          <p className="text-xs text-slate-400">{L("Bản xem trước theo giá trị đang lưu hiện tại.")}</p>
        </section>
        <section className="card p-6 space-y-4">
          <div className="font-bold text-slate-900">{L("Trang trí mùa lễ hội")}</div>
          <p className="text-xs leading-relaxed text-slate-400">{L("Đến mùa lễ, bật công tắc này là toàn bộ trang khách (trang chủ và khu vực sau khi đăng nhập) có hiệu ứng hạt rơi theo chủ đề đã chọn. Tắt là gỡ sạch hoàn toàn. Khu vực quản trị không hiển thị trang trí.")}</p>
          <div>
            <label className="lbl">{L("Bật trang trí mùa lễ hội")}</label>
            <select className="inp" name="seasonal_decor_enabled" defaultValue={s.seasonal_decor_enabled === "1" ? "1" : "0"}>
              <option value="0">{L("Tắt")}</option>
              <option value="1">{L("Bật")}</option>
            </select>
          </div>
          <div>
            <label className="lbl">{L("Chủ đề trang trí")}</label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
              {SEASONAL_OPTIONS.map((o) => (
                <label key={o.theme} className="cursor-pointer">
                  <input type="radio" name="seasonal_theme" value={o.theme} defaultChecked={seasonalTheme === o.theme} className="peer sr-only" />
                  <div className="rounded-xl border border-slate-200 p-3 transition hover:border-slate-300 peer-checked:border-brand-500 peer-checked:bg-brand-50 peer-checked:ring-1 peer-checked:ring-brand-500">
                    <SeasonalPreview theme={o.theme} />
                    <div className="mt-2 text-sm font-semibold text-slate-800">{L(o.name)}</div>
                    <div className="text-xs text-slate-400">{L(o.desc)}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </section>
              </div>
    </div>
  );

  /* ---------------- Thanh toán ---------------- */
  const thanhtoan = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Tài khoản nhận tiền (dự phòng)")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">{L("Ngân hàng")}</label><input className="inp" name="bank_name" defaultValue={s.bank_name} placeholder={L("Vd: MB Bank, Vietcombank...")} /></div>
          <div><label className="lbl">{L("Số tài khoản")}</label><input className="inp" name="bank_account" defaultValue={s.bank_account} /></div>
          <div><label className="lbl">{L("Chủ tài khoản")}</label><input className="inp" name="bank_holder" defaultValue={s.bank_holder} /></div>
          <div><label className="lbl">{L("Chi nhánh")}</label><input className="inp" name="bank_branch" defaultValue={s.bank_branch} /></div>
        </div>
        <p className="text-xs text-slate-400">{L("Nếu đã thêm ngân hàng ở mục")} <b>{L("Ngân hàng")}</b> {L("thì trang Nạp tiền ưu tiên danh sách đó; phần này là dự phòng khi chưa có ngân hàng nào.")}</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Chính sách nạp tiền")}</div>
        <div><label className="lbl">{L("Nạp tối thiểu (VND)")}</label><input className="inp" name="deposit_min" type="number" defaultValue={s.deposit_min} /></div>
        <div><label className="lbl">{L("Ngưỡng cảnh báo số dư nhà cung cấp mặc định (VNĐ) — khi nhà cung cấp chưa đặt riêng")}</label><input className="inp" name="provider_low_balance_default" type="number" min="0" defaultValue={s.provider_low_balance_default} /></div>
        <div><label className="lbl">{L("Tối đa gói định kỳ đang chạy / khách")}</label><input className="inp" name="subscription_max_active" type="number" min="1" defaultValue={s.subscription_max_active} /></div>
        <div><label className="lbl">{L("Auto-refill: cửa sổ xử lý sau khi đơn hoàn thành (ngày)")}</label><input className="inp" name="auto_refill_window_days" type="number" min="1" defaultValue={s.auto_refill_window_days} /></div>
        <div><label className="lbl">{L("Auto-refill: chờ sau hoàn thành (phút)")}</label><input className="inp" name="auto_refill_settle_minutes" type="number" min="0" defaultValue={s.auto_refill_settle_minutes} /></div>
        <div><label className="lbl">{L("Dọn dẹp hệ thống: xoá dữ liệu cũ hơn (ngày)")}</label><input className="inp" name="cleanup_retention_days" type="number" min="1" defaultValue={s.cleanup_retention_days} /></div>
        <div>
          <label className="lbl">{L("Bảo vệ lợi nhuận (chặn đặt đơn khi giá bán sau chiết khấu thấp hơn giá vốn)")}</label>
          <select className="inp" name="profit_protection" defaultValue={s.profit_protection === "0" ? "0" : "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt")}</option></select>
        </div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Thanh toán quốc tế — PayPal & Stripe")}</div>
        <div><label className="lbl">{L("Tỉ giá quy đổi: 1 USD = ? VND")}</label><input className="inp" name="usd_rate" type="number" min="1000" defaultValue={s.usd_rate} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">PayPal</label>
            <select className="inp" name="paypal_enabled" defaultValue={s.paypal_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select></div>
          <div><label className="lbl">{L("Môi trường PayPal")}</label>
            <select className="inp" name="paypal_mode" defaultValue={s.paypal_mode || "sandbox"}><option value="sandbox">{L("Sandbox (thử nghiệm)")}</option><option value="live">{L("Live (thật)")}</option></select></div>
          <div><label className="lbl">PayPal Client ID</label><input className="inp" name="paypal_client_id" defaultValue={s.paypal_client_id} /></div>
          <div><label className="lbl">PayPal Client Secret</label><input className="inp" name="paypal_client_secret" defaultValue={s.paypal_client_secret} /></div>
          <div><label className="lbl">Stripe</label>
            <select className="inp" name="stripe_enabled" defaultValue={s.stripe_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select></div>
          <div><label className="lbl">Stripe Publishable Key</label><input className="inp" name="stripe_publishable_key" defaultValue={s.stripe_publishable_key} /></div>
          <div><label className="lbl">Stripe Secret Key</label><input className="inp" name="stripe_secret_key" defaultValue={s.stripe_secret_key} /></div>
          <div><label className="lbl">Stripe Webhook Secret (whsec_...)</label><input className="inp" name="stripe_webhook_secret" defaultValue={s.stripe_webhook_secret} /></div>
        </div>
        <p className="text-xs text-slate-400">{L("Webhook Stripe trỏ về")} <span className="font-mono">/api/webhooks/stripe</span> {L("(sự kiện checkout.session.completed).")}</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Tỉ giá hiển thị tiền tệ")}</div>
        <p className="text-xs text-slate-400">{L("Khách có thể chọn hiển thị giá theo ngoại tệ ở nút Cài đặt — quy đổi theo tỉ giá dưới đây (1 đơn vị ngoại tệ = ? VND). Tiền thật trong hệ thống vẫn là VND.")}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div><label className="lbl">1 EUR =</label><input className="inp" name="rate_eur" type="number" defaultValue={s.rate_eur} /></div>
          <div><label className="lbl">1 CNY =</label><input className="inp" name="rate_cny" type="number" defaultValue={s.rate_cny} /></div>
          <div><label className="lbl">1 THB =</label><input className="inp" name="rate_thb" type="number" defaultValue={s.rate_thb} /></div>
          <div><label className="lbl">1 JPY =</label><input className="inp" name="rate_jpy" type="number" defaultValue={s.rate_jpy} /></div>
          <div><label className="lbl">1 KRW =</label><input className="inp" name="rate_krw" type="number" defaultValue={s.rate_krw} /></div>
        </div>
      </section>
    </>
  );

  /* ---------------- Email ---------------- */
  const email = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">{L("Cấu hình SMTP Email")}</div>
      <div>
        <label className="lbl">{L("Gửi email qua SMTP")}</label>
        <select className="inp" name="smtp_enabled" defaultValue={s.smtp_enabled === "0" ? "0" : "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt — hệ thống không gửi email")}</option></select>
      </div>
      {s.smtp_enabled === "0" && <div className={warnBox}>{L("SMTP đang tắt — Email xác minh và thông báo sẽ không được gửi.")}</div>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2"><label className="lbl">SMTP Host</label><input className="inp" name="smtp_host" defaultValue={s.smtp_host} placeholder="VD: smtp.gmail.com" /></div>
        <div><label className="lbl">Port</label><input className="inp" name="smtp_port" type="number" defaultValue={s.smtp_port} /></div>
        <div><label className="lbl">{L("Mã hóa")}</label>
          <select className="inp" name="smtp_secure" defaultValue={s.smtp_secure === "1" ? "1" : "0"}><option value="0">{L("STARTTLS (cổng 587)")}</option><option value="1">{L("SSL/TLS (cổng 465)")}</option></select></div>
        <div><label className="lbl">Username</label><input className="inp" name="smtp_user" defaultValue={s.smtp_user} /></div>
        <div><label className="lbl">Password</label><input className="inp" name="smtp_pass" defaultValue={s.smtp_pass} autoComplete="off" /></div>
        <div><label className="lbl">{L("Từ Email (From)")}</label><input className="inp" name="smtp_from" defaultValue={s.smtp_from} placeholder="VD: no-reply@domain.vn" /></div>
        <div><label className="lbl">{L("Từ Tên")}</label><input className="inp" name="smtp_from_name" defaultValue={s.smtp_from_name} placeholder="VD: SMMv2 Support" /></div>
      </div>
      <p className="text-xs text-slate-400">{L("Dùng cho Email Marketing và thông báo hệ thống. Gmail cần bật xác minh 2 bước và tạo App Password. Gửi email thử ở mục")} <b>{L("Email Marketing")}</b>{L(".")}</p>
    </section>
  );

  /* ---------------- Telegram ---------------- */
  const telegram = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Thông báo qua Telegram")}</div>
        <div>
          <label className="lbl">{L("Báo tin qua Telegram")}</label>
          <select className="inp" name="telegram_notify" defaultValue={s.telegram_notify === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật — báo sự kiện hệ thống (đơn mới, nạp tiền, ticket...)")}</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Bot Token</label><input className="inp" name="telegram_bot_token" defaultValue={s.telegram_bot_token} placeholder="123456:ABC-..." autoComplete="off" /></div>
          <div><label className="lbl">Chat ID</label><input className="inp" name="telegram_chat_id" defaultValue={s.telegram_chat_id} placeholder={L("VD: -1001234567890 hoặc 123456789")} /></div>
        </div>
        <div className={infoBox}>{L("Tạo bot qua @BotFather, thêm bot vào nhóm/kênh hoặc nhắn tin cho bot trước, lấy Chat ID qua @userinfobot. Các loại sự kiện được báo và kênh nhận cấu hình thêm ở mục")} <b>{L("Báo cáo & Thông báo")}</b>{L(".")}</div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Thông báo qua Telegram (Nhiều bot)")}</div>
        <TelegramBotsEditor initial={s.telegram_bots} />
      </section>
    </>
  );

  /* ---------------- Thông báo ---------------- */
  const thongbao = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Thông báo hệ thống")}</div>
        <div>
          <label className="lbl">{L("Hiện banner thông báo ở trang chủ của khách")}</label>
          <select className="inp" name="sys_announce_enabled" defaultValue={s.sys_announce_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select>
        </div>
        <div><label className="lbl">{L("Nội dung thông báo (hiện trong banner xanh ở đầu trang chủ của khách)")}</label><RichTextEditor name="sys_announce_content" defaultValue={s.sys_announce_content} minHeight={140} /></div>
        <div><label className="lbl">{L("Thanh thông báo trên cùng (để trống = tắt)")}</label><input className="inp" name="announcement_bar" defaultValue={s.announcement_bar} /></div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Modal thông báo trang chủ")}</div>
        <div>
          <label className="lbl">{L("Hiện modal khi khách vào khu vực tài khoản")}</label>
          <select className="inp" name="home_modal_enabled" defaultValue={s.home_modal_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select>
        </div>
        <div><label className="lbl">{L("Nội dung modal thông báo")}</label><RichTextEditor name="home_modal_content" defaultValue={s.home_modal_content} minHeight={140} /></div>
        <p className="text-xs text-slate-400">{L("Khách bấm \"Đã hiểu\" thì modal ẩn 2 giờ rồi mới hiện lại. Modal này độc lập với thanh thông báo phía trên.")}</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Điều khoản bắt buộc")}</div>
        <div>
          <label className="lbl">{L("Bắt khách xác nhận điều khoản khi vào khu vực tài khoản")}</label>
          <select className="inp" name="terms_enabled" defaultValue={s.terms_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">{L("Tiêu đề Modal điều khoản")}</label><input className="inp" name="terms_title" defaultValue={s.terms_title} /></div>
          <div><label className="lbl">{L("Phiên bản điều khoản (tăng số này = yêu cầu xác nhận lại toàn bộ)")}</label><input className="inp" name="terms_version" type="number" min={1} defaultValue={s.terms_version} /></div>
          <div><label className="lbl">{L("Văn bản Checkbox xác nhận")}</label><input className="inp" name="terms_checkbox_text" defaultValue={s.terms_checkbox_text} /></div>
          <div><label className="lbl">{L("Văn bản Nút bấm xác nhận")}</label><input className="inp" name="terms_button_text" defaultValue={s.terms_button_text} /></div>
        </div>
        <div><label className="lbl">{L("Nội dung điều khoản")}</label><textarea className="inp" name="terms_content" rows={8} defaultValue={s.terms_content} placeholder={L("1. Điều khoản sử dụng...\n2. Chính sách hoàn tiền...")} /></div>
        <p className="text-xs text-slate-400">{L("Khi khách bấm xác nhận, hệ thống ghi lại thời gian và phiên bản điều khoản vào hồ sơ thành viên.")}</p>
      </section>
    </>
  );

  /* ---------------- Google ---------------- */
  const google = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">OAuth 2.0 (Google Login)</div>
      <div className={infoBox}>{L("Cho phép người dùng đăng nhập/đăng ký bằng tài khoản Google. Cấu hình tại Google Cloud Console.")}</div>
      <div>
        <label className="lbl">{L("Bật đăng nhập Google")}</label>
        <select className="inp" name="google_enabled" defaultValue={s.google_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="lbl">Client ID</label><input className="inp" name="google_client_id" defaultValue={s.google_client_id} placeholder="...apps.googleusercontent.com" /><p className="mt-1 text-xs text-slate-400">{L("Lấy từ Google Cloud Console.")}</p></div>
        <div><label className="lbl">Client Secret</label><input className="inp" name="google_client_secret" defaultValue={s.google_client_secret} autoComplete="off" /></div>
        <div className="sm:col-span-2"><label className="lbl">{L("Redirect URI cần khai trong Google Cloud")}</label><input className="inp font-mono" readOnly value={`${base}/api/auth/google/callback`} /></div>
      </div>
      <p className="text-xs text-slate-400">{L("Khách bấm nút Google ở trang đăng nhập: nếu email đã có tài khoản thì vào thẳng, chưa có thì hệ thống tạo tài khoản mới (khi mô-đun Đăng ký đang bật).")}</p>
    </section>
  );

  /* ---------------- Khuyến mãi ---------------- */
  const khuyenmai = (
    <>
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">{L("Khuyến mãi nạp tiền")}</div>
      <div className={infoBox}>{L("Phần thưởng được hiển thị công khai trên trang Nạp tiền khi khách truy cập. Nạp đúng hoặc hơn mốc sẽ nhận phần thưởng tương ứng.")}</div>
      <BonusTiersEditor initial={s.deposit_bonus_tiers} />
      <p className="text-xs text-slate-400">{L("Bảng này áp dụng cho khách của web mẹ. Khách panel con dùng mốc thưởng RIÊNG do chủ panel tự đặt ở Panel Admin — không tính chung với bảng này.")}</p>
    </section>
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">{L("Flash sale")}</div>
      <div><label className="lbl">{L("Giảm giá flash sale tối đa (%)")}</label><input className="inp" name="flash_max_percent" type="number" min="0" max="100" defaultValue={s.flash_max_percent} /></div>
      <p className="text-xs text-slate-400">{L("Đợt flash sale đặt % cao hơn mức này vẫn chỉ giảm tối đa mức này khi tính tiền.")}</p>
    </section>
    </>
  );

  /* ---------------- Giới thiệu ---------------- */
  const gioithieu = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">{L("Chương trình giới thiệu (Affiliate)")}</div>
      <div className={infoBox}>{L("Cho phép người dùng chia sẻ link giới thiệu và nhận hoa hồng trên mỗi giao dịch mua của người được giới thiệu (đặt đơn SMM + mua Premium), cộng thẳng vào số dư chính.")}</div>
      <div>
        <label className="lbl">{L("Bật chương trình giới thiệu")}</label>
        <select className="inp" name="module_affiliate" defaultValue={s.module_affiliate === "0" ? "0" : "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt")}</option></select>
      </div>
      <div><label className="lbl">{L("Tỷ lệ hoa hồng (%)")}</label><input className="inp" name="affiliate_percent" type="number" step="0.5" min="0" max="50" defaultValue={s.affiliate_percent} /></div>
      <p className="text-xs text-slate-400">{L("Ví dụ: người được giới thiệu mua 1.000.000₫, người giới thiệu nhận đúng tỷ lệ % này. Panel con tự đặt % riêng cho khách của mình ở Panel Admin.")}</p>
    </section>
  );

  /* ---------------- Bảo mật ---------------- */
  const baomat = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Phiên đăng nhập & giới hạn")}</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><label className="lbl">{L("Phiên đăng nhập (ngày)")}</label><input className="inp" name="session_days" type="number" min="1" max="90" defaultValue={s.session_days} /></div>
          <div><label className="lbl">{L("Số lượng mua Premium tối đa / đơn")}</label><input className="inp" name="premium_max_qty" type="number" min="1" defaultValue={s.premium_max_qty} /></div>
          <div><label className="lbl">{L("Số link tối đa / lần đặt (nhiều link & hàng loạt)")}</label><input className="inp" name="order_max_links" type="number" min="1" defaultValue={s.order_max_links} /></div>
          <div><label className="lbl">{L("Link đặt lại mật khẩu hết hạn sau (phút)")}</label><input className="inp" name="password_reset_ttl_minutes" type="number" min="1" max="10080" defaultValue={s.password_reset_ttl_minutes} /></div>
          <div><label className="lbl">{L("Link xác thực email hết hạn sau (giờ)")}</label><input className="inp" name="email_verify_ttl_hours" type="number" min="1" max="720" defaultValue={s.email_verify_ttl_hours} /></div>
        </div>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">Google reCAPTCHA v2</div>
        <div>
          <label className="lbl">{L("Bật reCAPTCHA")}</label>
          <select className="inp" name="recaptcha_enabled" defaultValue={s.recaptcha_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select>
        </div>
        {s.recaptcha_enabled !== "1" && <div className={warnBox}>{L("reCAPTCHA đang tắt — Form đăng nhập, đăng ký và quên mật khẩu sẽ hiển thị không có CAPTCHA.")}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">Site Key</label><input className="inp" name="recaptcha_site_key" defaultValue={s.recaptcha_site_key} placeholder="6Lc..." /></div>
          <div><label className="lbl">Secret Key</label><input className="inp" name="recaptcha_secret" defaultValue={s.recaptcha_secret} placeholder="6Lc..." autoComplete="off" /></div>
          <div><label className="lbl">{L("Áp dụng cho Đăng nhập")}</label>
            <select className="inp" name="recaptcha_login" defaultValue={s.recaptcha_login === "1" ? "1" : "0"}><option value="0">{L("Không")}</option><option value="1">{L("Có")}</option></select></div>
          <div><label className="lbl">{L("Áp dụng cho Đăng ký")}</label>
            <select className="inp" name="recaptcha_register" defaultValue={s.recaptcha_register === "1" ? "1" : "0"}><option value="0">{L("Không")}</option><option value="1">{L("Có")}</option></select></div>
        </div>
        <p className="text-xs text-slate-400">{L("Lấy key miễn phí tại google.com/recaptcha (loại reCAPTCHA v2 \"Tôi không phải người máy\") cho đúng tên miền của site.")}</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Phòng chống Brute Force")}</div>
        <div className={infoBox}>{L("Chặn tạm thời địa chỉ IP gây nhiều đăng nhập sai liên tục.")}</div>
        <div>
          <label className="lbl">{L("Bật chống brute-force")}</label>
          <select className="inp" name="bf_enabled" defaultValue={s.bf_enabled === "0" ? "0" : "1"}><option value="1">{L("Bật")}</option><option value="0">{L("Tắt")}</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">{L("Số lần thử tối đa")}</label><input className="inp" name="bf_max_attempts" type="number" min={3} max={100} defaultValue={s.bf_max_attempts} /></div>
          <div><label className="lbl">{L("Thời gian khóa (giây)")}</label><input className="inp" name="bf_lock_seconds" type="number" min={30} max={86400} defaultValue={s.bf_lock_seconds} /></div>
        </div>
        <p className="text-xs text-slate-400">{L("Vượt quá số lần sai, cặp IP + tài khoản đó bị khoá đăng nhập tạm trong thời gian trên.")}</p>
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Chính sách mật khẩu")}</div>
        <div><label className="lbl">{L("Độ dài mật khẩu tối thiểu khi đăng ký / đổi mật khẩu")}</label><input className="inp" name="password_min_length" type="number" min={4} max={32} defaultValue={s.password_min_length} /></div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div><label className="lbl">{L("Bắt buộc chữ hoa")}</label>
            <select className="inp" name="pw_require_upper" defaultValue={s.pw_require_upper === "1" ? "1" : "0"}><option value="0">{L("Không")}</option><option value="1">{L("Có")}</option></select></div>
          <div><label className="lbl">{L("Bắt buộc chữ số")}</label>
            <select className="inp" name="pw_require_number" defaultValue={s.pw_require_number === "1" ? "1" : "0"}><option value="0">{L("Không")}</option><option value="1">{L("Có")}</option></select></div>
          <div><label className="lbl">{L("Bắt buộc ký tự đặc biệt")}</label>
            <select className="inp" name="pw_require_special" defaultValue={s.pw_require_special === "1" ? "1" : "0"}><option value="0">{L("Không")}</option><option value="1">{L("Có")}</option></select></div>
        </div>
        <p className="text-xs text-slate-400">{L("Chặn IP và các tuỳ chọn nâng cao khác ở mục")} <b>{L("Bảo mật nâng cao")}</b> {L("trong menu.")}</p>
      </section>
    </>
  );

  /* ---------------- Cron Job ---------------- */
  const cronRow = (title: string, freq: string, url: string, note?: string) => (
    <div className="rounded-xl border-2 border-dashed border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-slate-800">{L(title)}</span>
        <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">{L(freq)}</span>
        <span className="ml-auto"><CopyBtn text={url} /></span>
      </div>
      <code className="mt-1.5 block break-all text-[13px] text-slate-600">{url}</code>
      {note && <p className="mt-1 text-xs text-slate-400">{L(note)}</p>}
    </div>
  );
  const cron = (
    <>
      <div className={warnBox}>{L("Hệ thống chạy nền qua MỘT đường dẫn cron duy nhất: mỗi lần gọi, hệ thống tự đồng bộ trạng thái đơn hàng, thả đơn drip-feed và đăng ký định kỳ tới hạn, đồng bộ dịch vụ & giá từ nhà cung cấp, kiểm tra số dư nhà cung cấp, auto refill và gửi báo cáo ngày. Cài cron gọi mỗi 5–10 phút là đủ.")}</div>
      <section className="card p-6 space-y-3.5">
        <div className="font-bold text-slate-900">{L("Khoá bí mật Cron")}</div>
        <div>
          <label className="lbl">{L("Khoá Cron (dùng trong URL cron bên dưới)")}</label>
          <ToolKeyField initial={s.cron_secret} name="cron_secret" />
        </div>
      </section>
      <section className="card p-6 space-y-3.5">
        <div className="font-bold text-slate-900">{L("Danh sách đường dẫn Cron & Webhook")}</div>
        {cronRow("Đồng bộ trạng thái đơn hàng, dịch vụ & refill", "mỗi 5–10 phút", cronUrl, "Trên VPS: crontab */5 * * * * curl -s \"URL trên\". Trên Vercel: vercel.json mục crons với header x-cron-secret.")}
        {cronRow("Webhook cộng tiền tự động (SePay / ngân hàng)", "theo giao dịch", webhookUrl, "Header: Authorization: Apikey <secret đặt ở trang Cấu hình nạp tiền>. Cộng tiền theo mã nạp trong nội dung chuyển khoản, chống cộng trùng theo mã giao dịch.")}
        {cronRow("Webhook Stripe", "theo sự kiện", `${base}/api/webhooks/stripe`, "Khai trong Stripe Dashboard, sự kiện checkout.session.completed, ký bằng Webhook Secret ở tab Thanh toán.")}
        {cronRow("Trang quay về sau thanh toán PayPal / Stripe", "sau thanh toán", `${base}/api/payments/paypal/return · ${base}/api/payments/stripe/return`)}
      </section>
    </>
  );

  /* ---------------- SMM Tool API ---------------- */
  const schemaRows: Array<[string, string, string]> = [
    ["id", "Int", "ID duy nhất của đơn hàng"],
    ["link", "String", "Link cần tăng (Facebook, TikTok,...)"],
    ["quantity", "Int", "Số lượng cần tăng cho đơn hàng"],
    ["start_count", "Int", "Số lượng ban đầu trước khi chạy (số tại thời điểm mua)"],
    ["remains", "Int", "Số lượng còn lại cần chạy"],
    ["external_order_id", "String", "ID đơn của phía tool (nếu cập nhật rồi thì giữ nguyên)"],
    ["status", "String", "Trạng thái đơn: processing, inprogress, completed, partial, canceled, refunded, error"],
  ];
  const toolapi = (
    <>
      <section className="card p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="font-bold text-slate-900">{L("Cấu hình API Key")}</div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">v1.0.0</span>
        </div>
        <div>
          <label className="lbl">{L("Tool API Key (Mã bí mật)")}</label>
          <ToolKeyField initial={s.tool_api_key} />
        </div>
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-[13px] leading-relaxed text-rose-700">{L("Không chia sẻ Tool API Key này với bất kỳ ai. Người có key có thể xem các đơn hàng đang chờ và cập nhật trạng thái đơn hàng.")}</div>
      </section>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className="card p-6 space-y-3 text-sm">
          <div className="font-bold text-slate-900">{L("Thông tin chung")}</div>
          <div className="space-y-2 text-slate-600">
            <div className="flex flex-wrap gap-2"><span className="w-24 shrink-0 font-semibold text-slate-800">Base URL:</span><code className="rounded-lg bg-slate-100 px-2 py-0.5 text-[13px]">{base}/api/tool</code></div>
            <div className="flex flex-wrap gap-2"><span className="w-24 shrink-0 font-semibold text-slate-800">{L("Xác thực:")}</span><span>{L("Tham số key trên URL, header x-tool-key, hoặc field key trong body")}</span></div>
            <div className="flex flex-wrap gap-2"><span className="w-24 shrink-0 font-semibold text-slate-800">{L("Định dạng:")}</span><span>JSON</span></div>
            <div className="flex flex-wrap gap-2"><span className="w-24 shrink-0 font-semibold text-slate-800">{L("Mã hóa:")}</span><span>UTF-8</span></div>
          </div>
          <p className="text-[13px] leading-relaxed text-slate-500"><b className="text-slate-700">{L("Lưu ý quan trọng:")}</b> {L("Tool chỉ nhận đơn của dịch vụ")} <b>{L("Thủ công")}</b> {L("đang chờ xử lý (pending, processing, inprogress). Cập nhật thành công trả về")} <span className="font-mono">data: true</span>{L(". Trạng thái hợp lệ khi cập nhật: processing, inprogress, completed, partial, canceled, refunded, error. Huỷ/hoàn/một phần sẽ tự hoàn tiền theo phần chưa chạy.")}</p>
        </section>
        <section className="card p-6 space-y-3">
          <div className="font-bold text-slate-900">{L("Bảng tham số dữ liệu (Response Schema)")}</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400"><th className="py-2 pr-3">Field</th><th className="py-2 pr-3">{L("Kiểu")}</th><th className="py-2">{L("Mô tả chi tiết")}</th></tr></thead>
              <tbody>
                {schemaRows.map(([f, t, d]) => (
                  <tr key={f} className="border-b border-slate-100 last:border-0"><td className="py-2 pr-3 font-mono text-[13px] font-semibold text-slate-800">{f}</td><td className="py-2 pr-3 text-slate-500">{t}</td><td className="py-2 text-slate-600">{L(d)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      <section className="card p-6 space-y-3">
        <div className="font-bold text-slate-900">{L("Danh sách Endpoint")}</div>
        <details className="group rounded-xl border border-slate-200 px-4 py-3" open>
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">GET</span>
            <span className="font-mono">/orders</span>
            <span className="font-normal text-slate-500">{L("— Lấy danh sách đơn hàng chờ xử lý")}</span>
          </summary>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>{L("Tham số lọc:")} <span className="font-mono">status, service_id, search</span>{L(". Lấy đầy đủ thông tin của đơn hàng cần xử lý (link, số lượng cần tăng...).")}</p>
            <code className="block overflow-x-auto whitespace-pre rounded-xl bg-slate-950 px-4 py-3 text-[12.5px] leading-relaxed text-slate-100">{`GET ${base}/api/tool/orders?key=<TOOL_API_KEY>

[
  {
    "id": 123,
    "code": "SMM100123",
    "link": "https://www.facebook.com/...",
    "quantity": 1000,
    "start_count": 250,
    "remains": 1000,
    "external_order_id": "",
    "status": "pending",
    "service_id": 1
  }
]`}</code>
          </div>
        </details>
        <details className="group rounded-xl border border-slate-200 px-4 py-3">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">GET</span>
            <span className="font-mono">/orders/{"{id}"}</span>
            <span className="font-normal text-slate-500">{L("— Xem chi tiết một đơn hàng cụ thể")}</span>
          </summary>
          <div className="mt-3">
            <code className="block overflow-x-auto whitespace-pre rounded-xl bg-slate-950 px-4 py-3 text-[12.5px] leading-relaxed text-slate-100">{`GET ${base}/api/tool/orders/123?key=<TOOL_API_KEY>

{
  "id": 123,
  "code": "SMM100123",
  "link": "https://www.facebook.com/...",
  "quantity": 1000,
  "start_count": 250,
  "remains": 400,
  "external_order_id": "EXT-999",
  "status": "inprogress",
  "service_id": 1,
  "admin_note": "",
  "service": { "id": 1, "name": "Follow Facebook" }
}`}</code>
          </div>
        </details>
        <details className="group rounded-xl border border-slate-200 px-4 py-3">
          <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
            <span className="rounded-md bg-brand-100 px-2 py-0.5 text-[11px] font-extrabold text-brand-700">POST</span>
            <span className="font-mono">/update</span>
            <span className="font-normal text-slate-500">{L("— Cập nhật trạng thái đơn hàng (ID & Key trong Body)")}</span>
          </summary>
          <div className="mt-3 space-y-2 text-sm text-slate-600">
            <p>{L("Tham số body:")} <span className="font-mono">id</span> {L("(bắt buộc),")} <span className="font-mono">external_order_id</span>{L(",")} <span className="font-mono">start_count</span>{L(",")} <span className="font-mono">remains</span> {L("(bắt buộc khi kết thúc),")} <span className="font-mono">status</span> {L("(bắt buộc): processing, inprogress, completed, partial, canceled, refunded, error.")}</p>
            <code className="block overflow-x-auto whitespace-pre rounded-xl bg-slate-950 px-4 py-3 text-[12.5px] leading-relaxed text-slate-100">{`POST ${base}/api/tool/update
Content-Type: application/json

{
  "key": "<TOOL_API_KEY>",
  "id": 123,
  "external_order_id": "EXT-999",
  "start_count": 250,
  "remains": 0,
  "status": "completed"
}`}</code>
          </div>
        </details>
      </section>
      <section className="card p-6 space-y-4 text-sm">
        <div className="font-bold text-slate-900">{L("API đại lý (chuẩn SMM v2)")}</div>
        <div>
          <div className="text-slate-500 mb-1">Base URL:</div>
          <code className="block bg-slate-950 text-slate-100 rounded-xl px-4 py-3 break-all">{base}/api/v2</code>
        </div>
        <p className="text-slate-600">{L("Xác thực: gửi kèm")} <span className="font-mono">key</span> {L("= API key riêng của từng tài khoản (khách tự lấy ở mục API đại lý trong tài khoản). Các action:")} <span className="font-mono">services · add · status · orders · balance · refill · refills · refill_status · cancel</span>{L(".")}</p>
        <p className="text-slate-600">{L("Tài liệu đầy đủ cho khách ở trang")} <a className="text-brand-600 font-semibold" href="/dashboard/api-docs" target="_blank">{L("Tài liệu API")}</a>{L(".")}</p>
      </section>
    </>
  );

  /* ---------------- AI Kiểm tra ---------------- */
  const aiCategories: Array<[string, string]> = [
    ["Cơ quan nhà nước", "Trang web mạo danh cơ quan chính phủ, bộ ngành, địa phương."],
    ["Nội dung khiêu dâm", "Hình ảnh, video, văn bản khiêu dâm, đồi trụy."],
    ["Cờ bạc", "Trang web cờ bạc, cá cược, xổ số, casino trực tuyến."],
    ["Ma tuý", "Mua bán, sử dụng, quảng cáo chất ma tuý, chất kích thích."],
    ["Lừa đảo", "Trang web lừa đảo, phishing, giả mạo, chiếm đoạt tài sản."],
    ["Bạo lực", "Nội dung bạo lực, đẫm máu, khủng bố, kích động thù hận."],
    ["Chống phá Nhà nước", "Nội dung chống phá Đảng, Nhà nước, xuyên tạc lịch sử."],
    ["Buôn bán vũ khí", "Mua bán súng đạn, vũ khí, vật liệu nổ trái phép."],
    ["Xâm phạm quyền trẻ em", "Nội dung xâm hại, bóc lột trẻ em dưới mọi hình thức."],
  ];
  const ai = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Kiểm tra liên kết bằng AI")}</div>
        <div className={infoBox}>{L("Khi bật, mỗi đơn SMM mới sẽ được AI quét link ở chế độ nền: nếu link thuộc nhóm nội dung vi phạm ở danh sách bên dưới, đơn bị gắn cờ rủi ro và báo về cho admin (đơn vẫn chạy bình thường, admin tự quyết định xử lý). Kết nối AI này cũng dùng cho LiveChat tư vấn tìm dịch vụ phía khách.")}</div>
        <div>
          <label className="lbl">{L("Bật AI kiểm tra link đơn hàng")}</label>
          <select className="inp" name="ai_check_enabled" defaultValue={s.ai_check_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật — quét link mọi đơn SMM mới")}</option></select>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="lbl">{L("Bật AI (tư vấn + kiểm tra)")}</label>
            <select className="inp" name="ai_enabled" defaultValue={s.ai_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select></div>
          <div><label className="lbl">{L("Nhà cung cấp")}</label>
            <select className="inp" name="ai_provider" defaultValue={s.ai_provider || "openai"}><option value="openai">{L("OpenAI / endpoint tương thích")}</option><option value="gemini">Google Gemini</option></select></div>
          <div><label className="lbl">{L("API URL (Base URL tuỳ chỉnh — để trống = mặc định)")}</label><input className="inp" name="ai_base_url" defaultValue={s.ai_base_url} placeholder="https://api.openai.com/v1" /></div>
          <div><label className="lbl">{L("Model AI")}</label><input className="inp" name="ai_model" defaultValue={s.ai_model} placeholder="VD: gpt-4o-mini / gemini-2.0-flash" /></div>
          <div className="sm:col-span-2"><label className="lbl">API Key</label><input className="inp" name="ai_api_key" defaultValue={s.ai_api_key} placeholder={L("Dán API key của bạn")} autoComplete="off" /><p className="mt-1 text-xs text-rose-500">{L("Không chia sẻ API key này với bất kỳ ai.")}</p></div>
        </div>
        <a href="/api/admin/ai-test" className="btn-ghost btn-sm inline-block">{L("Kiểm tra kết nối AI")}</a>
      </section>
      <section className="card p-6 space-y-3">
        <div className="font-bold text-slate-900">{L("Các nội dung AI sẽ kiểm tra")}</div>
        <ul className="divide-y divide-slate-100">
          {aiCategories.map(([t, d]) => (
            <li key={t} className="flex items-start gap-3 py-2.5">
              <span className="mt-0.5 flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-md bg-emerald-500"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg></span>
              <span className="text-sm leading-relaxed"><b className="text-slate-800">{L(t)}</b> <span className="text-slate-500">— {L(d)}</span></span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );

  /* ---------------- USDT ---------------- */
  const usdt = (
    <section className="card p-6 space-y-4">
      <div className="font-bold text-slate-900">{L("Nạp tiền USDT")}</div>
      <div className={infoBox}>{L("Thêm phương thức nạp tiền USDT: khách chuyển USDT vào ví của bạn rồi khai mã giao dịch, yêu cầu vào hàng chờ ở mục Nạp tiền — admin đối chiếu ví rồi duyệt, tiền cộng ngay khi duyệt.")}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="lbl">{L("Bật nạp USDT")}</label>
          <select className="inp" name="usdt_enabled" defaultValue={s.usdt_enabled === "1" ? "1" : "0"}><option value="0">{L("Tắt")}</option><option value="1">{L("Bật")}</option></select></div>
        <div><label className="lbl">{L("Mạng")}</label>
          <select className="inp" name="usdt_network" defaultValue={s.usdt_network || "TRC20"}><option value="TRC20">TRC20 (Tron)</option><option value="BEP20">BEP20 (BSC)</option><option value="ERC20">ERC20 (Ethereum)</option></select></div>
        <div><label className="lbl">{L("Địa chỉ ví nhận USDT")}</label><input className="inp" name="usdt_address" defaultValue={s.usdt_address} placeholder={L("Địa chỉ ví của bạn")} /></div>
        <div><label className="lbl">{L("Tỉ giá riêng 1 USDT = (VND) — để trống dùng tỉ giá USD")}</label><input className="inp" name="usdt_rate" type="number" defaultValue={s.usdt_rate} placeholder="VD: 25500" /></div>
        <div><label className="lbl">{L("Số USDT tối thiểu mỗi lần nạp")}</label><input className="inp" name="usdt_min" type="number" min="0" step="0.1" defaultValue={s.usdt_min} /></div>
      </div>
      <p className="text-xs text-slate-400">{L("Trang Nạp tiền của khách sẽ hiện địa chỉ ví + mạng + tỉ giá này khi bạn bật. Panel con tự cấu hình ví USDT riêng trong Panel Admin.")}</p>
    </section>
  );

  /* ---------------- Script / HTML ---------------- */
  const script = (
    <>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Script/HTML Header trang khách")}</div>
        <div className={infoBox}>{L("Chèn đoạn mã HTML/Javascript vào thẻ <head> của trang khách. Đoạn mã sẽ được chèn vào trên mọi trang khách hoặc trang đăng nhập.")}</div>
        <textarea className="inp font-mono !bg-slate-950 !text-slate-100" name="custom_head_html" rows={6} defaultValue={s.custom_head_html} placeholder="<!-- VD: Google Analytics --><script async src='https://www.googletagmanager.com/gtag/js?id=G-XXXXX'></script>" />
      </section>
      <section className="card p-6 space-y-4">
        <div className="font-bold text-slate-900">{L("Script/HTML Footer trang khách")}</div>
        <div className={infoBox}>{L("Chèn đoạn mã HTML/Javascript trước thẻ </body> của trang khách. Đoạn mã sẽ được chèn vào trên mọi trang khách hoặc trang đăng nhập.")}</div>
        <textarea className="inp font-mono !bg-slate-950 !text-slate-100" name="custom_body_html" rows={6} defaultValue={s.custom_body_html} placeholder="<!-- VD: Tawk.to Live Chat --><script type='text/javascript'>...</script>" />
      </section>
      <p className="text-xs text-amber-600">{L("Chỉ dán mã từ nguồn tin cậy — mã ở đây chạy trên mọi trang của website.")}</p>
    </>
  );

  return (
    <div>
      <PageHead title={L("Cài đặt Website")} desc={L("Cấu hình SEO, logo, favicon và thông báo hệ thống.")}>
        <button type="submit" form="settings-form" className="btn-primary shrink-0">{L("Lưu cài đặt")}</button>
      </PageHead>
      <Flash msg={searchParams.msg ? Ld(searchParams.msg) : undefined} err={searchParams.err ? Ld(searchParams.err) : undefined} />
      <form id="settings-form" action={adminSaveSettings}>
        <SettingsTabs tabs={[
          { id: "chung", label: L("Chung"), icon: I.gear, content: chung },
          { id: "thanhtoan", label: L("Thanh toán"), icon: I.wallet, content: thanhtoan },
          { id: "email", label: "Email", icon: I.mail, content: email },
          { id: "telegram", label: "Telegram", icon: I.megaphone, content: telegram },
          { id: "thongbao", label: L("Thông báo"), icon: I.bell, content: thongbao },
          { id: "google", label: "Google", icon: I.users, content: google },
          { id: "khuyenmai", label: L("Khuyến mãi"), icon: I.gift, content: khuyenmai },
          { id: "gioithieu", label: L("Giới thiệu"), icon: I.percent, content: gioithieu },
          { id: "baomat", label: L("Bảo mật"), icon: I.shield, content: baomat },
          { id: "cron", label: "Cron Job", icon: I.clock, content: cron },
          { id: "toolapi", label: "SMM Tool API", icon: I.key, content: toolapi },
          { id: "ai", label: L("AI Kiểm tra"), icon: I.cpu, content: ai },
          { id: "usdt", label: "USDT", icon: I.money, content: usdt },
          { id: "script", label: "Script/HTML", icon: I.file, content: script },
        ]} />
      </form>
    </div>
  );
}
