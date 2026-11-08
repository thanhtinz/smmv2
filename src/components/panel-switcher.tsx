"use client";
import { useLang } from "@/components/lang";

/** Bộ chọn panel đang quản trị — chỉ hiện khi tài khoản sở hữu/làm việc cho
 *  nhiều website con. Chọn xong đi qua /api/panels/select để ghi cookie chọn panel. */
export function PanelSwitcher({ panels, currentId }: { panels: { id: number; label: string }[]; currentId: number }) {
  const { t } = useLang();
  return (
    <select
      className="inp !w-auto max-w-[180px] !py-1.5 text-sm font-semibold"
      value={currentId}
      title={t("Chọn website con đang quản trị")}
      onChange={(e) => { window.location.href = `/api/panels/select?id=${e.target.value}`; }}
    >
      {panels.map((p) => (
        <option key={p.id} value={p.id}>{p.label}</option>
      ))}
    </select>
  );
}
