"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { tr, trd, formatMoney } from "@/lib/i18n";

/* Ngữ cảnh ngôn ngữ/tiền tệ TẠI LÚC RENDER cho client components.
 * Layout phía server (root + từng khu vực) resolve sẵn lang/cur/rates/overrides
 * theo cookie + cấu hình site rồi truyền xuống qua LangProvider — client component
 * dùng useLang() để dịch và định dạng tiền ngay trong lần render đầu tiên,
 * KHÔNG còn lớp vá DOM sau khi trang hiện (cơ chế cũ đã bị loại bỏ). */

export type LangCtx = {
  lang: string;
  cur: string;
  rates: Record<string, number>;
  ov?: Record<string, string>;
  /** Dịch khớp chính xác theo từ điển + bản dịch tuỳ chỉnh của site. */
  t: (text: string) => string;
  /** Như t nhưng thêm dịch theo mảnh cho dòng ghép có số. */
  td: (text: string) => string;
  /** Định dạng số tiền VND theo tiền tệ hiển thị đã chọn. */
  m: (vndInt: number) => string;
};

const FALLBACK: LangCtx = {
  lang: "en",
  cur: "VND",
  rates: {},
  t: (s) => tr("en", s),
  td: (s) => trd("en", s),
  m: (n) => formatMoney(n, "VND", "en"),
};

const Ctx = createContext<LangCtx>(FALLBACK);

export function LangProvider({
  lang,
  ov,
  cur,
  rates,
  children,
}: {
  lang: string;
  ov?: Record<string, string>;
  cur: string;
  rates: Record<string, number>;
  children: ReactNode;
}) {
  const value = useMemo<LangCtx>(
    () => ({
      lang,
      cur,
      rates,
      ov,
      t: (s) => tr(lang, s, ov),
      td: (s) => trd(lang, s, ov),
      m: (n) => formatMoney(n, cur, lang, rates),
    }),
    [lang, ov, cur, rates]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  return useContext(Ctx);
}
