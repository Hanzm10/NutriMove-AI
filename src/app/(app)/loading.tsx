// Shown the moment a page link is tapped, while the server renders the page (every app page is dynamic). Next.js
// prefetches it with the layout, so navigation switches immediately instead of waiting with no feedback.
export default function Loading() {
  const bar = "rounded-lg bg-nm-soft motion-safe:animate-pulse";
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div aria-hidden>
        <div className={`h-3 w-28 ${bar}`} />
        <div className={`mt-3 h-9 w-72 max-w-full ${bar}`} />
        <div className={`mt-3 h-4 w-96 max-w-full ${bar}`} />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-card border border-nm-line bg-white p-6">
              <div className={`h-3 w-20 ${bar}`} />
              <div className={`mt-4 h-8 w-24 ${bar}`} />
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-card border border-nm-line bg-white p-6 sm:p-7">
          <div className={`h-5 w-48 ${bar}`} />
          <div className={`mt-5 h-4 w-full ${bar}`} />
          <div className={`mt-3 h-4 w-5/6 ${bar}`} />
          <div className={`mt-3 h-4 w-2/3 ${bar}`} />
        </div>
      </div>
    </div>
  );
}
