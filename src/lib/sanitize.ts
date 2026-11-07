/** Làm sạch HTML do admin/chủ panel soạn (bài viết, mô tả sản phẩm, thông báo...)
 *  trước khi render: chỉ giữ thẻ + thuộc tính an toàn, loại bỏ script/sự kiện/
 *  URL javascript: — chống stored XSS. Mã tuỳ chỉnh ở Cài đặt (head/body) của
 *  admin cấp cao nhất KHÔNG đi qua hàm này (đó là tính năng chèn mã có chủ đích). */

const ALLOWED_TAGS = new Set([
  "p", "br", "b", "strong", "i", "em", "u", "s", "a", "ul", "ol", "li",
  "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "img", "span", "div",
  "table", "thead", "tbody", "tr", "td", "th", "hr", "pre", "code", "small", "sub", "sup",
]);
const DROP_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "form", "input", "button",
  "textarea", "select", "link", "meta", "title", "noscript", "template", "svg", "math", "video", "audio", "source",
]);
const VOID_TAGS = new Set(["br", "hr", "img"]);

function safeUrl(raw: string, isImage: boolean): string | null {
  const v = raw.replace(/[\s\u0000-\u0020]+/g, "").trim();
  if (!v) return null;
  if (isImage && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v)) return raw.trim();
  if (/^(https?:\/\/|mailto:|tel:|#|\/)/i.test(v)) return raw.trim();
  return null;
}

function filterAttrs(tag: string, attrText: string): string {
  const out: string[] = [];
  const re = /([a-zA-Z][a-zA-Z0-9-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrText)) !== null) {
    const name = m[1].toLowerCase();
    const val = (m[2] ?? m[3] ?? m[4] ?? "").replace(/"/g, "&quot;");
    if (name.startsWith("on") || name === "style" || name === "id") continue;
    if (name === "class") {
      if (/^[a-zA-Z0-9 _-]+$/.test(val)) out.push(`class="${val}"`);
      continue;
    }
    if (tag === "a") {
      if (name === "href") {
        const ok = safeUrl(val, false);
        if (ok) out.push(`href="${ok.replace(/"/g, "&quot;")}"`);
      } else if (name === "target" && val === "_blank") out.push(`target="_blank" rel="noopener noreferrer"`);
      else if (name === "title") out.push(`title="${val}"`);
      continue;
    }
    if (tag === "img") {
      if (name === "src") {
        const ok = safeUrl(val, true);
        if (ok) out.push(`src="${ok.replace(/"/g, "&quot;")}"`);
      } else if (name === "alt") out.push(`alt="${val}"`);
      else if ((name === "width" || name === "height") && /^\d{1,4}$/.test(val)) out.push(`${name}="${val}"`);
      continue;
    }
    if ((tag === "td" || tag === "th") && (name === "colspan" || name === "rowspan") && /^\d{1,2}$/.test(val)) {
      out.push(`${name}="${val}"`);
    }
  }
  return out.length ? " " + out.join(" ") : "";
}

export function sanitizeHtml(html: string): string {
  const noComments = html.replace(/<!--[\s\S]*?-->/g, "");
  const tokens = noComments.split(/(<\/?[a-zA-Z][^>]*>)/g);
  let out = "";
  let dropDepth = 0;
  let dropTag = "";
  for (const tok of tokens) {
    const tagMatch = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([\s\S]*?)>$/.exec(tok);
    if (!tagMatch) {
      if (dropDepth === 0) out += tok;
      continue;
    }
    const closing = tagMatch[1] === "/";
    const name = tagMatch[2].toLowerCase();
    const rest = tagMatch[3] || "";
    if (dropDepth > 0) {
      if (name === dropTag) dropDepth += closing ? -1 : 1;
      continue;
    }
    if (DROP_WITH_CONTENT.has(name)) {
      if (!closing && !VOID_TAGS.has(name)) {
        dropDepth = 1;
        dropTag = name;
      }
      continue;
    }
    if (!ALLOWED_TAGS.has(name)) continue; // bỏ thẻ lạ nhưng giữ nội dung chữ
    if (closing) {
      if (!VOID_TAGS.has(name)) out += `</${name}>`;
      continue;
    }
    out += `<${name}${filterAttrs(name, rest)}${VOID_TAGS.has(name) ? " />" : ">"}`;
  }
  return out;
}
