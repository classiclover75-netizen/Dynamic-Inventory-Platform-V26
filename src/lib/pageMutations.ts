import { PageConfig } from "../types";

export async function assertOk(res: Response, fallbackMessage: string) {
  if (res.ok) return;
  let message = `${fallbackMessage} (${res.status})`;
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string') {
      message = body.error;
    }
  } catch (e) {
    // Ignore JSON parse errors
  }
  throw new Error(message);
}

export async function createPageSafe(name: string, config: PageConfig) {
  const res = await fetch("/api/pages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, config }),
  });
  await assertOk(res, "Failed to create page");
}

export async function renamePageSafe(oldName: string, newName: string) {
  const res = await fetch(`/api/pages/${encodeURIComponent(oldName)}/rename`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newName }),
  });
  await assertOk(res, "Failed to rename page");
}

export async function deletePageSafe(name: string) {
  const res = await fetch(`/api/pages/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  await assertOk(res, "Failed to delete page");
}
