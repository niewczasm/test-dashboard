export function StatTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div
        className="mt-1 text-3xl font-semibold"
        style={{ color: accent ?? "var(--text-primary)", fontVariantNumeric: "proportional-nums" }}
      >
        {value}
      </div>
    </div>
  );
}
