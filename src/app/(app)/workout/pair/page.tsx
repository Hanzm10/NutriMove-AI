import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { PairLaptop } from "@/components/pose/pair-laptop";

export const metadata: Metadata = { title: "Laptop coach" };

export default function PairPage() {
  return (
    <>
      <PageHeader
        eyebrow="AI Workout · camera coach"
        title="Use a laptop as the coach"
        subtitle="For phones that can't run the pose model. Your laptop does the heavy lifting."
      />
      <div className="mt-8 max-w-2xl">
        <PairLaptop />
      </div>
    </>
  );
}
