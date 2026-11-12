import { categoryColor } from "@/lib/format";

/** Swiss category chip: square, uppercase, hairline border; black fill = severe. */
export default function CategoryChip({ category, className = "" }: { category?: string | null; className?: string }) {
  const { bg, fg } = categoryColor(category);
  const label = (category || "general").replace(/_/g, " ");
  return (
    <span className={`chip border ${className}`} style={{ backgroundColor: bg, color: fg, borderColor: fg }}>
      {label}
    </span>
  );
}
