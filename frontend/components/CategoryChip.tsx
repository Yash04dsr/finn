import { categoryColor } from "@/lib/format";

/** Color-coded filing category chip. */
export default function CategoryChip({ category, className = "" }: { category?: string | null; className?: string }) {
  const { bg, fg } = categoryColor(category);
  const label = (category || "general").replace(/_/g, " ");
  return (
    <span className={`chip ${className}`} style={{ backgroundColor: bg, color: fg }}>
      {label}
    </span>
  );
}
