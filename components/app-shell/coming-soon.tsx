interface ComingSoonProps {
  title: string;
  phase: string;
}

export function ComingSoon({ title, phase }: ComingSoonProps) {
  return (
    <div>
      <h1 className="text-title font-bold text-ink">{title}</h1>
      <p className="mt-1 text-small text-muted">Coming in {phase}.</p>
    </div>
  );
}
