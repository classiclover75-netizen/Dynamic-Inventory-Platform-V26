export const dateRegex = /(\d+)\s*(?:-)?\s*(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{4})/i;

export const parseBusinessDate = (columnName: string): Date | null => {
  const m = columnName.match(dateRegex);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const monthStr = m[2];
  const year = parseInt(m[3], 10);
  
  // Create a date. The Date constructor can parse "Day Month Year" string nicely.
  const dateStr = `${day} ${monthStr} ${year}`;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d;
};

export const getLatestBusinessDate = (saleColumns: { key: string; name: string }[]): Date | null => {
  let latest: Date | null = null;
  for (const col of saleColumns) {
    const d = parseBusinessDate(col.name);
    if (d) {
      if (!latest || d.getTime() > latest.getTime()) {
        latest = d;
      }
    }
  }
  return latest;
};

export const getColumnsInDateRange = (
  saleColumns: { key: string; name: string }[], 
  startDate: Date, 
  endDate: Date
) => {
  const startObj = new Date(startDate);
  startObj.setHours(0, 0, 0, 0);
  const endObj = new Date(endDate);
  endObj.setHours(23, 59, 59, 999);
  
  return saleColumns.filter(col => {
    const d = parseBusinessDate(col.name);
    if (!d) return false;
    return d.getTime() >= startObj.getTime() && d.getTime() <= endObj.getTime();
  });
};

export const groupColumnsByMonth = (saleColumns: { key: string; name: string }[]) => {
  const monthsMap = new Map<string, typeof saleColumns>();
  
  for (const col of saleColumns) {
    const d = parseBusinessDate(col.name);
    if (d) {
      const monthName = d.toLocaleString('en-US', { month: 'long' });
      const year = d.getFullYear();
      const key = `${monthName}-${year}`;
      
      if (!monthsMap.has(key)) {
        monthsMap.set(key, []);
      }
      monthsMap.get(key)!.push(col);
    }
  }
  
  // Convert to array and sort by latest month first
  const result = Array.from(monthsMap.entries()).map(([label, cols]) => {
    // get a representative date for sorting
    const d = parseBusinessDate(cols[0].name)!;
    return {
      label,
      columns: cols,
      sortValue: d.getFullYear() * 100 + d.getMonth()
    };
  });
  
  result.sort((a, b) => b.sortValue - a.sortValue);
  
  return result.map(r => ({ label: r.label, columns: r.columns }));
};
