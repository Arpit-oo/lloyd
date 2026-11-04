import fs from "node:fs";
import path from "node:path";
import { activeRunCount } from "@/lib/agent/runs";
import { currentBrandHash, getBrand, resetBrandCache } from "@/lib/brand";
import { knownBrandName, readBrandState, rememberBrand, uploadedBrands } from "@/lib/brand/active";
import { scanBrand } from "@/lib/brand/scan";
import { getConfig, resetConfig } from "@/lib/config";
import { json } from "@/lib/http/sse";

/**
 * Brands the app can work on: the active one, the default from BRAND_DIR, brands used before,
 * and the repo's mini test brand. POST { dir } switches to a brand folder. Campaigns and memory
 * are stored per brand, so switching never mixes them; a folder that was never indexed opens
 * the indexing screen next.
 */
export async function GET() {
  const { brandDir, rootDir, dataDir, BRAND_DIR } = getConfig();
  const defaultBrandDir = path.resolve(rootDir, BRAND_DIR);
  const brand = getBrand();
  const current = { dir: brandDir, name: brand?.tokens?.brand_name?.trim() || knownBrandName(dataDir, brandDir) || path.basename(brandDir), ready: !!brand };
  if (brand) rememberBrand(dataDir, brandDir, current.name, false);
  const mini = path.join(rootDir, "fixtures", "mini-brand");
  const options = [
    ...readBrandState(dataDir).known.map((k) => ({ ...k, name: k.name.trim() || path.basename(k.dir) })),
    { dir: defaultBrandDir, name: path.basename(defaultBrandDir) === "candidate" ? "Sample brand (BRAND_DIR)" : path.basename(defaultBrandDir), lastUsed: "" },
    ...uploadedBrands(dataDir),
    ...(fs.existsSync(mini) ? [{ dir: mini, name: "Mini test brand (fixtures/mini-brand)", lastUsed: "" }] : []),
  ].filter((o, i, all) => fs.existsSync(o.dir) && all.findIndex((x) => path.resolve(x.dir) === path.resolve(o.dir)) === i);
  return json({ current, options: options.map((o) => ({ ...o, active: path.resolve(o.dir) === path.resolve(brandDir) })) });
}

export async function POST(req: Request) {
  const { dir } = (await req.json()) as { dir?: string };
  const { rootDir, dataDir } = getConfig();
  if (!dir?.trim()) return json({ error: "Give the path to a brand folder." }, 400);
  const target = path.resolve(rootDir, dir.trim());
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return json({ error: `No folder at ${target}` }, 400);
  if (activeRunCount() > 0) return json({ error: "Lloyd is working on a campaign. Wait for it to finish (or stop it) before switching brand." }, 409);
  const scan = scanBrand(target);
  if (!scan.docs.length && !scan.binaryDocs.length) return json({ error: `${target} has no documents Lloyd can read (Markdown, text, PDF, Word, PowerPoint).` }, 400);

  rememberBrand(dataDir, target, "", true);
  resetConfig();
  resetBrandCache();
  const ready = !!getBrand();
  if (ready) rememberBrand(dataDir, target, getBrand()!.tokens?.brand_name?.trim() || "", true);
  return json({ ok: true, dir: target, ready, hash: currentBrandHash(), docs: scan.docs.length + scan.binaryDocs.length });
}
