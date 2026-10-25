/** Shown while a page of the signed-in area loads on the server: the shape of a page title, KPI row and cards. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="flex items-center gap-4">
        <div className="hidden size-[52px] animate-pulse rounded-xl bg-cream-deep sm:block" />
        <div className="space-y-2">
          <div className="h-9 w-64 max-w-[70vw] animate-pulse rounded-xl bg-cream-deep" />
          <div className="h-4 w-48 animate-pulse rounded-lg bg-cream-deep/70" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[92px] animate-pulse rounded-card border border-edge bg-paper" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-3 rounded-card border border-edge bg-paper p-5">
            <div className="flex items-center gap-3">
              <div className="size-9 animate-pulse rounded-xl bg-cream-deep" />
              <div className="h-4 w-32 animate-pulse rounded-lg bg-cream-deep" />
            </div>
            {[0, 1, 2].map((j) => (
              <div key={j} className="h-10 animate-pulse rounded-xl bg-cream" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
