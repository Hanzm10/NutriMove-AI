"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

type Row = Record<string, string | number | null>;

/** Every session as CSV, for the paper's latency table. */
export function LatencyCsv({ rows }: { rows: Row[] }) {
  function download() {
    const cols = Object.keys(rows[0] ?? {});
    const esc = (v: unknown) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replaceAll('"', '""')}"` : String(v));
    const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "latency-log.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Button type="button" variant="outline" className="h-11 rounded-xl bg-white px-5 font-bold" onClick={download}>
      <Download aria-hidden /> Download all sessions (CSV)
    </Button>
  );
}
