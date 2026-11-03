import fs from "node:fs";
import path from "node:path";
import { getConfig } from "@/lib/config";
import { json } from "@/lib/http/sse";

/**
 * Sample briefs shipped with a brand folder (a `briefs/` folder next to the brand docs), offered
 * as one-click starters on the welcome screen. Brands without one simply show none.
 */
export async function GET() {
  const dir = path.join(getConfig().brandDir, "briefs");
  if (!fs.existsSync(dir)) return json([]);
  const briefs = fs
    .readdirSync(dir)
    .filter((f) => /\.(md|txt)$/i.test(f))
    .sort()
    .map((f) => {
      const text = fs.readFileSync(path.join(dir, f), "utf8");
      const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? /^\*\*Re:\*\*\s*(.+)$/m.exec(text)?.[1] ?? f.replace(/\.(md|txt)$/i, "");
      return { file: f, title: title.replace(/^Campaign brief:\s*/i, "").replace(/^Brief:\s*/i, ""), text };
    });
  return json(briefs);
}
