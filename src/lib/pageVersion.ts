const versionMap = new Map<string, number>();

export function setPageVersion(pageName: string, value: number): void {
  if (typeof pageName === 'string' && pageName.length > 0 && Number.isInteger(value)) {
    versionMap.set(pageName, value);
  }
}

export function getPageVersion(pageName: string): number | undefined {
  return versionMap.get(pageName);
}

export function clearPageVersion(pageName: string): void {
  versionMap.delete(pageName);
}
