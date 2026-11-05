import { getJSON, sendJSON } from "./api";

export interface BrandOption {
  dir: string;
  name: string;
  lastUsed: string;
  active: boolean;
}

export interface BrandList {
  current: { dir: string; name: string; ready: boolean };
  options: BrandOption[];
}

export const listBrands = () => getJSON<BrandList>("/api/brands");

/**
 * Switch brand, then load the app fresh: campaigns, memory and previews all belong to the
 * brand, so a full page load (not a client-side route change) is what's wanted here.
 */
export async function switchBrand(dir: string) {
  await sendJSON("/api/brands", "POST", { dir });
  window.location.href = new URL("/app", window.location.origin).href;
}
