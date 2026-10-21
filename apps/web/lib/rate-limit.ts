import "server-only";

/**
 * Límite de peticiones EN MEMORIA por llave (p. ej. IP), ventana deslizante.
 *
 * ⚠️ Solo protege una instancia del servidor y se reinicia con cada despliegue. En producción
 * (varias instancias/serverless) se necesita un almacén compartido (p. ej. Upstash Redis o una
 * tabla con TTL) y, ante abuso real, una verificación anti-bots (Cloudflare Turnstile/hCaptcha).
 */
const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

export function rateLimit(key: string, opts: { max: number; windowMs: number }): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  if (now - lastSweep > opts.windowMs) {
    for (const [k, list] of buckets) {
      const fresh = list.filter((t) => now - t < opts.windowMs);
      if (fresh.length) buckets.set(k, fresh);
      else buckets.delete(k);
    }
    lastSweep = now;
  }
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < opts.windowMs);
  if (hits.length >= opts.max) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.ceil((opts.windowMs - (now - hits[0]!)) / 1000) };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { ok: true, retryAfterSec: 0 };
}

/** IP de la clienta según los encabezados del proxy (Vercel/Cloudflare los fijan). */
export function clientIp(h: Headers): string {
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || h.get("cf-connecting-ip") || "desconocida";
}
