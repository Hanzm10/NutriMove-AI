import type { Metadata } from "next";
import { ConsentForm } from "./consent-form";

export const metadata: Metadata = { title: "Your consent" };

export default function ConsentPage() {
  return (
    <div>
      <p className="text-xs font-bold tracking-[0.12em] text-nm-primary-ink uppercase">Before we start</p>
      <h1 className="mt-2 text-[2.369rem] leading-tight font-black">Your data, your choice</h1>
      <p className="mt-2 text-nm-muted">
        We only collect what we need to coach you. Please review and accept.
      </p>
      <ConsentForm />
    </div>
  );
}
