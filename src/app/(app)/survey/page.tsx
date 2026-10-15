import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/page-header";
import { SurveyForm } from "./survey-form";

export const metadata: Metadata = { title: "Feedback survey" };

// PRD §12.5 / §12.6: pilot participants' SUS and ISO/IEC 25010 questionnaire.
export default function SurveyPage() {
  return (
    <>
      <PageHeader
        eyebrow="Pilot test"
        title="Tell us what you think"
        subtitle="Two short questionnaires, about 5 minutes. Answers are reported only as group averages."
      />
      <div className="mt-8 max-w-3xl">
        <SurveyForm />
      </div>
    </>
  );
}
