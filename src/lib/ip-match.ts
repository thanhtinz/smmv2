/* Khớp IP / CIDR cho whitelist IP của API key (bảo mật Enterprise GĐ3).
   Hỗ trợ: IPv4 đơn (1.2.3.4), CIDR IPv4 (1.2.3.0/24, /32 = 1 IP, /0 = mọi IPv4),
   IPv6 khớp chính xác theo chuỗi đã chuẩn hoá (gồm dạng rút gọn ::1), và dạng
   IPv4-mapped IPv6 (::ffff:1.2.3.4) được bóc về IPv4 trước khi so. */

export function normalizeIp(ip: string): string {
  let s = (ip || "").trim().toLowerCase();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  return s;
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = parseInt(p, 10);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n >>> 0;
}

export function ipMatchesRule(ip: string, rule: string): boolean {
  const target = normalizeIp(ip);
  const r = normalizeIp(rule);
  if (!target || !r) return false;
  if (r.includes("/")) {
    const [base, bitsRaw] = r.split("/");
    const bits = parseInt(bitsRaw, 10);
    const baseInt = ipv4ToInt(base);
    const ipInt = ipv4ToInt(target);
    if (baseInt === null || ipInt === null || !Number.isFinite(bits) || bits < 0 || bits > 32) return false;
    if (bits === 0) return true;
    const mask = (0xffffffff << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  }
  return target === r;
}

/** Tách danh sách whitelist (mỗi IP/CIDR một dòng, cũng chấp nhận dấu phẩy) */
export function parseIpList(text: string | null | undefined): string[] {
  return (text || "").split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
}

/** Danh sách TRỐNG = không giới hạn (mặc định an toàn, không khoá ai) */
export function ipAllowed(ip: string, listText: string | null | undefined): boolean {
  const rules = parseIpList(listText);
  if (!rules.length) return true;
  return rules.some((r) => ipMatchesRule(ip, r));
}
