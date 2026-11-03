import path from "node:path";
import { z } from "zod";

/**
 * Single place where environment variables are read and validated.
 * Everything else imports `config` instead of touching process.env.
 */
const EnvSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is missing. Copy .env.example to .env and fill it in."),
  FIRECRAWL_API_KEY: z.string().optional(),
  BRAND_DIR: z.string().default("./wickhold-candidate-package/candidate"),
  MAX_USD_PER_RUN: z.coerce.number().positive().default(5),
  LLM_CONCURRENCY: z.coerce.number().int().positive().default(4),
  /** Where app state and brand indexes live. Evals use a separate folder so they never touch your data. */
  DATA_DIR: z.string().default("./data"),
  // Optional per-tier model overrides, e.g. MODEL_WRITER=gpt-5.5
  MODEL_WRITER: z.string().optional(),
  MODEL_REASONER: z.string().optional(),
  MODEL_FAST: z.string().optional(),
  MODEL_BULK: z.string().optional(),
  MODEL_EMBED: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: (Env & { rootDir: string; brandDir: string; dataDir: string; logsDir: string }) | null = null;

export function getConfig() {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `- ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const rootDir = process.cwd();
  cached = {
    ...parsed.data,
    rootDir,
    brandDir: path.resolve(rootDir, parsed.data.BRAND_DIR),
    dataDir: path.resolve(rootDir, parsed.data.DATA_DIR),
    logsDir: path.resolve(rootDir, "logs"),
  };
  return cached;
}
