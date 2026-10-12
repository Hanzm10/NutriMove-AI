import { NmCard, Eyebrow } from "./card";

export type PlaceholderSection = { title: string; body: string; req: string };

/** Day-1 scaffolding: shows which PRD requirement fills each card. Replace as features land. */
export function PlaceholderGrid({ sections }: { sections: PlaceholderSection[] }) {
  return (
    <div className="mt-10 grid gap-5 md:grid-cols-2">
      {sections.map((s) => (
        <NmCard key={s.title}>
          <Eyebrow>{s.req}</Eyebrow>
          <h2 className="mt-2 text-[1.777rem] leading-tight">{s.title}</h2>
          <p className="mt-3 text-nm-muted">{s.body}</p>
          <p className="mt-5 inline-flex rounded-full bg-nm-soft px-3 py-1 text-xs font-bold text-nm-primary-ink">
            Coming this week
          </p>
        </NmCard>
      ))}
    </div>
  );
}
