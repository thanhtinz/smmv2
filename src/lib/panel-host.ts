import { headers } from "next/headers";
import { prisma } from "./db";
import { decryptPanelSecrets } from "./panel-secrets";

/** Panel con khớp với Host hiện tại (tên miền riêng của panel). Trả null khi đang ở
 *  tên miền chính/localhost. Dùng cho metadata, script riêng và trang đăng nhập của panel. */
export async function panelByHost() {
  try {
    const host = (headers().get("host") || "").split(":")[0].toLowerCase();
    const mainHost = (process.env.MAIN_HOST || "").toLowerCase();
    if (!host || host === "localhost" || host === "127.0.0.1" || (mainHost && host === mainHost)) return null;
    const panel = await prisma.childPanel.findUnique({ where: { domain: host } });
    return decryptPanelSecrets(panel);
  } catch {
    return null;
  }
}
