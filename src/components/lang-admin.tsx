import Link from "next/link";
import { DICT, LANGS } from "@/lib/i18n";
import { PageHead, Flash } from "@/components/ui";
import { getServerI18n } from "@/lib/lang-server";

/* Trang Quản lý ngôn ngữ dùng chung cho Admin web mẹ và Panel Admin của site con:
 * bật/tắt ngôn ngữ, chọn mặc định và sửa bản dịch trực tiếp (lưu DB, áp dụng ngay).
 * base = bản dịch hiệu lực bên dưới lớp tuỳ chỉnh của site này (từ điển gốc, hoặc
 * đã gồm tuỳ chỉnh của web mẹ đối với site con); own = tuỳ chỉnh của chính site này. */

export type LangRow = { key: string; base: string; own: string };
type Action = (formData: FormData) => Promise<void>;

export const LANG_PAGE_SIZE = 120;

export function buildLangRows(
  lang: string,
  baseOv: Record<string, string>,
  ownOv: Record<string, string>,
  q: string
): { rows: LangRow[]; totalMatches: number; totalDict: number } {
  const all: LangRow[] = Object.entries(DICT).map(([key, v]) => ({
    key,
    base: baseOv[key] ?? (v as unknown as Record<string, string>)[lang] ?? "",
    own: ownOv[key] ?? "",
  }));
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? all.filter((r) => r.key.toLowerCase().includes(needle) || r.base.toLowerCase().includes(needle) || r.own.toLowerCase().includes(needle))
    : all;
  return { rows: filtered.slice(0, LANG_PAGE_SIZE), totalMatches: filtered.length, totalDict: all.length };
}

export async function LangAdminView(props: {
  basePath: string;
  msg?: string;
  err?: string;
  settingsAction: Action;
  saveAction: Action;
  resetAction: Action;
  enabled: string[];
  defaultLang: string;
  panelMode?: boolean;
  ownList?: boolean;
  lang: string;
  q: string;
  rows: LangRow[];
  totalMatches: number;
  totalDict: number;
  ownCount: number;
  totalOwn: number;
  inheritedNote?: string;
}) {
  const { L, Ld } = await getServerI18n();
  const { basePath, lang, q } = props;
  const langName = (k: string) => LANGS.find((l) => l.key === k)?.name || k;
  return (
    <div>
      <PageHead
        title={L("Quản lý ngôn ngữ")}
        desc={L("Bật/tắt ngôn ngữ hiển thị, chọn ngôn ngữ mặc định cho khách mới và sửa bản dịch trực tiếp — lưu vào cơ sở dữ liệu, áp dụng ngay không cần cập nhật lại hệ thống.")}
      />
      <Flash msg={props.msg} err={props.err} />

      <form action={props.settingsAction} className="card space-y-5 p-5">
        <div className="font-bold text-slate-900">{L("Ngôn ngữ đang bật & mặc định")}</div>
        {props.panelMode && (
          <label className="flex items-start gap-2.5 text-sm text-slate-600">
            <input type="checkbox" name="own_list" defaultChecked={!!props.ownList} className="mt-0.5 h-4 w-4 accent-brand-600" />
            <span>{L("Tự cấu hình danh sách ngôn ngữ + mặc định cho website này (bỏ chọn = dùng theo web mẹ). Phần bản dịch tuỳ chỉnh bên dưới luôn là của riêng website này và đè lên bản dịch của web mẹ.")}</span>
          </label>
        )}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {LANGS.map((l) => (
            <label key={l.key} className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 py-3 text-sm">
              <input type="checkbox" name="lang_enabled" value={l.key} defaultChecked={props.enabled.includes(l.key)} className="h-4 w-4 accent-brand-600" />
              <span className="font-medium text-slate-700">{l.name}</span>
              <span className="ml-auto text-xs uppercase text-slate-400">{l.key}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="lbl">{L("Ngôn ngữ mặc định (khách mới)")}</label>
            <select className="inp !w-56" name="default_lang" defaultValue={props.defaultLang}>
              {LANGS.map((l) => (
                <option key={l.key} value={l.key}>{l.name}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary">{L("Lưu cấu hình")}</button>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          {L("Ngôn ngữ bị tắt sẽ biến mất khỏi bộ chọn ngôn ngữ trên website; khách đang dùng ngôn ngữ đó sẽ tự chuyển về ngôn ngữ mặc định. Không tắt được hết và ngôn ngữ mặc định phải đang bật. Khách đã chọn ngôn ngữ khác trước đó vẫn giữ lựa chọn của họ.")}
        </p>
      </form>

      <div className="card mt-6 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="font-bold text-slate-900">{L("Sửa bản dịch")}</div>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">
            {props.totalDict}{L(" chuỗi · đã tuỳ chỉnh ")}{props.totalOwn}
          </span>
          {props.inheritedNote && <span className="text-xs text-slate-400">{props.inheritedNote}</span>}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {LANGS.filter((l) => l.key !== "vi").map((l) => (
            <Link
              key={l.key}
              href={`${basePath}?lang=${l.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${lang === l.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
            >
              {l.name}
            </Link>
          ))}
          <form className="ml-auto flex gap-2" action={basePath} method="get">
            <input type="hidden" name="lang" value={lang} />
            <input className="inp !w-64" name="q" defaultValue={q} placeholder={L("Tìm chuỗi gốc hoặc bản dịch...")} />
            <button className="btn-ghost">{L("Tìm")}</button>
          </form>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          {L("Đang sửa bản dịch sang ")}<b className="text-slate-600">{langName(lang)}</b>{L(" · đã tuỳ chỉnh ")}{props.ownCount}{L(" chuỗi ở ngôn ngữ này. Ô để trống hoặc gõ giống hệt bản gốc = dùng bản dịch gốc. Chuỗi tiếng Việt là gốc của hệ thống, không sửa tại đây.")}
        </p>

        <form action={props.saveAction} className="mt-4">
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="n" value={props.rows.length} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className="th w-[34%]">{L("Chuỗi tiếng Việt gốc")}</th>
                  <th className="th w-[38%]">{L("Bản dịch gốc")} <span className="font-normal">({langName(lang)})</span></th>
                  <th className="th">{L("Bản dịch tuỳ chỉnh")}</th>
                  <th className="th w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {props.rows.map((r, i) => (
                  <tr key={r.key} className="align-top">
                    <td className="td text-[13px] leading-relaxed text-slate-600">{r.key}</td>
                    <td className="td text-[13px] leading-relaxed text-slate-400">{r.base || "—"}</td>
                    <td className="td">
                      <input type="hidden" name={`k_${i}`} value={r.key} />
                      <input className="inp !py-2 text-[13px]" name={`v_${i}`} defaultValue={r.own} placeholder={r.base || L("Chưa có bản dịch")} />
                    </td>
                    <td className="td whitespace-nowrap">
                      {r.own ? (
                        <>
                          <span className="mr-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-700">{L("Đã sửa")}</span>
                          <button className="btn-ghost btn-sm !text-rose-600" formAction={props.resetAction} name="rk" value={r.key} formNoValidate>
                            {L("Về gốc")}
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {props.rows.length === 0 && (
                  <tr>
                    <td className="td text-slate-400" colSpan={4}>{L("Không có chuỗi nào khớp tìm kiếm.")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {props.totalMatches > props.rows.length && (
            <p className="mt-3 text-xs text-amber-600">
              {L("Đang hiển thị ")}{props.rows.length}/{props.totalMatches}{L(" chuỗi khớp — hãy thu hẹp ô tìm kiếm để sửa các chuỗi còn lại.")}
            </p>
          )}
          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary">{L("Lưu bản dịch")}</button>
            <span className="text-xs text-slate-400">{L("Áp dụng ngay cho toàn bộ website sau khi lưu.")}</span>
          </div>
        </form>
      </div>
    </div>
  );
}
