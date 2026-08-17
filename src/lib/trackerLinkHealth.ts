import { PageConfig, RowData } from "../types";

export type TrackerLinkStatus = 'healthy' | 'out_of_sync' | 'broken' | 'not_a_tracker' | 'loading';

export interface TrackerLinkHealth {
  status: TrackerLinkStatus;
  sourcePageName: string | null;
  sourcePageExists: boolean;
  sourceRowCount: number;
  trackerRowCount: number;
  matchedRowCount: number;
  missingInTrackerCount: number;
  ghostRowCount: number;
  issues: string[];
}

export function checkTrackerLinkHealth(
  pageName: string,
  pageConfigs: Record<string, PageConfig | undefined>,
  pageRows: Record<string, RowData[] | undefined>,
  pageNames?: string[]
): TrackerLinkHealth {
  const result: TrackerLinkHealth = {
    status: 'not_a_tracker',
    sourcePageName: null,
    sourcePageExists: false,
    sourceRowCount: 0,
    trackerRowCount: 0,
    matchedRowCount: 0,
    missingInTrackerCount: 0,
    ghostRowCount: 0,
    issues: [],
  };

  const validPageNames = Array.isArray(pageNames) ? pageNames : [];

  try {
    const config = pageConfigs?.[pageName];
    if (!config) return result;

    const hasLinkedSourcePage = typeof config.linkedSourcePage === 'string' && config.linkedSourcePage.trim() !== '';

    if (!config.isTrackerPage && !hasLinkedSourcePage) {
      return result;
    }

    if (config.isTrackerPage && !hasLinkedSourcePage) {
      result.status = 'broken';
      result.issues.push("This tracker has no linked source page.");
      return result;
    }

    const sourcePageName = config.linkedSourcePage?.trim() || "";
    result.sourcePageName = sourcePageName;

    if (!validPageNames.includes(sourcePageName)) {
      result.status = 'broken';
      result.sourcePageExists = false;
      result.issues.push(`Source page "${sourcePageName}" could not be found.`);
      return result;
    }

    if (!pageConfigs[sourcePageName]) {
      result.status = 'loading';
      result.sourcePageExists = true;
      return result;
    }

    if (pageRows[sourcePageName] === undefined) {
      result.status = 'loading';
      result.sourcePageExists = true;
      return result;
    }

    if (pageRows[pageName] === undefined) {
      result.status = 'loading';
      result.sourcePageExists = true;
      return result;
    }

    const sourceConfig = pageConfigs[sourcePageName];
    if (!sourceConfig) {
      result.status = 'broken';
      result.sourcePageExists = false;
      result.issues.push(`Source page "${sourcePageName}" could not be found.`);
      return result;
    }

    result.sourcePageExists = true;

    if (sourcePageName === pageName) {
      result.status = 'broken';
      result.issues.push("Tracker is linked to itself.");
      return result;
    }

    if (typeof sourceConfig.linkedSourcePage === 'string' && sourceConfig.linkedSourcePage.trim() !== '') {
      result.status = 'broken';
      result.issues.push("Source page is itself a tracker, which creates an invalid link chain.");
      return result;
    }

    const sourceRowsArray = pageRows?.[sourcePageName] || [];
    const trackerRowsArray = pageRows?.[pageName] || [];

    const sourceIds = new Set<string>();
    for (const row of sourceRowsArray) {
      if (row && typeof row === 'object' && row.id != null && String(row.id).trim() !== '') {
        sourceIds.add(String(row.id));
      }
    }

    const trackerIds = new Set<string>();
    for (const row of trackerRowsArray) {
      if (row && typeof row === 'object' && row.id != null && String(row.id).trim() !== '') {
        trackerIds.add(String(row.id));
      }
    }

    result.sourceRowCount = sourceIds.size;
    result.trackerRowCount = trackerIds.size;

    let matched = 0;
    let ghost = 0;

    for (const tid of trackerIds) {
      if (sourceIds.has(tid)) {
        matched++;
      } else {
        ghost++;
      }
    }

    let missing = 0;
    for (const sid of sourceIds) {
      if (!trackerIds.has(sid)) {
        missing++;
      }
    }

    result.matchedRowCount = matched;
    result.ghostRowCount = ghost;
    result.missingInTrackerCount = missing;

    if (ghost === 0 && missing === 0) {
      result.status = 'healthy';
    } else {
      result.status = 'out_of_sync';
      if (missing > 0) result.issues.push(`${missing} rows in source are missing from tracker.`);
      if (ghost > 0) result.issues.push(`${ghost} tracker rows do not exist in source.`);
    }

    return result;
  } catch (error: any) {
    result.status = 'broken';
    result.issues = [error?.message || "An unexpected error occurred during health check."];
    return result;
  }
}
