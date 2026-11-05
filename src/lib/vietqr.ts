/** Sinh URL ảnh VietQR từ tên ngân hàng (ánh xạ mã BIN các ngân hàng phổ biến). Không rõ BIN thì trả null. */
export function vietqrUrl(bankName: string, account: string, holder: string, content?: string) {
  const binMap: Record<string, string> = {
    vietcombank: "970436", vcb: "970436", techcombank: "970407", tcb: "970407",
    mb: "970422", mbbank: "970422", acb: "970416", vietinbank: "970415", ctg: "970415",
    bidv: "970418", agribank: "970405", vpbank: "970432", tpbank: "970423", sacombank: "970403", hdbank: "970437",
  };
  const key = bankName.toLowerCase().replace(/\s+/g, "");
  const bin = Object.entries(binMap).find(([k]) => key.includes(k))?.[1];
  if (!bin) return null;
  const q = new URLSearchParams({ accountName: holder });
  if (content) q.set("addInfo", content);
  return `https://img.vietqr.io/image/${bin}-${account}-compact2.png?${q}`;
}
