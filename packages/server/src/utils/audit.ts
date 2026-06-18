import type { Context } from "hono";
import type { Env } from "../index";

/**
 * Emit a structured audit line for a privileged admin mutation.
 *
 * These lines are captured durably by the worker's observability logs
 * (persist + full sampling in wrangler.jsonc) and can be filtered in the
 * Cloudflare dashboard with `audit:true`. They record who did what to whom so
 * privilege changes — especially admin grants/revokes — are always traceable,
 * without needing a dedicated DB table/migration.
 */
export function audit(
  c: Context<Env>,
  action: string,
  details: Record<string, unknown> = {}
): void {
  // `auth` is always set here: resolveAuth runs before any admin route.
  const actor = c.get("auth").userId;
  console.log(
    JSON.stringify({
      audit: true,
      action,
      actor,
      at: new Date().toISOString(),
      ...details,
    })
  );
}
