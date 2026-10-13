"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** FOOD-02: native BarcodeDetector where available (Chrome/Android), otherwise type the number. */
export function BarcodeScanner({ onCode }: { onCode: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [supported] = useState(() => typeof window !== "undefined" && "BarcodeDetector" in window);
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!scanning) return;
    let stop = false;
    let stream: MediaStream | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        const Ctor = (window as unknown as { BarcodeDetector: new (o: object) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
        while (!stop) {
          const codes = await detector.detect(v).catch(() => []);
          if (codes[0]?.rawValue) {
            onCode(codes[0].rawValue);
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setError("Couldn't open the camera. Type the barcode number instead.");
      }
    })();
    return () => {
      stop = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning, onCode]);

  return (
    <div className="grid gap-4">
      {supported && (
        scanning ? (
          <div className="overflow-hidden rounded-2xl bg-nm-ink-card">
            <video ref={videoRef} playsInline muted className="aspect-video w-full object-cover" aria-label="Barcode camera" />
          </div>
        ) : (
          <Button onClick={() => setScanning(true)} className="h-12 rounded-xl font-bold">Scan with camera</Button>
        )
      )}
      {error && <p role="alert" className="text-sm font-bold text-nm-danger">{error}</p>}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) onCode(manual.trim());
        }}
      >
        <label htmlFor="barcode" className="sr-only">Barcode number</label>
        <input
          id="barcode" inputMode="numeric" placeholder="Barcode number (e.g. 4800…)" value={manual}
          onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))}
          className="h-12 flex-1 rounded-xl border border-nm-line bg-nm-soft/60 px-4"
        />
        <Button type="submit" variant="outline" className="h-12 rounded-xl bg-white font-bold">Look up</Button>
      </form>
    </div>
  );
}
