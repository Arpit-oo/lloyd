import { getConfig } from "@/lib/config";
import type { DesignTokens } from "./design-tokens";
import type { Governance } from "./governance";
import { scanBrand } from "./scan";
import { getMeta, openBrandDb, type BrandDB } from "./store";

/**
 * Runtime handle on the current brand: the index DB plus the compiled pieces every request needs.
 * The brand hash is computed once per process (scanning hashes every file, including images).
 */
export interface Brand {
  hash: string;
  db: BrandDB;
  kernel: string;
  governance: Governance;
  tokens: DesignTokens | null;
}

const g = globalThis as unknown as { __brandHash?: string };

export function currentBrandHash(): string {
  g.__brandHash ??= scanBrand(getConfig().brandDir).hash;
  return g.__brandHash;
}

/** Returns the ingested brand, or null if ingest has not finished for this brand folder. */
export function getBrand(): Brand | null {
  const hash = currentBrandHash();
  const bdb = openBrandDb(hash);
  if (!getMeta(bdb, "ingest:summary")) return null;
  return {
    hash,
    db: bdb,
    kernel: getMeta<string>(bdb, "kernel") ?? "",
    governance: getMeta<Governance>(bdb, "governance")!,
    tokens: getMeta<DesignTokens>(bdb, "design_tokens"),
  };
}

export function requireBrand(): Brand {
  const b = getBrand();
  if (!b) throw new Error("Brand not ingested yet. Run `npm run ingest` or open the app to start ingest.");
  return b;
}
