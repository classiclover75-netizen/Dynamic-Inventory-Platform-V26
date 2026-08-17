import { PageConfig } from '../types';

export function getPartnerPageNames(
  pageName: string,
  pageConfig: PageConfig | null | undefined,
  allPageConfigs: Record<string, PageConfig>
): string[] {
  const partners = new Set<string>();

  if (pageConfig?.linkedSourcePage && typeof pageConfig.linkedSourcePage === 'string' && pageConfig.linkedSourcePage.trim() !== '') {
    partners.add(pageConfig.linkedSourcePage);
  }

  for (const [otherName, otherConfig] of Object.entries(allPageConfigs)) {
    if (otherConfig?.linkedSourcePage === pageName) {
      partners.add(otherName);
    }
  }

  return Array.from(partners);
}
