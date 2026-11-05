import fs from "node:fs";
import path from "node:path";
import { activeRunCount } from "@/lib/agent/runs";
import { brandNameTaken, rememberBrand, uploadedBrandsDir } from "@/lib/brand/active";
import { getConfig } from "@/lib/config";
import { json } from "@/lib/http/sse";

const MAX_TOTAL = 300 * 1024 * 1024;
const SKIP = /(^|\/)(\.git|node_modules|\.DS_Store|Thumbs\.db|desktop\.ini)(\/|$)/i;

/**
 * Add a new brand from the browser: multipart with `name` and the folder's files, each paired
 * with its path inside the folder (`paths`, same order). Files are saved to data/brand-folders/<name>/
 * keeping their sub-folders (images/, briefs/ ...). The client then switches to it with POST /api/brands.
 */
export async function POST(req: Request) {
  if (activeRunCount() > 0) return json({ error: "Lloyd is working on a campaign. Wait for it to finish (or stop it) before adding a brand." }, 409);
  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim();
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  const paths = form.getAll("paths").map(String);
  if (!files.length) return json({ error: "Choose the brand's folder (or its files) first." }, 400);
  if (!name) return json({ error: "Give the brand a name." }, 400);
  // Brand names are unique, so the brand menu never shows two brands that look the same.
  const clash = brandNameTaken(getConfig().dataDir, name);
  if (clash) return json({ error: `There is already a brand called "${clash}". Pick another name, or switch to that brand instead.` }, 409);

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "brand";
  const root = uploadedBrandsDir(getConfig().dataDir);
  let dir = path.join(root, slug);
  for (let n = 2; fs.existsSync(dir); n++) dir = path.join(root, `${slug}-${n}`);

  const total = files.reduce((s, f) => s + f.size, 0);
  if (total > MAX_TOTAL) return json({ error: `That folder is ${Math.round(total / 1048576)} MB; the limit is ${MAX_TOTAL / 1048576} MB.` }, 413);

  // A picked folder arrives as "Folder/sub/file.md": drop the shared top folder so files land in dir.
  const rel = files.map((f, i) => (paths[i] || f.name).replace(/\\/g, "/").replace(/^\/+/, ""));
  const tops = new Set(rel.map((r) => (r.includes("/") ? r.split("/")[0] : "")));
  const strip = tops.size === 1 && !tops.has("") ? [...tops][0].length + 1 : 0;

  let saved = 0;
  for (let i = 0; i < files.length; i++) {
    const r = rel[i].slice(strip);
    if (!r || SKIP.test(r)) continue;
    const target = path.resolve(dir, r);
    // Never write outside the new brand folder.
    if (!target.startsWith(path.resolve(dir) + path.sep)) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(await files[i].arrayBuffer()));
    saved++;
  }
  if (!saved) return json({ error: "None of those files could be saved." }, 400);
  // Keep the name as typed ("Acme Robotics", not "acme-robotics") for the brand menu.
  rememberBrand(getConfig().dataDir, dir, name, false);
  return json({ ok: true, dir, saved });
}
