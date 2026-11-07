/* Test đơn vị cho lib/ip-match (GĐ3): npx tsx scripts/test-ip-match.ts */
import { ipAllowed, ipMatchesRule } from "../src/lib/ip-match";

const cases: [string, string, boolean][] = [
  ["1.2.3.4", "1.2.3.4", true],
  ["1.2.3.4", "1.2.3.5", false],
  ["1.2.3.4", "1.2.3.0/24", true],
  ["1.2.4.4", "1.2.3.0/24", false],
  ["1.2.3.4", "1.2.3.4/32", true],
  ["1.2.3.5", "1.2.3.4/32", false],
  ["9.9.9.9", "0.0.0.0/0", true],
  ["10.0.0.5", "10.0.0.0/8", true],
  ["11.0.0.5", "10.0.0.0/8", false],
  ["::ffff:1.2.3.4", "1.2.3.4", true],
  ["::ffff:1.2.3.4", "1.2.3.0/24", true],
  ["::1", "::1", true],
  ["::1", "127.0.0.1", false],
  [" 1.2.3.4 ", " 1.2.3.4 ", true],
  ["1.2.3.4", "garbage", false],
  ["1.2.3.4", "1.2.3.0/33", false],
  ["1.2.3.4", "1.2.3.0/x", false],
  ["1.2.3.300", "1.2.3.0/24", false],
];
let fail = 0;
for (const [ip, rule, want] of cases) {
  const got = ipMatchesRule(ip, rule);
  if (got !== want) { console.error(`FAIL ipMatchesRule(${ip}, ${rule}) = ${got}, want ${want}`); fail++; }
}
const listCases: [string, string | null, boolean][] = [
  ["1.2.3.4", "", true], // trống = không giới hạn
  ["1.2.3.4", null, true],
  ["1.2.3.4", "5.6.7.8\n1.2.3.0/24", true],
  ["1.2.3.4", "5.6.7.8\n9.9.9.9", false],
  ["1.2.3.4", "5.6.7.8, 1.2.3.4", true],
];
for (const [ip, list, want] of listCases) {
  const got = ipAllowed(ip, list);
  if (got !== want) { console.error(`FAIL ipAllowed(${ip}, ${JSON.stringify(list)}) = ${got}, want ${want}`); fail++; }
}
if (fail) { console.error(`${fail} case FAIL`); process.exit(1); }
console.log(`ip-match: ${cases.length + listCases.length}/${cases.length + listCases.length} PASS`);
