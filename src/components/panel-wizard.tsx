"use client";
import { useState } from "react";
import { I } from "@/components/ui";
import { vnd } from "@/lib/format";

type Check = { state: "idle" | "checking" | "ok" | "err"; msg: string };
const IDLE: Check = { state: "idle", msg: "" };

const GlobeIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.8 5.6 3.8 9S14.5 18.5 12 21c-2.5-2.5-3.8-5.6-3.8-9S9.5 5.5 12 3Z" /></svg>
);
const InfoIcon = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="9.2" /><path d="M12 11v5" /><circle cx="12" cy="8" r="0.5" fill="currentColor" /></svg>
);
const WarnIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" /><path d="M12 10v4.4" /><circle cx="12" cy="17.2" r="0.5" fill="currentColor" /></svg>
);

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const USERNAME_RE = /^[a-z0-9-]{6,32}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const REGISTRARS = [
  { name: "Tenten", href: "https://www.tenten.vn" },
  { name: "Mắt Bão", href: "https://www.matbao.net" },
  { name: "GoDaddy", href: "https://www.godaddy.com" },
  { name: "Namecheap", href: "https://www.namecheap.com" },
];
const FEATURES = [
  { icon: I.panels, text: "Domain riêng — thương hiệu của bạn" },
  { icon: I.shield, text: "Admin panel độc lập" },
  { icon: I.refresh, text: "Đồng bộ dịch vụ tự động" },
  { icon: I.key, text: "API tích hợp không giới hạn" },
];
const FAQS = [
  { q: "Child Panel là gì?", a: "Website SMM Panel riêng chạy trên domain của bạn, với admin panel và thương hiệu độc lập." },
  { q: "Tôi cần chuẩn bị gì?", a: "1 domain đã đăng ký và đủ số dư. Nameserver sẽ được cung cấp sau khi tạo." },
  { q: "Sau khi tạo thì làm gì tiếp?", a: "Trỏ NameServer của domain theo thông tin ở bước 4, rồi đăng nhập website con bằng tài khoản quản trị vừa tạo để tuỳ chỉnh." },
];

function Stepper({ step }: { step: number }) {
  const icons = [GlobeIcon, I.users, I.money, I.server, I.check];
  return (
    <div className="flex items-center">
      {icons.map((icon, i) => {
        const n = i + 1;
        const done = n < step;
        const cur = n === step;
        return (
          <div key={n} className={`flex items-center ${i < icons.length - 1 ? "flex-1" : ""}`}>
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 transition ${done ? "border-brand-600 bg-brand-600 text-white" : cur ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
              {done ? I.check : icon}
            </span>
            {i < icons.length - 1 && <span className={`mx-2 h-0.5 flex-1 rounded ${n < step ? "bg-brand-600" : "bg-slate-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

/** Wizard Tạo Child Panel 5 bước theo giao diện mẫu: 1 Tên miền · 2 Tài khoản quản trị ·
 *  3 Xem lại & thanh toán · 4 NameServer · 5 Hoàn tất (bước 4-5 render phía server sau khi tạo). */
export function PanelWizard({ fee, balance, action, defaults }: {
  fee: number;
  balance: number;
  action: (formData: FormData) => Promise<void>;
  defaults: { fullName: string; email: string; phone: string };
}) {
  const [step, setStep] = useState(1);
  const [domain, setDomain] = useState("");
  const [domainCheck, setDomainCheck] = useState<Check>(IDLE);
  const [name, setName] = useState(defaults.fullName || "");
  const [email, setEmail] = useState(defaults.email || "");
  const [phone, setPhone] = useState(defaults.phone || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [userCheck, setUserCheck] = useState<Check>(IDLE);
  const [emailCheck, setEmailCheck] = useState<Check>(IDLE);
  const [agree, setAgree] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [step2Err, setStep2Err] = useState("");

  const cleanDomain = domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].split(":")[0];
  const pwOk = password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
  const balanceOk = balance >= fee;

  async function checkDomain() {
    if (cleanDomain.length < 4 || !DOMAIN_RE.test(cleanDomain)) {
      setDomainCheck({ state: "err", msg: "Tên miền chưa hợp lệ — chỉ chứa chữ thường, số, dấu chấm và gạch ngang (vd: myshop.vn)" });
      return;
    }
    setDomainCheck({ state: "checking", msg: "Đang kiểm tra..." });
    try {
      const j = await (await fetch(`/api/panels/wizard-check?domain=${encodeURIComponent(cleanDomain)}`)).json();
      setDomainCheck(j.domain ? { state: j.domain.ok ? "ok" : "err", msg: j.domain.msg } : { state: "err", msg: "Không kiểm tra được — thử lại sau" });
    } catch { setDomainCheck({ state: "err", msg: "Không kiểm tra được — thử lại sau" }); }
  }

  async function checkField(field: "username" | "email", value: string) {
    const v = value.trim().toLowerCase();
    const set = field === "username" ? setUserCheck : setEmailCheck;
    if (!v) { set(IDLE); return null; }
    try {
      const j = await (await fetch(`/api/panels/wizard-check?${field}=${encodeURIComponent(v)}`)).json();
      const r = j[field];
      if (r) { set({ state: r.ok ? "ok" : "err", msg: r.msg }); return r.ok as boolean; }
    } catch { /* kiểm tra lại ở server khi tạo */ }
    return null;
  }

  async function nextFromStep2() {
    setStep2Err("");
    if (name.trim().length < 2) return setStep2Err("Họ và tên phải từ 2-128 ký tự");
    if (!EMAIL_RE.test(email.trim())) return setStep2Err("Email chưa đúng định dạng");
    if (!/^[0-9]{10,15}$/.test(phone.replace(/[\s.]/g, ""))) return setStep2Err("Số điện thoại phải gồm 10-15 chữ số");
    if (!USERNAME_RE.test(username.trim().toLowerCase())) return setStep2Err("Tên đăng nhập phải 6-32 ký tự: chữ thường, số, dấu gạch ngang");
    if (!pwOk) return setStep2Err("Mật khẩu phải tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt");
    if (password !== password2) return setStep2Err("Mật khẩu xác nhận không khớp");
    if (!agree) return setStep2Err("Bạn cần đồng ý với điều khoản sử dụng để tiếp tục");
    const [u, e] = await Promise.all([
      userCheck.state === "ok" ? Promise.resolve(true) : checkField("username", username),
      emailCheck.state === "ok" ? Promise.resolve(true) : checkField("email", email),
    ]);
    if (u === false || e === false) return setStep2Err("Tên đăng nhập hoặc email đã có người dùng — kiểm tra lại các ô đã đánh dấu");
    setStep(3);
  }

  const fieldMsg = (c: Check) => c.state === "ok" || c.state === "err" ? (
    <p className={`mt-1.5 text-xs font-medium ${c.state === "ok" ? "text-emerald-600" : "text-rose-500"}`}>{c.msg}</p>
  ) : null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <form action={action} className="card flex h-full flex-col p-6 lg:col-span-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900">Tạo Child Panel</h2>
            <p className="mt-1 text-sm text-slate-500">Khởi tạo SMM Panel riêng trên domain của bạn</p>
          </div>
          <span className="rounded-lg border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-700">Multi-tenant</span>
        </div>
        <div className="mt-6"><Stepper step={step} /></div>

        {/* ===== Bước 1: Tên miền ===== */}
        <div className={step === 1 ? "mt-7 flex-1" : "hidden"}>
          <div className="flex items-start gap-3.5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-700">{GlobeIcon}</span>
            <span>
              <span className="block font-bold text-slate-900">Chuẩn bị tên miền</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-slate-500">Domain phải đã được đăng ký, có thể trỏ Nameserver và không vi phạm bản quyền thương hiệu.</span>
            </span>
          </div>
          <label className="lbl mt-6">Nhập tên miền</label>
          <div className="flex gap-2">
            <input className="inp flex-1" name="domain" value={domain} onChange={(e) => { setDomain(e.target.value); setDomainCheck(IDLE); }} placeholder="likesubvn.com" autoComplete="off" />
            <button type="button" onClick={checkDomain} disabled={domainCheck.state === "checking"} className="btn-primary shrink-0 !px-5">Kiểm tra</button>
          </div>
          {domainCheck.state === "ok" && (
            <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">{I.check}</span>{domainCheck.msg}
            </div>
          )}
          {domainCheck.state === "err" && (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{domainCheck.msg}</div>
          )}
          {domainCheck.state === "checking" && <p className="mt-3 text-sm text-slate-400">Đang kiểm tra...</p>}
          <div className="mt-6 text-xs font-extrabold uppercase tracking-wider text-slate-400">Gợi ý nhà cung cấp domain</div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {REGISTRARS.map((r) => (
              <a key={r.name} href={r.href} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-brand-300 hover:text-brand-700">{r.name}</a>
            ))}
          </div>
          <p className="mt-3 text-[13px] italic text-slate-400">Chưa có domain? Đăng ký trước rồi quay lại tiếp tục.</p>
        </div>

        {/* ===== Bước 2: Tài khoản quản trị viên ===== */}
        <div className={step === 2 ? "mt-7 flex-1" : "hidden"}>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3.5 py-1.5 text-xs font-bold text-brand-700">{GlobeIcon} DOMAIN: <span className="text-slate-900">{cleanDomain || "—"}</span></span>
          <h3 className="mt-5 font-bold text-slate-900">Tài khoản quản trị viên</h3>
          <p className="mt-0.5 text-sm text-slate-500">Tài khoản này sẽ có quyền admin cao nhất trên Child Panel</p>
          <div className="mt-5 space-y-4">
            <div>
              <label className="lbl">Họ và tên <span className="text-rose-500">*</span></label>
              <input className="inp" name="adminName" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nguyễn Văn An" autoComplete="name" />
            </div>
            <div>
              <label className="lbl">Email <span className="text-rose-500">*</span></label>
              <input className="inp" name="adminEmail" type="email" value={email} onChange={(e) => { setEmail(e.target.value); setEmailCheck(IDLE); }} onBlur={() => checkField("email", email)} placeholder="admin@example.com" autoComplete="email" />
              {fieldMsg(emailCheck)}
            </div>
            <div>
              <label className="lbl">Số điện thoại <span className="text-rose-500">*</span></label>
              <input className="inp" name="adminPhone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-15 chữ số (vd: 0901234567)" autoComplete="tel" />
            </div>
            <div>
              <label className="lbl">Tên đăng nhập <span className="text-rose-500">*</span></label>
              <input className="inp" name="adminUsername" value={username} onChange={(e) => { setUsername(e.target.value); setUserCheck(IDLE); }} onBlur={() => checkField("username", username)} placeholder="chữ-số-gạch-ngang (6-32 ký tự)" autoComplete="username" />
              {fieldMsg(userCheck)}
            </div>
            <div>
              <label className="lbl">Mật khẩu <span className="text-rose-500">*</span></label>
              <input className="inp" name="adminPassword" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 ký tự, hoa+thường+số+đặc biệt" autoComplete="new-password" />
              {password && <p className={`mt-1.5 text-xs font-medium ${pwOk ? "text-emerald-600" : "text-slate-400"}`}>{pwOk ? "Mật khẩu đạt yêu cầu" : "Cần: tối thiểu 8 ký tự, có chữ hoa, chữ thường, số và ký tự đặc biệt"}</p>}
            </div>
            <div>
              <label className="lbl">Xác nhận mật khẩu <span className="text-rose-500">*</span></label>
              <input className="inp" name="adminPassword2" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              {password2 && password !== password2 && <p className="mt-1.5 text-xs font-medium text-rose-500">Mật khẩu xác nhận không khớp</p>}
            </div>
          </div>
          <label className="mt-6 flex cursor-pointer items-start gap-3 border-t border-slate-100 pt-5 text-sm leading-relaxed text-slate-600">
            <input type="checkbox" name="agree" value="1" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4.5 w-4.5 shrink-0 accent-brand-600" />
            <span>Tôi đồng ý với <span className="font-semibold text-slate-800 underline">điều khoản sử dụng</span> và chịu trách nhiệm về nội dung trên website con của mình</span>
          </label>
          {step2Err && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{step2Err}</div>}
        </div>

        {/* ===== Bước 3: Xem lại & thanh toán ===== */}
        <div className={step === 3 ? "mt-7 flex-1" : "hidden"}>
          <div className="flex items-start gap-3.5 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <span className="shrink-0 text-amber-500">{WarnIcon}</span>
            <span>
              <span className="block font-bold text-slate-900">Xem lại trước khi xác nhận</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-slate-600">Số tiền sẽ bị trừ ngay vào số dư của bạn và bạn sẽ nhận được thông tin NameServer để trỏ tên miền sau bước này.</span>
            </span>
          </div>
          <div className="mt-5 rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-400"><span className="text-brand-600">{GlobeIcon}</span> Thông tin domain</div>
            <div className="mt-3.5 space-y-2.5 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Tên miền</span><span className="font-bold text-slate-900">{cleanDomain || "—"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Admin</span><span className="font-bold text-slate-900">{username.trim().toLowerCase() || "—"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Thời hạn</span><span className="font-bold text-slate-900">{fee > 0 ? "30 ngày" : "Không giới hạn"}</span></div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-slate-400"><span className="text-brand-600">{I.money}</span> Thanh toán</div>
            <div className="mt-3.5 space-y-2.5 text-sm">
              <div className="flex justify-between gap-4"><span className="text-slate-500">Chi phí tạo</span><span className="font-extrabold text-brand-700">{fee > 0 ? vnd(fee) : "Miễn phí"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Phương thức</span><span className="font-bold text-slate-900">Số dư tài khoản</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Gia hạn</span><span className={`font-bold ${fee > 0 ? "text-emerald-600" : "text-slate-900"}`}>{fee > 0 ? "Tự động" : "—"}</span></div>
              <div className="flex justify-between gap-4"><span className="text-slate-500">Số dư sau khi tạo</span><span className={`font-bold ${balanceOk ? "text-slate-900" : "text-rose-500"}`}>{vnd(balance - fee)}</span></div>
            </div>
          </div>
          {!balanceOk && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">Số dư không đủ — phí tạo là {vnd(fee)}, số dư hiện tại {vnd(balance)}. Hãy nạp thêm rồi quay lại.</div>}
          <ul className="mt-5 space-y-2 text-sm text-slate-500">
            <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-slate-400">{InfoIcon}</span>Domain không thể thay đổi sau khi tạo</li>
            <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-slate-400">{InfoIcon}</span>Tên đăng nhập của tài khoản admin không thể chỉnh sửa sau này</li>
            <li className="flex gap-2"><span className="mt-0.5 shrink-0 text-slate-400">{InfoIcon}</span>Nameserver sẽ hiển thị ở bước tiếp theo để bạn trỏ tên miền</li>
          </ul>
          <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3.5 text-sm font-semibold text-slate-700">
            <input type="checkbox" name="confirm" value="1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="h-4.5 w-4.5 shrink-0 accent-brand-600" />
            Tôi đã kiểm tra kỹ thông tin và xác nhận tạo Child Panel
          </label>
          <button type="submit" disabled={!confirm || !balanceOk} className="btn-primary mt-4 w-full !py-3.5 disabled:cursor-not-allowed disabled:opacity-50">
            Xác nhận & Tạo{fee > 0 ? ` — ${vnd(fee)}` : " — Miễn phí"}
          </button>
        </div>

        {/* Điều hướng bước */}
        {step < 3 ? (
          <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-5">
            <button type="button" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1} className="btn-ghost btn-sm !px-4 !py-2.5 disabled:opacity-40">‹ Quay lại</button>
            {step === 1 ? (
              <button type="button" onClick={() => domainCheck.state === "ok" && setStep(2)} disabled={domainCheck.state !== "ok"} className="btn-primary btn-sm !px-5 !py-2.5 disabled:cursor-not-allowed disabled:opacity-50">Tiếp tục ›</button>
            ) : (
              <button type="button" onClick={nextFromStep2} className="btn-primary btn-sm !px-5 !py-2.5">Tiếp tục ›</button>
            )}
          </div>
        ) : (
          <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-5">
            <button type="button" onClick={() => setStep(2)} className="btn-ghost btn-sm !px-4 !py-2.5">‹ Quay lại</button>
            <span className="text-[13px] italic text-slate-400">Thanh toán & tạo ngay tại bước này</span>
          </div>
        )}
      </form>

      {/* Cột phải: thông tin gói / tính năng / FAQ — cố định suốt các bước như bản mẫu */}
      <div className="space-y-6">
        <div className="card p-6">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Thông tin gói</div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4"><span className="text-slate-500">Chi phí</span><span className="font-extrabold text-brand-700">{fee > 0 ? vnd(fee) : "Miễn phí"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Thời hạn</span><span className="font-bold text-slate-900">{fee > 0 ? "30 ngày / kỳ" : "Không giới hạn"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Gia hạn</span><span className={`font-bold ${fee > 0 ? "text-emerald-600" : "text-slate-900"}`}>{fee > 0 ? "Tự động" : "—"}</span></div>
            <div className="flex justify-between gap-4"><span className="text-slate-500">Domain</span><span className="max-w-[55%] truncate font-bold text-slate-900">{cleanDomain || "—"}</span></div>
          </div>
        </div>
        <div className="card p-6">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Tính năng</div>
          <ul className="mt-4 space-y-3">
            {FEATURES.map((f) => (
              <li key={f.text} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{f.icon}</span>{f.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6">
          <div className="text-xs font-extrabold uppercase tracking-wider text-slate-400">Câu hỏi thường gặp</div>
          <div className="mt-4 space-y-4">
            {FAQS.map((f) => (
              <div key={f.q}>
                <div className="text-sm font-bold text-slate-800">{f.q}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
