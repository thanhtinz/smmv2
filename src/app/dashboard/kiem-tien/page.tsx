import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { KiemTienView } from "@/components/kiemtien";

export const dynamic = "force-dynamic";

export default async function EarnPage() {
  const user = (await getCurrentUser())!;
  const h = headers();
  const host = h.get("host") || "localhost:3000";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return <KiemTienView userId={user.id} linkBase={`${proto}://${host}/register`} />;
}
