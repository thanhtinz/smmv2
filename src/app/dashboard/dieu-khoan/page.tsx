import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHead } from "@/components/ui";
import { RichText } from "@/components/rich-text";
import { getServerI18n } from "@/lib/lang-server";

export const dynamic = "force-dynamic";

/* Trang Điều khoản (thẻ ở cụm đáy menu) — hiển thị ĐÚNG nội dung điều khoản đã cấu hình
   trong hệ: khách của panel thấy bản điều khoản riêng của panel nếu panel có soạn,
   còn lại dùng bản của web mẹ (settings terms_title/terms_content — cùng nguồn nội dung
   với cổng Điều khoản bắt xác nhận). Chưa cấu hình nội dung thì báo đang cập nhật,
   tuyệt đối không tự soạn văn bản điều khoản. */
export default async function TermsPage() {
  const user = (await getCurrentUser())!;
  const s = await getSettings();
  const panel = user.panelId ? await prisma.childPanel.findUnique({
    where: { id: user.panelId },
    select: { termsTitle: true, termsContent: true, langConfig: true },
  }) : null;
  const { L } = await getServerI18n(panel?.langConfig ?? undefined);
  const panelHas = !!(panel?.termsContent && panel.termsContent.trim());
  const title = (panelHas ? panel!.termsTitle : null) || s.terms_title || L("Điều khoản sử dụng");
  const content = panelHas ? panel!.termsContent! : s.terms_content || "";
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
