/** Hiển thị nội dung đã soạn bằng trình soạn thảo (HTML). Nội dung cũ dạng
 *  chữ thường (không có thẻ HTML) vẫn hiển thị nguyên văn theo dòng. */
export function RichText({ value, className = "" }: { value: string; className?: string }) {
  const styled = `[&_a]:text-brand-600 [&_a]:underline [&_h3]:mb-1 [&_h3]:mt-3 [&_h3]:text-base [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:mt-0.5 [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-xl ${className}`;
  if (/<\/?[a-z][\s\S]*>/i.test(value)) {
    return <div className={styled} dangerouslySetInnerHTML={{ __html: value }} />;
  }
  return <div className={`whitespace-pre-line ${styled}`}>{value}</div>;
}
