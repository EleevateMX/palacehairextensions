// Crea cuentas de personal FICTICIAS para desarrollo/E2E mediante la API de administración de Auth
// y las vincula a staff_members. Contraseña común de desarrollo (solo local).
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(process.argv[2], "utf8").trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2)));
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SECRET_KEY;
export const DEV_PASSWORD = "PalaceDev2026";
const LOCATION = "00000000-0000-4000-8000-000000000001";
const people = [
  { email: "propietaria@palace.local", name: "Mariana Ríos", role: "owner", bookable: false },
  { email: "recepcion@palace.local", name: "Regina Cab", role: "receptionist", bookable: false },
  { email: "ana@palace.local", name: "Ana López", role: "stylist", bookable: true },
  { email: "bea@palace.local", name: "Bea Torres", role: "stylist", bookable: true },
  { email: "almacen@palace.local", name: "Iván Pech", role: "inventory", bookable: false },
];
const h = { apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" };
for (const p of people) {
  const r = await fetch(`${url}/auth/v1/admin/users`, { method: "POST", headers: h, body: JSON.stringify({ email: p.email, password: DEV_PASSWORD, email_confirm: true }) });
  const u = await r.json();
  if (!r.ok) throw new Error(`Auth: ${JSON.stringify(u)}`);
  const s = await fetch(`${url}/rest/v1/staff_members`, {
    method: "POST",
    headers: { ...h, prefer: "return=representation" },
    body: JSON.stringify({ user_id: u.id, location_id: LOCATION, display_name: p.name, role: p.role, is_bookable: p.bookable }),
  });
  const [staff] = await s.json();
  if (!s.ok) throw new Error(`staff: ${JSON.stringify(staff)}`);
  if (p.bookable) {
    const days = [1, 2, 3, 4, 5, 6].map((d) => ({ staff_id: staff.id, location_id: LOCATION, weekday: d, starts_at: "10:00", ends_at: "19:00" }));
    await fetch(`${url}/rest/v1/staff_schedules`, { method: "POST", headers: h, body: JSON.stringify(days) });
    const services = await (await fetch(`${url}/rest/v1/services?select=id`, { headers: h })).json();
    await fetch(`${url}/rest/v1/staff_services`, { method: "POST", headers: h, body: JSON.stringify(services.map((x) => ({ staff_id: staff.id, service_id: x.id }))) });
  }
}
console.log(`Personal de desarrollo creado (${people.length}). Contraseña: ${DEV_PASSWORD}`);
