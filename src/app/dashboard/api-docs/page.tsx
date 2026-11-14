import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { moduleOn } from "@/lib/modules";
import { ApiDocsView } from "@/components/apidocs";

export const dynamic = "force-dynamic";

/* Tài liệu API nằm TRONG khu khách (lệnh Tín 2026-11-05), kèm sẵn API key của người xem. */
export default async function DashApiDocsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await moduleOn("api"))) redirect("/");
  return <ApiDocsView apiKey={user.apiKey} />;
}
