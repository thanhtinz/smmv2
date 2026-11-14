/**
 * Test hồi quy audit đợt 2 P1-01: aiAuthorized FAIL-CLOSED.
 *   npx tsx scripts/test-ai-auth.ts (chỉ cần DB local cho import prisma)
 * Trước bản vá: thiếu AI_SERVICE_TOKEN thì aiAuthorized trả true —
 * /api/ai/* mở công khai (đọc ticket + trả lời mạo danh admin).
 */
import { aiAuthorized } from "../src/lib/ai-knowledge";
const req = (tok?: string) => new Request("http://x/api/ai/knowledge", { headers: tok ? { "x-bnt-ai-token": tok } : {} });
let fail = 0;
const ok = (c: boolean, l: string) => { console.log(c ? "PASS" : "FAIL", l); if (!c) fail++; };
delete process.env.AI_SERVICE_TOKEN;
ok(aiAuthorized(req()) === false, "thiếu env token -> từ chối (fail-closed)");
ok(aiAuthorized(req("bat-ky")) === false, "thiếu env token + có header -> vẫn từ chối");
process.env.AI_SERVICE_TOKEN = "token-dung-123";
ok(aiAuthorized(req("token-dung-123")) === true, "đúng token -> cho qua");
ok(aiAuthorized(req("token-sai")) === false, "sai token -> từ chối");
ok(aiAuthorized(req()) === false, "không header -> từ chối");
ok(aiAuthorized(req("token-dung-123-dai-hon")) === false, "token dài hơn -> từ chối (không lỗi độ dài)");
process.exit(fail ? 1 : 0);
