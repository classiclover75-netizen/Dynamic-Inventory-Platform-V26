import { setPageVersion, getPageVersion } from './pageVersion';

export async function savePageConfig(pageName: string, config: any) {
  return fetch(`/api/pageConfigs/${encodeURIComponent(pageName)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
}
export async function patchRow(pageName: string, rowId: any, updates: any, force = false) {
  const res = await fetch(`/api/pageRows/${encodeURIComponent(pageName)}/${encodeURIComponent(rowId)}${force ? "?force=true" : ""}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ updates }),
  });
  try { const data = await res.clone().json(); if (data.success && Number.isInteger(data.rowsVersion)) { setPageVersion(pageName, data.rowsVersion); } } catch(e) {}
  return res;
}
export async function deleteRow(pageName: string, rowId: any) {
  const res = await fetch(`/api/pageRows/${encodeURIComponent(pageName)}/${encodeURIComponent(rowId)}`, {
    method: "DELETE",
  });
  try { const data = await res.clone().json(); if (data.success && Number.isInteger(data.rowsVersion)) { setPageVersion(pageName, data.rowsVersion); } } catch(e) {}
  return res;
}
export async function putRows(pageName: string, rows: any[], skipImageProcessing = false) {
  const expectedVersion = getPageVersion(pageName);
  const reqBody = (expectedVersion !== undefined && Number.isInteger(expectedVersion)) 
    ? { rows, expectedVersion } 
    : { rows };
  
  const res = await fetch(`/api/pageRows/${encodeURIComponent(pageName)}${skipImageProcessing ? "?skipImageProcessing=true" : ""}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody),
  });
  try { const data = await res.clone().json(); if (data.success && Number.isInteger(data.rowsVersion)) { setPageVersion(pageName, data.rowsVersion); } } catch(e) {}
  return res;
}
export async function appendPageRows(pageName: string, rows: any[], force = false, skipImageProcessing = false) {
  const q = new URLSearchParams(); if(force) q.set("force", "true"); if(skipImageProcessing) q.set("skipImageProcessing", "true"); const qs = q.toString() ? "?" + q.toString() : ""; 
  const res = await fetch(`/api/pageRows/${encodeURIComponent(pageName)}/append${qs}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows }),
  });
  try { const data = await res.clone().json(); if (data.success && Number.isInteger(data.rowsVersion)) { setPageVersion(pageName, data.rowsVersion); } } catch(e) {}
  return res;
}
export async function bulkPatchRows(pageName: string, body: any, skipImageProcessing = false) {
  const q = new URLSearchParams(); if(skipImageProcessing) q.set("skipImageProcessing", "true"); const qs = q.toString() ? "?" + q.toString() : ""; 
  const res = await fetch(`/api/pageRows/${encodeURIComponent(pageName)}/bulk${qs}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  try { const data = await res.clone().json(); if (data.success && Number.isInteger(data.rowsVersion)) { setPageVersion(pageName, data.rowsVersion); } } catch(e) {}
  return res;
}
