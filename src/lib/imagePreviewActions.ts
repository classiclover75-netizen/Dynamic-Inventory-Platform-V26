import { PageConfig } from "../types";

export function shouldDisableImagePreviewActions(
  previewContext: {
    rowId: string;
    imageKey: string;
    pageName: string;
    disableActions?: boolean;
  } | null,
  pageConfigs: Record<string, PageConfig>
): boolean {
  if (!previewContext) {
    return true;
  }
  if (previewContext.disableActions) {
    return true;
  }
  if (pageConfigs[previewContext.pageName]?.isTrackerPage) {
    return true;
  }
  return false;
}
