export function getCreationTooltip(source: any): string {
  if (!source || !source.createdAt) {
    return "Creation date not recorded";
  }
  const date = new Date(source.createdAt);
  if (isNaN(date.getTime())) {
    return "Creation date not recorded";
  }
  const day = date.getDate();
  const month = date.toLocaleString('en-GB', { month: 'short' });
  const year = date.getFullYear();
  const time = date.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `Created: ${day} ${month} ${year}, ${time}`;
}
