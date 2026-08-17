export interface MultiSourceItem {
  source: string;
  qty: string | number;
  color?: string;
  retired?: boolean;
  retiredAt?: number;
}

export const isRetired = (source: MultiSourceItem): boolean => {
  return source.retired === true;
};

export const setRetired = (source: MultiSourceItem, retired: boolean): MultiSourceItem => {
  if (retired) {
    return { ...source, retired: true, retiredAt: Date.now() };
  }
  const { retiredAt, ...rest } = source;
  return { ...rest, retired: false };
};

export const splitActiveRetired = (sources: MultiSourceItem[]) => {
  const active: MultiSourceItem[] = [];
  const retired: MultiSourceItem[] = [];
  
  for (const s of sources) {
    if (isRetired(s)) {
      retired.push(s);
    } else {
      active.push(s);
    }
  }
  
  return { active, retired };
};

export const sumActive = (sources: MultiSourceItem[]): number => {
  return sources.reduce((sum, s) => {
    if (isRetired(s)) return sum;
    return sum + (parseFloat(String(s.qty)) || 0);
  }, 0);
};
