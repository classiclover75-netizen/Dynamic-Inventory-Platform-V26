import { PageConfig } from "../types";

/**
 * Renames all references to oldName in the given configurations object to newName.
 * Pure function: does not mutate the original configs.
 */
export function renamePageRefs(
  configs: Record<string, PageConfig>,
  oldName: string,
  newName: string
): Record<string, PageConfig> {
  const newConfigs: Record<string, PageConfig> = {};
  for (const [pageName, config] of Object.entries(configs)) {
    const updatedConfig = { ...config };
    let changed = false;

    if (updatedConfig.linkedSourcePage === oldName) {
      updatedConfig.linkedSourcePage = newName;
      changed = true;
    }
    
    if (updatedConfig.secondarySearchPage === oldName) {
      updatedConfig.secondarySearchPage = newName;
      changed = true;
    }

    newConfigs[pageName] = changed ? updatedConfig : config;
  }
  return newConfigs;
}

/**
 * Removes secondarySearchPage from configs if it references any of the deletedNames.
 * Pure function: does not mutate the original configs.
 */
export function cleanDeletedPageRefs(
  configs: Record<string, PageConfig>,
  deletedNames: string[]
): Record<string, PageConfig> {
  const newConfigs: Record<string, PageConfig> = {};
  const deletedSet = new Set(deletedNames);

  for (const [pageName, config] of Object.entries(configs)) {
    const updatedConfig = { ...config };
    let changed = false;

    if (updatedConfig.secondarySearchPage && deletedSet.has(updatedConfig.secondarySearchPage)) {
      delete updatedConfig.secondarySearchPage;
      changed = true;
    }

    newConfigs[pageName] = changed ? updatedConfig : config;
  }
  return newConfigs;
}
