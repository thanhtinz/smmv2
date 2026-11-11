import { redirect } from "next/navigation";
import { prisma } from "./db";
import { getSettings, setSetting } from "./settings";

/* Cổng THIẾT LẬP LẦN ĐẦU (lệnh Tín 2026-11-11 "Ko có tài khoản mẫu đâu. Làm
   trang setup lần đầu"): bản cài mới không tạo sẵn bất kỳ tài khoản nào — khi
   bảng users còn trống, mọi bề mặt khách bị dẫn về /setup để chủ site tự tạo
   tài khoản quản trị đầu tiên.
   Trạng thái "đã thiết lập" được chốt bằng setting setup_completed = "1" (ghi
   trong cùng transaction tạo admin đầu tiên ở actions/setup.ts). Kiểm tra mỗi
   request đi qua setting có sẵn trong khung trang; cờ chưa bật mới phải đếm
   users — và chỉ đếm tới khi thấy có user lần đầu (bản cài cũ đã có user thì
   tự ghi cờ luôn để khỏi đếm lại). Cache trong tiến trình chỉ lật một chiều
   sang "đã thiết lập", không bao giờ lật ngược. */
let doneInProcess = false;

export async function isSetupNeeded(): Promise<boolean> {
  if (doneInProcess) return false;
  const s = await getSettings().catch(() => null);
  if (s?.setup_completed === "1") {
    doneInProcess = true;
    return false;
  }
  // DB lỗi -> coi như đã thiết lập: thà để site chạy còn hơn khoá toàn site.
  const count = await prisma.user.count().catch(() => 1);
  if (count > 0) {
    doneInProcess = true;
    // Ghi cờ best-effort cho các request sau khỏi đếm lại (không chặn render).
    void setSetting("setup_completed", "1").catch(() => {});
    return false;
  }
  return true;
}

/** Chốt chặn dùng trong các khung/layout phía khách: chưa thiết lập thì về /setup. */
export async function guardSetupDone(): Promise<void> {
  if (await isSetupNeeded()) redirect("/setup");
}
