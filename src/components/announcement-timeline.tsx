export type AnnouncementItemDTO = { id: number; title: string; body: string; time: string };
export type AnnouncementGroupDTO = { label: string; items: AnnouncementItemDTO[] };

/** Dòng thời gian thông báo trên nền tối: mỗi ngày một mốc, các thẻ thông báo xếp dưới mốc ngày. */
export function AnnouncementTimeline({ groups }: { groups: AnnouncementGroupDTO[] }) {
  return (
    <div className="relative space-y-9 before:absolute before:bottom-2 before:left-[5px] before:top-2 before:w-px before:bg-white/10">
      {groups.map((g) => (
        <div key={g.label} className="relative pl-8">
          <span className="absolute left-0 top-1 h-[11px] w-[11px] rounded-full bg-rose-500 ring-4 ring-rose-500/20" />
          <div className="text-sm font-bold uppercase tracking-wide text-rose-300">{g.label}</div>
          <div className="mt-3 space-y-3">
            {g.items.map((a) => (
              <article key={a.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-bold leading-snug text-white">{a.title}</h3>
                  <span className="shrink-0 rounded-full bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-400">{a.time}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-400">{a.body}</p>
              </article>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
