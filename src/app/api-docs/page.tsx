import { notFound } from "next/navigation";
import { SiteFooter, PublicHeader } from "@/components/site";
import { ApiDocsView } from "@/components/apidocs";
import { getCurrentUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function ApiDocsPage() {
  if ((await getSettings()).module_api === "0") notFound();
  const user = await getCurrentUser().catch(() => null);
  return (
    <div className="dark pub-dark bg-[#07090d] text-slate-300 min-h-screen flex flex-col">
      <PublicHeader />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-10">
        <ApiDocsView apiKey={user?.apiKey} />
      </main>
      <SiteFooter />
    </div>
  );
}
