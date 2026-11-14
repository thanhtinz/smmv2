import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead } from "@/components/ui";
import { RichText } from "@/components/rich-text";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/* Trang Điều khoản (thẻ ở cụm đáy menu) — hiển thị ĐÚNG nội dung điều khoản đã cấu hình
   trong hệ: bản điều khoản do admin soạn ở Cài đặt.
   còn lại dùng bản của web mẹ (settings terms_title/terms_content — cùng nguồn nội dung
   với cổng Điều khoản bắt xác nhận). Chưa cấu hình nội dung thì báo đang cập nhật,
   tuyệt đối không tự soạn văn bản điều khoản. */
export default async function TermsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const s = await getSettings();
  const { L } = await getServerI18n();
  const title = s.terms_title || L("Điều khoản sử dụng");
  const content = s.terms_content || "";
  return (
    <div>
      <PageHead title={title} />
      <div className="card p-6 text-sm leading-relaxed text-slate-600">
        {content.trim() ? (
          <RichText value={content} />
        ) : (
          <p className="text-slate-500">{L("Nội dung điều khoản đang được cập nhật.")}</p>
        )}
      </div>
    </div>
  );
}
