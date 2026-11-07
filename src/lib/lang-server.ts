import { cookies } from "next/headers";

/** Ngôn ngữ hiển thị đọc phía SERVER từ cookie smmv2-lang (DisplaySettings ghi đồng thời
 *  vào localStorage + cookie này). Mặc định "en" như lựa chọn mặc định phía khách. */
export function getLang(): string {
  try {
    return cookies().get("smmv2-lang")?.value || "en";
  } catch {
    return "en";
  }
}
