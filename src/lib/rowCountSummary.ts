export function buildRowCountSummary(
  visibleCount: number,
  totalCount: number,
  isSearchActive: boolean
): { text: string; tone: "idle" | "active" | "empty" } {
  const formattedVisible = visibleCount.toLocaleString();
  const formattedTotal = totalCount.toLocaleString();

  if (!isSearchActive) {
    return {
      text: `${formattedTotal} rows`,
      tone: "idle",
    };
  }

  if (visibleCount > 0) {
    return {
      text: `${formattedVisible} / ${formattedTotal} rows`,
      tone: "active",
    };
  }

  return {
    text: `no matches (${formattedTotal} rows)`,
    tone: "empty",
  };
}
