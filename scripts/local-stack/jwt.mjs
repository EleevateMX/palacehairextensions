// Genera JWT HS256 para el entorno LOCAL (nunca usar este secreto fuera de desarrollo).
import { createHmac } from "node:crypto";
const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
export function sign(payload, secret) {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64(payload);
  const s = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}
if (process.argv[2]) {
  const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 3600;
  console.log(sign({ iss: "palace-local", role: process.argv[2], exp }, process.argv[3]));
}
