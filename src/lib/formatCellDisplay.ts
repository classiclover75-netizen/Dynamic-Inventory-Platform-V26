export function formatCellDisplay(val: any): string {
  if (val === null || val === undefined) return "";
  if (Array.isArray(val)) return val.join("\n");
  return String(val);
}
