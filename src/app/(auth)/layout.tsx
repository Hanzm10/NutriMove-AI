import { Logo } from "@/components/shell/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh bg-nm-canvas lg:grid-cols-2">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <header><Logo href="/" /></header>
        <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          {children}
        </main>
        <footer className="text-xs text-nm-muted">
          NutriMove AI is not a medical device and does not give medical advice.
        </footer>
      </div>
      <aside aria-label="About NutriMove AI" className="hidden p-6 lg:block">
        <div className="flex h-full flex-col justify-end rounded-card bg-gradient-to-br from-[#c6e98c] to-nm-primary p-12">
          <p className="w-fit rounded-full bg-white px-3 py-1 text-xs font-bold">Your AI coach</p>
          <p className="mt-6 text-[3.157rem] leading-[1.02] font-black">
            Build strength.
            <br />
            Move with confidence.
          </p>
          <p className="mt-4 max-w-md text-lg">
            Real-time form feedback, Filipino-friendly meal plans, and targets that adapt every week.
          </p>
        </div>
      </aside>
    </div>
  );
}
