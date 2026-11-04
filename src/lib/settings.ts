import { prisma } from "./db";

export const DEFAULT_SETTINGS: Record<string, string> = {
  site_name: "SMMv2",
  site_tagline: "SMM Panel & Tài khoản Premium — tự động 24/7",
  site_logo_text: "S",
  support_telegram: "",
  support_facebook: "",
  support_zalo: "",
  support_hotline: "",
  // Giao diện mặc định cho khách mới (khách tự đổi được, lưu trên máy họ)
  default_accent: "blue",
  default_mode: "light",
  // Nạp ngân hàng
  bank_name: "",
  bank_account: "",
  bank_holder: "",
  bank_branch: "",
  // MoMo
  momo_phone: "",
  momo_name: "",
  // Nạp tiền
  deposit_min: "10000",
  // Hoa hồng giới thiệu (% trên tiền nạp của người được giới thiệu) — trang Kiếm tiền
  affiliate_percent: "6",
  // Thưởng nạp dạng JSON: [{"from":500000,"percent":2},{"from":2000000,"percent":5}]
  deposit_bonus_tiers: "[]",
  maintenance: "0",
  announcement_bar: "",
};

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const out = { ...DEFAULT_SETTINGS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

export async function setSetting(key: string, value: string) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/** Nội dung chuyển khoản chuẩn của 1 user: "SMM <depositCode>" */
export function depositContent(code: string) {
  return `SMM ${code}`;
}

/** Tính thưởng nạp theo mốc */
export function calcBonus(amount: number, tiersJson: string): number {
  try {
    const tiers = JSON.parse(tiersJson || "[]") as { from: number; percent: number }[];
    let pct = 0;
    for (const t of tiers) if (amount >= t.from && t.percent > pct) pct = t.percent;
    return Math.floor((amount * pct) / 100);
  } catch {
    return 0;
  }
}

/** VietQR (img.vietqr.io) — bank BIN map rút gọn các ngân hàng phổ biến */
export const BANK_BINS: Record<string, string> = {
  Vietcombank: "VCB",
  Techcombank: "TCB",
  MB: "MB",
  "MB Bank": "MB",
  VietinBank: "ICB",
  BIDV: "BIDV",
  Agribank: "VBA",
  ACB: "ACB",
  Sacombank: "STB",
  VPBank: "VPB",
  TPBank: "TPB",
  SHB: "SHB",
  HDBank: "HDB",
  OCB: "OCB",
  MSB: "MSB",
  SeABank: "SEAB",
  VIB: "VIB",
  "Ngân hàng Á Châu": "ACB",
};

export function vietQrUrl(bankName: string, account: string, amount: number, content: string, holder: string) {
  const bin = BANK_BINS[bankName] || bankName;
  const q = new URLSearchParams({
    amount: String(amount),
    addInfo: content,
    accountName: holder,
  });
  return `https://img.vietqr.io/image/${bin}-${account}-compact2.png?${q.toString()}`;
}
