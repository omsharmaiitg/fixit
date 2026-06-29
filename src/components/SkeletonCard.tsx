// Shimmer placeholder matching IssueCard's dimensions so the feed doesn't jump.
export function SkeletonCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-surface p-3 shadow-card">
      <div className="flex gap-3">
        <div className="h-20 w-20 shrink-0 rounded-xl bg-slate-200" />
        <div className="flex-1 space-y-2 py-0.5">
          <div className="flex gap-2">
            <div className="h-4 w-20 rounded-full bg-slate-200" />
            <div className="h-4 w-14 rounded-full bg-slate-200" />
          </div>
          <div className="h-4 w-11/12 rounded bg-slate-200" />
          <div className="h-3 w-2/3 rounded bg-slate-200" />
          <div className="h-3 w-1/2 rounded bg-slate-200" />
        </div>
      </div>
      <div className="mt-3 h-1 w-full rounded-full bg-slate-200" />
      {/* sweeping shimmer */}
      <div className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/60 to-transparent [animation:shimmer_1.6s_infinite] motion-reduce:hidden" />
    </div>
  );
}
