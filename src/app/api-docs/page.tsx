import { SiteHeader, SiteFooter } from "@/components/site";
import { ApiDocsView } from "@/components/apidocs";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ApiDocsPage() {
  const user = await getCurrentUser().catch(() => null);
  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <SiteHeader />
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-10">
        <ApiDocsView apiKey={user?.apiKey} />
      </main>
      <SiteFooter />
    </div>
  );
}
