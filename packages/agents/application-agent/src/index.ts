/**
 * MVP placeholder — Phase 2 will add Playwright form automation.
 * Current behavior: open apply URL manually and mark application status in UI.
 */
export function openApplyUrl(applyUrl: string): { action: "open_url"; url: string } {
  return { action: "open_url", url: applyUrl };
}
