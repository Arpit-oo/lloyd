import path from "node:path";

// config.ts reads the active brand, and config.ts is reachable from client code (the model
// catalog), so node:fs is loaded lazily on the server instead of imported at the top.
const fs = () => process.getBuiltinModule("node:fs") as typeof import("node:fs");

/**
 * Which brand folder the app works on. BRAND_DIR in .env is the default; switching brand in
 * the app saves the choice (and a short history) in the data directory, so it survives
 * restarts without editing .env. Evals use their own data directory and are not affected.
 */
export interface KnownBrand {
  dir: string;
  name: string;
  lastUsed: string;
}

interface State {
  active: string | null;
  known: KnownBrand[];
}

const file = (dataDir: string) => path.join(dataDir, "brands.json");

export function readBrandState(dataDir: string): State {
  try {
    const s = JSON.parse(fs().readFileSync(file(dataDir), "utf8")) as Partial<State>;
    return { active: s.active ?? null, known: s.known ?? [] };
  } catch {
    return { active: null, known: [] };
  }
}

export function writeBrandState(dataDir: string, state: State) {
  fs().mkdirSync(dataDir, { recursive: true });
  fs().writeFileSync(file(dataDir), JSON.stringify(state, null, 2));
}

/** The brand folder chosen in the app, if it still exists. */
export function activeBrandOverride(dataDir: string): string | null {
  const dir = readBrandState(dataDir).active;
  return dir && fs().existsSync(dir) ? dir : null;
}

/** The name a brand was saved under (typed when it was added), if any. */
export function knownBrandName(dataDir: string, dir: string): string | null {
  return readBrandState(dataDir).known.find((k) => path.resolve(k.dir) === path.resolve(dir))?.name.trim() || null;
}

/**
 * Records a brand as used (newest first), optionally making it the active one. An empty name
 * keeps the name it already has (or falls back to the folder's name).
 */
export function rememberBrand(dataDir: string, dir: string, name: string, makeActive: boolean) {
  const s = readBrandState(dataDir);
  const label = name.trim() || knownBrandName(dataDir, dir) || path.basename(dir);
  const known = [{ dir, name: label, lastUsed: new Date().toISOString() }, ...s.known.filter((k) => path.resolve(k.dir) !== path.resolve(dir))].slice(0, 12);
  writeBrandState(dataDir, { active: makeActive ? dir : s.active, known });
}

/** Brand folders added from the browser (Brand → Switch brand → Add a new brand). */
export const uploadedBrandsDir = (dataDir: string) => path.join(dataDir, "brand-folders");

/** Every brand folder added from the browser, newest first. */
export function uploadedBrands(dataDir: string): { dir: string; name: string; lastUsed: string }[] {
  const root = uploadedBrandsDir(dataDir);
  try {
    return fs()
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ dir: path.join(root, d.name), name: d.name, lastUsed: fs().statSync(path.join(root, d.name)).mtime.toISOString() }))
      .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed));
  } catch {
    return [];
  }
}
