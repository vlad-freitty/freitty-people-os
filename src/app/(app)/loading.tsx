/** Shown while a page of the signed-in area loads on the server. */
export default function Loading() {
  return (
    <div className="space-y-4" aria-busy="true">
      <div className="h-9 w-64 animate-pulse rounded-md bg-cream-deep" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl border border-line bg-paper" />
        ))}
      </div>
    </div>
  );
}
