export function TagBadge({
  name,
  color,
  onRemove,
}: {
  name: string;
  color: string;
  onRemove?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
    >
      {name}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-0.5 leading-none opacity-70 hover:opacity-100"
          aria-label={`Remove tag ${name}`}
        >
          ×
        </button>
      )}
    </span>
  );
}
