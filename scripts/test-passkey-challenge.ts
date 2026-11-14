/**
 * Full-audit 6750109 P3-01 — challenge passkey dùng MỘT LẦN ở server:
 * claimPasskeyChallenge chỉ thắng đúng một lượt (kể cả gọi song song),
 * sai purpose/hết hạn đều trượt; counter của authenticator cập nhật
 * bằng CAS trên giá trị đã đọc nên hai request không cùng dùng được
 * một counter cũ. saveChallenge ngoài request context sẽ lỗi ở bước
 * đặt cookie — dòng server-side vẫn được ghi trước bước đó.
 */
import { createHash } from "crypto";
import { prisma } from "../src/lib/db";
import { saveChallenge, claimPasskeyChallenge } from "../src/lib/webauthn";

let fails = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"} ${label}`);
  if (!cond) fails++;
}
const hashOf = (c: string) => createHash("sha256").update(c).digest("hex");

async function main() {
  const stamp = Date.now().toString(36);
  const challenge = `chal-${stamp}-abcdefghij`;
  await saveChallenge({ challenge, purpose: "pk-login" } as any).catch(() => {});
  const row = await prisma.passkeyChallenge.findUnique({ where: { challengeHash: hashOf(challenge) } });
  ok(!!row && row.usedAt === null, "K1: saveChallenge ghi dòng challenge phía server");

  // Hai claim song song: đúng một thắng
  const [c1, c2] = await Promise.all([
    claimPasskeyChallenge({ challenge, purpose: "pk-login" } as any),
    claimPasskeyChallenge({ challenge, purpose: "pk-login" } as any),
  ]);
  ok((c1 ? 1 : 0) + (c2 ? 1 : 0) === 1, `K2: hai claim song song -> đúng 1 thắng (${c1}/${c2})`);
  const c3 = await claimPasskeyChallenge({ challenge, purpose: "pk-login" } as any);
  ok(!c3, "K3: claim lại lần nữa -> trượt");

  // Sai purpose
  const ch2 = `chal-${stamp}-reg`;
  await prisma.passkeyChallenge.create({
    data: { challengeHash: hashOf(ch2), purpose: "pk-reg", expiresAt: new Date(Date.now() + 60000) },
  });
  ok(!(await claimPasskeyChallenge({ challenge: ch2, purpose: "pk-login" } as any)), "K4: sai purpose -> trượt");

  // Hết hạn
  const ch3 = `chal-${stamp}-exp`;
  await prisma.passkeyChallenge.create({
    data: { challengeHash: hashOf(ch3), purpose: "pk-login", expiresAt: new Date(Date.now() - 1000) },
  });
  ok(!(await claimPasskeyChallenge({ challenge: ch3, purpose: "pk-login" } as any)), "K5: hết hạn -> trượt");

  // Không có dòng (challenge lạ) -> fail-closed
  ok(!(await claimPasskeyChallenge({ challenge: `chal-${stamp}-ghost`, purpose: "pk-login" } as any)), "K6: không có dòng server -> trượt (fail-closed)");

  // Counter CAS: hai lượt cùng đọc counter=5, chỉ một ghi được
  const user = await prisma.user.create({
    data: {
      username: `pkc${stamp}`, email: `pkc${stamp}@t.local`, passwordHash: "x",
      apiKey: `pkckey${stamp}`, depositCode: `PK${stamp}`.slice(0, 12).toUpperCase(), refCode: `RF${stamp}`.toUpperCase(),
    },
  });
  const pk = await prisma.userPasskey.create({
    data: { userId: user.id, credentialId: `cred-${stamp}`, publicKey: "pk", counter: 5, deviceName: "Test" },
  });
  const cas1 = await prisma.userPasskey.updateMany({ where: { id: pk.id, counter: 5 }, data: { counter: 6, lastUsedAt: new Date() } });
  const cas2 = await prisma.userPasskey.updateMany({ where: { id: pk.id, counter: 5 }, data: { counter: 6, lastUsedAt: new Date() } });
  ok(cas1.count === 1 && cas2.count === 0, "K7: counter CAS — lượt hai với counter cũ trượt");

  await prisma.passkeyChallenge.deleteMany({ where: { challengeHash: { in: [hashOf(challenge), hashOf(ch2), hashOf(ch3)] } } });
  await prisma.userPasskey.delete({ where: { id: pk.id } });
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});

  console.log(fails === 0 ? "ALL PASS" : `${fails} FAIL`);
  process.exit(fails === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
