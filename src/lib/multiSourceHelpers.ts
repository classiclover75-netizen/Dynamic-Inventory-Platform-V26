export const formatSourceNumber = (index: number) => {
  return String(index + 1).padStart(2, '0');
};

export const reorderSources = (list: any[], startIndex: number, endIndex: number) => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};
