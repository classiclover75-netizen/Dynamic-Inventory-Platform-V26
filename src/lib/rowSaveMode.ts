export function validateReplacePayload(
  existingRows: any[],
  newRows: any[]
): { ok: boolean; reason?: string } {
  if (!Array.isArray(newRows)) {
    return { ok: false, reason: "Payload is not an array." };
  }
  if (existingRows && newRows.length > existingRows.length) {
    return { ok: false, reason: "Replacement payload has more rows than existing data." };
  }
  for (const row of newRows) {
    if (!row.id || typeof row.id !== "string" || row.id.trim() === "") {
      return { ok: false, reason: "One or more rows lack a valid id." };
    }
  }
  return { ok: true };
}
