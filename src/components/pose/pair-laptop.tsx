"use client";

import { CheckCircle2, Laptop, Loader2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import { NmCard } from "@/components/shell/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PAIRING_KEY, clearPairing, httpUrl, pairingFromRaw, parsePairing, savePairing, type Pairing } from "@/lib/pose/remote/protocol";

type Status = { kind: "idle" } | { kind: "checking" } | { kind: "ok"; provider: string } | { kind: "error"; message: string };

/** Pairs this device with the team's laptop pose server (PRD §7.7.3). The user must tap Connect after reading the notice. */
export function PairLaptop() {
  // The QR / link from the laptop prefills the form; nothing is stored until the user taps Connect.
  const snap = useSyncExternalStore(
    () => () => {},
    () => `${location.search}\n${localStorage.getItem(PAIRING_KEY) ?? ""}`,
    () => "",
  );
  const init = useMemo(() => {
    const [search = "", raw = ""] = snap.split("\n");
    const q = new URLSearchParams(search);
    const existing = pairingFromRaw(raw);
    return { existing, server: q.get("server") ?? existing?.server ?? "", token: q.get("token") ?? existing?.token ?? "" };
  }, [snap]);
  const [serverEdit, setServer] = useState<string | null>(null);
  const [tokenEdit, setToken] = useState<string | null>(null);
  const [savedEdit, setSaved] = useState<Pairing | null | undefined>(undefined);
  const server = serverEdit ?? init.server;
  const token = tokenEdit ?? init.token;
  const saved = savedEdit === undefined ? init.existing : savedEdit;
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    const p = parsePairing(server, token);
    if (!p) {
      setStatus({ kind: "error", message: "That address or code doesn't look right. Use the link the laptop printed (it ends in .trycloudflare.com)." });
      return;
    }
    setStatus({ kind: "checking" });
    try {
      const res = await fetch(httpUrl(p, "/health"), { signal: AbortSignal.timeout(10_000) });
      const body = (await res.json()) as { ok?: boolean; provider?: string };
      if (!body.ok) throw new Error("not ok");
      savePairing(localStorage, p);
      setSaved(p);
      setStatus({ kind: "ok", provider: String(body.provider ?? "").replace("ExecutionProvider", "") });
    } catch {
      setStatus({ kind: "error", message: "Could not reach the laptop. Check the hotspot, that start.sh / start.ps1 is still running, and that the link is the newest one." });
    }
  }

  return (
    <div className="grid gap-5">
      <NmCard>
        <h2 className="text-[1.333rem] leading-tight font-bold">What this does</h2>
        <p className="mt-2 text-nm-muted">
          The coach model runs on your team&apos;s laptop instead of this device. While you exercise, a small cropped picture of you
          (224 × 224 px) is sent encrypted to that laptop about ten times a second and turned into body joints. It is processed in
          memory and <strong>never stored or recorded</strong>, and the full camera frame never leaves this device.
        </p>
        <p className="mt-2 text-nm-muted">Only use a laptop you trust. You can turn this off below at any time.</p>
      </NmCard>

      <NmCard>
        <form onSubmit={connect} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="pose-server">Laptop address</Label>
            <Input id="pose-server" value={server} onChange={(e) => setServer(e.target.value)} placeholder="something-random.trycloudflare.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="url" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pose-token">Pairing code</Label>
            <Input id="pose-token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="6 digits shown on the laptop" autoComplete="off" inputMode="numeric" />
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" className="h-12 rounded-xl px-6 text-base font-bold" disabled={status.kind === "checking"}>
              {status.kind === "checking" ? <Loader2 className="animate-spin" aria-hidden /> : <Laptop aria-hidden />} Connect to this laptop
            </Button>
            {saved && (
              <Button
                type="button"
                variant="outline"
                className="h-12 rounded-xl bg-white px-6 font-bold"
                onClick={() => {
                  clearPairing(localStorage);
                  setSaved(null);
                  setStatus({ kind: "idle" });
                }}
              >
                Stop using the laptop
              </Button>
            )}
          </div>
          <div aria-live="polite">
            {status.kind === "ok" && (
              <p className="flex items-center gap-2 rounded-xl bg-nm-soft p-3 font-bold text-nm-primary-ink">
                <CheckCircle2 className="size-5" aria-hidden /> Connected{status.provider ? ` (laptop ${status.provider})` : ""}. The camera coach will use it now.
              </p>
            )}
            {status.kind === "error" && (
              <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-bold text-nm-danger">
                {status.message}
              </p>
            )}
            {saved && status.kind === "idle" && <p className="text-sm text-nm-muted">Paired with {saved.server}. The camera coach uses it.</p>}
          </div>
        </form>
      </NmCard>

      <Link href="/workout" className="font-bold text-nm-primary-ink underline">
        Back to AI Workout
      </Link>
    </div>
  );
}
