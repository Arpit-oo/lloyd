import { networkInterfaces } from "node:os";
import { json } from "@/lib/http/sse";

/**
 * Addresses a coworker on the same network can open this app at. Lloyd runs on one machine;
 * sharing a chat means sharing this machine's address plus the campaign id.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const port = url.port || "3000";
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n): n is NonNullable<typeof n> => !!n && n.family === "IPv4" && !n.internal)
    .map((n) => `${url.protocol}//${n.address}:${port}`);
  return json({ local: `${url.protocol}//localhost:${port}`, lan });
}
