import fs from "node:fs";
import path from "node:path";
import { currentBrandHash } from "@/lib/brand";
import { seedDbPath } from "@/lib/brand/store";
import { getConfig } from "@/lib/config";
import { json } from "@/lib/http/sse";

/**
 * Sample briefs shipped with a brand folder (a `briefs/` folder next to the brand docs), offered
 * as one-click starters on the welcome screen. Brands without one simply show none.
 *
 * The repo's mock briefs (fixtures/mock-briefs: a vague brief, a trap brief, a reference brief)
 * are written for the sample brand, so they are offered only when that brand is loaded: the one
 * brand whose content hash has a shipped seed (works wherever the folder is mounted).
 */

function readBriefs(dir: string, mock: boolean) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /\.(md|txt)$/i.test(f))
    .sort()
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? /^\*\*Re:\*\*\s*(.+)$/m.exec(text)?.[1] ?? f.replace(/\.(md|txt)$/i, "");
      return { file: f, title: title.replace(/^Campaign brief:\s*/i, "").replace(/^Brief:\s*/i, ""), text, mock };
    });
}

export async function GET() {
  const { brandDir, rootDir } = getConfig();
  const sample = fs.existsSync(seedDbPath(currentBrandHash()));
  return json([...readBriefs(path.join(brandDir, "briefs"), false), ...(sample ? readBriefs(path.join(rootDir, "fixtures", "mock-briefs"), true) : [])]);
}
