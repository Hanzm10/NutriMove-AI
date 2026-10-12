import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/shell/logo";
import { getUser } from "@/lib/supabase/server";

export default async function Landing() {
  if (await getUser()) redirect("/overview");
  return (
    <div className="min-h-dvh bg-nm-canvas px-5 py-8 sm:px-10">
      <Logo href="/" />
      <main id="main" className="mx-auto mt-16 max-w-5xl">
        <div className="rounded-card bg-gradient-to-br from-[#c6e98c] to-nm-primary p-8 sm:p-14">
          <p className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold">Your intelligent coach</p>
          <h1 className="mt-6 text-[2.369rem] leading-[1.02] font-black sm:text-[4.209rem]">
            Build strength.
            <br />
            Move with confidence.
          </h1>
          <p className="mt-5 max-w-xl text-lg">
            NutriMove AI counts your reps and corrects your form in real time, tracks your meals
            (Filipino dishes included), and adjusts your plan every week.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-xl bg-nm-ink px-6 py-3.5 font-bold text-white">
              Get started
            </Link>
            <Link href="/login" className="rounded-xl bg-white px-6 py-3.5 font-bold text-nm-ink">
              Sign in
            </Link>
          </div>
        </div>
        <p className="mt-8 text-sm text-nm-muted">
          For adults 18+. NutriMove AI is not a medical device and does not give medical advice.
          Camera video is processed in real time and never stored.
        </p>
      </main>
    </div>
  );
}
