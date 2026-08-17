import { PageConfig, RowData } from "../types";

export function findLinkedTrackers(
  sourcePageName: string,
  pageConfigs: Record<string, PageConfig | undefined>
): string[] {
  if (!pageConfigs || typeof pageConfigs !== "object") return [];
  const sourceTrimmed = sourcePageName.trim();
  const trackers: string[] = [];
  
  for (const [name, config] of Object.entries(pageConfigs)) {
    if (config && config.linkedSourcePage && typeof config.linkedSourcePage === 'string' && config.linkedSourcePage.trim() === sourceTrimmed && name !== sourcePageName) {
      trackers.push(name);
    }
  }
  return trackers;
}

export function buildTrackerOrder(
  sourceRows: RowData[],
  trackerRows: RowData[]
): string[] {
  if (!Array.isArray(sourceRows) || !Array.isArray(trackerRows)) return [];

  const trackerIds = new Set<string>();
  for (const row of trackerRows) {
    if (row && row.id) {
      trackerIds.add(String(row.id));
    }
  }

  const result: string[] = [];
  const added = new Set<string>();

  for (const row of sourceRows) {
    if (row && row.id) {
      const idStr = String(row.id);
      if (trackerIds.has(idStr) && !added.has(idStr)) {
        result.push(idStr);
        added.add(idStr);
      }
    }
  }

  for (const row of trackerRows) {
    if (row && row.id) {
      const idStr = String(row.id);
      if (!added.has(idStr)) {
        result.push(idStr);
        added.add(idStr);
      }
    }
  }

  return result;
}

export function findAllLinkedTrackers(
  sourcePageName: string,
  pageConfigs: Record<string, PageConfig | undefined>,
  pageLinks?: Record<string, string>
): string[] {
  const trackers = findLinkedTrackers(sourcePageName, pageConfigs);
  if (pageLinks && typeof pageLinks === 'object') {
    const sourceTrimmed = sourcePageName.trim();
    for (const [name, link] of Object.entries(pageLinks)) {
      if (typeof link === 'string' && link.trim() === sourceTrimmed && name !== sourcePageName) {
        if (!trackers.includes(name)) {
          trackers.push(name);
        }
      }
    }
  }
  return trackers;
}
