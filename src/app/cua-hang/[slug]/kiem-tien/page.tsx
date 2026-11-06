import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { PanelShell } from "@/components/panelshell";
import { KiemTienView } from "@/components/kiemtien";

export const dynamic = "force-dynamic";

export default async function PanelEarn({ params, searchParams }: { params: { slug: string }; searchParams: Record<string, string | string[] | undefined> }) {
  const panel = await prisma.childPanel.findUnique({ where: { slug: params.slug } });
  if (!panel || panel.status !== "ACTIVE") notFound();
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!panel.moduleAffiliate) {
    return (
      <PanelShell panel={panel} user={user}>
        <div className="card p-8 text-center">
          <div className="font-bold text-slate-900">Mục Kiếm tiền đang tắt</div>
          <p className="mt-1 text-sm text-slate-400">Gian hàng này đã tắt mô-đun giới thiệu kiếm tiền.</p>
        </div>
      </PanelShell>
    );
  }
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return (
    <PanelShell panel={panel} user={user}>
      <KiemTienView userId={user.id} linkBase={`${proto}://${host}/cua-hang/${panel.slug}/dang-ky`} sp={searchParams} tabBase={`/cua-hang/${panel.slug}/kiem-tien`} />
    </PanelShell>
  );
}
