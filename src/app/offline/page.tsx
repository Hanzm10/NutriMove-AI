import { WifiOff } from "lucide-react";
import type { Metadata } from "next";
import { Logo } from "@/components/shell/logo";

export const metadata: Metadata = { title: "Offline" };

/** Shown by the service worker when a page hasn't been visited yet and there's no connection. */
export default function OfflinePage() {
  return (
    <main id="main" className="grid min-h-dvh place-items-center bg-nm-canvas p-6">
      <div className="max-w-md rounded-card border border-nm-line bg-white p-8 text-center">
        <div className="flex justify-center"><Logo href="/overview" /></div>
        <WifiOff className="mx-auto mt-6 size-10 text-nm-primary-ink" aria-hidden />
        <h1 className="mt-4 text-2xl font-black">You&apos;re offline</h1>
        <p className="mt-2 text-nm-muted">
          Pages you opened recently still work offline. Reconnect to log food, sync workouts or open a new page.
        </p>
      </div>
    </main>
  );
}
