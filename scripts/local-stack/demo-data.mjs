// Datos de DEMOSTRACIÓN para el stack LOCAL (capturas y presentaciones).
// Clientas, citas y ventas FICTICIAS; teléfonos 999 000 xxxx (no asignados). Nunca apuntar a un proyecto real.
// Se crean con las mismas funciones de la app (create_appointment, pos_checkout, …) para que todo sea coherente.
// Uso: node scripts/local-stack/demo-data.mjs   (después de scripts/local-stack/start.sh)
import { createRequire } from "node:module";

const require = createRequire(new URL("../../e2e/package.json", import.meta.url));
const pg = require("pg");

const DB = process.env.PALACE_LOCAL_DB ?? "palace_local";
if (!/local|demo/.test(DB)) throw new Error(`BD no permitida: ${DB}`);
const pool = new pg.Pool({ host: process.env.PGHOST ?? "/tmp", port: Number(process.env.PGPORT ?? 54329), user: "postgres", database: DB });
const q = async (sql, args = []) => (await pool.query(sql, args)).rows;

const LOC = "00000000-0000-4000-8000-000000000001";
const SVC = {
  valoracion: "00000000-0000-4000-8000-000000000301",
  instalacion: "00000000-0000-4000-8000-000000000302",
  mantenimiento: "00000000-0000-4000-8000-000000000303",
  lavado: "00000000-0000-4000-8000-000000000304",
};
const VAR = { tono4: "00000000-0000-4000-8000-000000000411", tono613: "00000000-0000-4000-8000-000000000412", cinta: "00000000-0000-4000-8000-000000000421" };

/** Ejecuta fn como una persona del personal (igual que PostgREST: rol authenticated + claims). */
async function as(userId, fn) {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await c.query("set local role authenticated");
    const out = await fn(async (sql, args = []) => (await c.query(sql, args)).rows);
    await c.query("commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

const people = Object.fromEntries(
  (await q(`select m.id, m.user_id, m.role::text, m.display_name from staff_members m`)).map((p) => [p.display_name, p]),
);
const owner = Object.values(people).find((p) => p.role === "owner");
const ana = people["Ana López"];
const bea = people["Bea Torres"];
if (!owner || !ana || !bea) throw new Error("Primero corre scripts/local-stack/start.sh (personal de desarrollo).");
const res = Object.fromEntries((await q(`select id, name from resources`)).map((r) => [r.name, r.id]));

const [{ today, nowmin }] = await q(
  `select (now() at time zone 'America/Mexico_City')::date::text today,
          extract(hour from now() at time zone 'America/Mexico_City')::int * 60 + extract(minute from now() at time zone 'America/Mexico_City')::int nowmin`,
);
const addDays = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const weekday = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const nextWorkday = (d, n = 1) => {
  let x = addDays(d, n);
  while (weekday(x) === 0) x = addDays(x, 1);
  return x;
};
const at = (d, hhmm) => `${d}T${hhmm}:00-06:00`; // México sin horario de verano
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// --- Negocio y ubicación (datos públicos del salón) -------------------------------------------
await q(`update business_settings set display_name = 'Palace Hair Extensions', facebook_url = 'https://www.facebook.com/alpalaciodelasextensiones/' where id = 1`);
await q(
  `update locations set name = 'Sucursal Mérida', address = 'C. 41 327-42 y 48, Francisco de Montejo III, 97203 Mérida, Yuc.',
          maps_url = 'https://share.google/6v10OOjRqtZk2kvqW', map_query = 'El Palacio de las Extensiones, Mérida, Yucatán' where id = $1`,
  [LOC],
);
await q(`delete from clients where last_name in ('Demo Uno', 'Demo Dos')`); // las de la semilla no se ven bien en una demo
await q(`notify pgrst, 'reload schema'`);

// --- Clientas (ficticias) ---------------------------------------------------------------------
const CLIENTS = [
  ["Fernanda", "Cab", "Castaño 4", 55, "instagram", "Prefiere ondas suaves; cuero cabelludo sensible al calor."],
  ["Regina", "Peón", "Rubio 613", 50, "whatsapp", "Retoque cada 6 semanas. Le gusta el acabado lacio."],
  ["Sofía", "Mena", "Castaño 6", null, "facebook", null],
  ["Valeria", "Díaz", "Castaño 4", 60, "referido", "Viene con su hermana; agendar juntas cuando se pueda."],
  ["Daniela", "Ruz", "Negro 1B", 55, "instagram", null],
  ["Ana", "Castillo", "Castaño 5", null, "tiktok", null],
  ["Paola", "Herrera", "Rubio 613", 55, "instagram", "Quiere más volumen en la coronilla."],
  ["Mariel", "Canul", "Castaño 4", 45, "whatsapp", null],
  ["Andrea", "Pech", "Negro 1B", null, "walk_in", null],
  ["Lucía", "Couoh", "Rubio 8", 50, "facebook", null],
];
const clientIds = {};
await as(owner.user_id, async (x) => {
  for (const [i, [first, last, tone, length, channel, prefs]] of CLIENTS.entries()) {
    const [{ id }] = await x(`select public.create_client_with_consents($1::jsonb) id`, [
      JSON.stringify({
        first_name: first,
        last_name: last,
        phone: `+52999000${String(101 + i).padStart(4, "0")}`,
        hair_tone: tone,
        extension_technique: length ? "cinta" : null,
        extension_length_cm: length,
        acquisition_channel: channel,
        consents: { privacy_notice: true, appointment_reminders: true, marketing_whatsapp: i % 2 === 0 },
      }),
    ]);
    clientIds[`${first} ${last}`] = id;
    if (prefs) await x(`update clients set style_preferences = $2 where id = $1`, [id, prefs]);
  }
});

// Entrada de mercancía (compra) para que alcance lo que reservan las citas y lo que se vende.
await as(owner.user_id, (x) =>
  x(`select public.record_stock_movement($1, $2, 'purchase'::public.movement_type, 24, 'Compra a proveedor', 8000)`, [VAR.cinta, LOC]),
);
await as(owner.user_id, (x) =>
  x(`select public.record_stock_movement($1, $2, 'purchase'::public.movement_type, 4, 'Compra a proveedor', 70000)`, [VAR.tono4, LOC]),
);

// --- Citas --------------------------------------------------------------------------------------
async function book(who, client, items, opts = {}) {
  return as(who.user_id, async (x) => {
    const [{ id }] = await x(`select public.create_appointment($1, $2, $3::jsonb, $4, $5, null, true, $6) id`, [
      LOC,
      clientIds[client],
      JSON.stringify(items),
      opts.hold ?? null,
      opts.source ?? "reception",
      opts.notes ?? null,
    ]);
    return id;
  });
}
const item = (svc, staff, resource, d, time, materials = []) => ({
  service_id: SVC[svc],
  staff_id: staff.id,
  resource_ids: [res[resource]],
  starts_at: at(d, time),
  materials,
});
const attend = (id, ...states) => as(owner.user_id, async (x) => {
  for (const s of states) await x(`select public.set_attendance($1, $2::public.attendance_status)`, [id, s]);
});
const complete = (id) => as(owner.user_id, (x) => x(`select public.complete_appointment($1)`, [id]));

// Hoy: mañana terminada, una en servicio, una que no asistió y lo que falta del día.
const t = {};
t.fer = await book(owner, "Fernanda Cab", [item("instalacion", ana, "Estación 1", today, "10:30", [{ variant_id: VAR.tono4, quantity: 2 }])]);
t.reg = await book(owner, "Regina Peón", [item("mantenimiento", bea, "Estación 2", today, "10:30")]);
t.sof = await book(owner, "Sofía Mena", [item("lavado", bea, "Lavacabezas 1", today, "12:30")]);
t.val = await book(owner, "Valeria Díaz", [item("mantenimiento", ana, "Estación 1", today, "14:00")], { notes: "Trae fotos de referencia." });
const inServiceStart = Math.min(Math.max(nowmin - 40, 15 * 60), 17 * 60);
t.dan = await book(owner, "Daniela Ruz", [item("mantenimiento", bea, "Estación 2", today, hhmm(Math.floor(inServiceStart / 15) * 15))]);
const upcoming = Math.ceil((nowmin + 30) / 15) * 15;
if (upcoming <= 18 * 60 + 15) {
  t.anaC = await book(owner, "Ana Castillo", [item("valoracion", ana, "Estación 3", today, hhmm(upcoming))]);
  if (upcoming + 30 <= 18 * 60 + 15) t.and = await book(owner, "Andrea Pech", [item("lavado", ana, "Lavacabezas 1", today, hhmm(upcoming + 45))], { hold: 120 });
}
await attend(t.fer, "arrived", "in_service");
await complete(t.fer);
await attend(t.reg, "arrived", "in_service");
await complete(t.reg);
await attend(t.val, "arrived", "in_service");
await complete(t.val);
await attend(t.sof, "no_show");
await attend(t.dan, "arrived", "in_service");

// Próximos días hábiles.
const d1 = nextWorkday(today);
const d2 = nextWorkday(d1);
await book(owner, "Paola Herrera", [item("instalacion", ana, "Estación 1", d1, "10:30", [{ variant_id: VAR.tono613, quantity: 1 }])]);
await book(owner, "Mariel Canul", [item("mantenimiento", bea, "Estación 2", d1, "10:30")]);
await book(owner, "Lucía Couoh", [item("lavado", bea, "Lavacabezas 1", d1, "12:30")]);
await book(owner, "Fernanda Cab", [item("valoracion", ana, "Estación 3", d1, "14:00")], { source: "online" });
await book(owner, "Regina Peón", [item("mantenimiento", bea, "Estación 2", d1, "15:00")], { hold: 600 });
await book(owner, "Valeria Díaz", [item("lavado", ana, "Lavacabezas 1", d1, "17:00")]);
await book(owner, "Daniela Ruz", [item("mantenimiento", ana, "Estación 1", d2, "11:00")]);
await book(owner, "Andrea Pech", [item("valoracion", bea, "Estación 3", d2, "12:00")], { source: "online" });
await book(owner, "Sofía Mena", [item("instalacion", bea, "Estación 2", d2, "13:00", [{ variant_id: VAR.tono4, quantity: 2 }])]);

// Bloqueo, ausencia pendiente y lista de espera.
await as(owner.user_id, async (x) => {
  await x(`select public.block_time($1, $2, 'Mantenimiento de la estación', null, $3)`, [at(d1, "17:30"), at(d1, "19:00"), res["Estación 3"]]);
  await x(`select public.request_time_off('vacation', $1, $2, 'Vacaciones', $3)`, [at(addDays(today, 21), "10:00"), at(addDays(today, 23), "19:00"), bea.id]);
  await x(
    `insert into waitlist_entries (client_id, service_id, preferred_staff_id, desired_from, desired_to, notes)
     values ($1, $2, $3, $4, $5, 'Prefiere sábado por la mañana'), ($6, $7, null, $4, $8, null)`,
    [clientIds["Lucía Couoh"], SVC.instalacion, ana.id, today, addDays(today, 10), clientIds["Mariel Canul"], SVC.mantenimiento, addDays(today, 14)],
  );
  await x(`insert into client_notes (client_id, body, author_staff_id) values ($1, 'Le encantó el resultado; pidió fotos para sus redes.', $2)`, [
    clientIds["Fernanda Cab"],
    owner.id,
  ]);
});

// --- Caja y ventas de hoy ----------------------------------------------------------------------
const lineOf = async (appt) => (await q(`select id, service_id, staff_id from appointment_services where appointment_id = $1`, [appt]))[0];
await as(owner.user_id, async (x) => {
  const [{ id: session }] = await x(`select public.open_cash_session($1, $2, $3::jsonb) id`, [LOC, 150000, null]).catch(async () =>
    x(`select public.open_cash_session($1, $2) id`, [LOC, 150000]),
  );
  const sale = async (key, body) => x(`select public.pos_checkout($1::jsonb) r`, [JSON.stringify({ location_id: LOC, cash_session_id: session, idempotency_key: key, coupon_code: null, allow_balance: false, ...body })]);
  const svcLine = async (appt, price) => {
    const l = await lineOf(appt);
    return { kind: "service", service_id: l.service_id, appointment_service_id: l.id, staff_id: l.staff_id, quantity: 1, unit_price_cents: price, discount_cents: 0 };
  };
  await sale("demo-1", {
    client_id: clientIds["Fernanda Cab"],
    appointment_id: t.fer,
    lines: [await svcLine(t.fer, 480000), { kind: "product", variant_id: VAR.cinta, quantity: 1, discount_cents: 0 }],
    payments: [
      { method: "card", amount_cents: 300000, tip_cents: 0, provider: "terminal", provider_ref: "A1029" },
      { method: "cash", amount_cents: 205000, tip_cents: 20000, tip_staff_id: ana.id },
    ],
  });
  await sale("demo-2", {
    client_id: clientIds["Regina Peón"],
    appointment_id: t.reg,
    lines: [await svcLine(t.reg, 120000)],
    payments: [{ method: "transfer", amount_cents: 120000, tip_cents: 0, provider: "transfer", provider_ref: "SPEI 77431" }],
  });
  await sale("demo-3", {
    client_id: clientIds["Valeria Díaz"],
    appointment_id: t.val,
    lines: [await svcLine(t.val, 120000), { kind: "product", variant_id: VAR.cinta, quantity: 2, discount_cents: 0 }],
    payments: [{ method: "card", amount_cents: 170000, tip_cents: 10000, tip_staff_id: ana.id, provider: "terminal", provider_ref: "A1047" }],
  });
  await sale("demo-4", {
    client_id: null,
    lines: [{ kind: "product", variant_id: VAR.cinta, quantity: 1, discount_cents: 0 }],
    payments: [{ method: "cash", amount_cents: 25000, tip_cents: 0 }],
  });

  // Finanzas del mes y reglas de comisión.
  await x(
    `insert into expenses (location_id, expense_date, category, kind, amount_cents, description, payment_method) values
     ($1, $2, 'Insumos', 'variable', 120000, 'Productos de lavado y peinado', 'card'),
     ($1, $2, 'Marketing', 'variable', 80000, 'Anuncios en Instagram', 'card')`,
    [LOC, today],
  );
  await x(`insert into commission_rules (staff_id, rule, notes) values ($1, '{"kind":"percent_service","bps":1500}', '15% de servicios'), ($2, '{"kind":"percent_service","bps":1200}', '12% de servicios')`, [ana.id, bea.id]);

  // Orden de compra al proveedor.
  const [{ id: sup }] = await x(`insert into suppliers (name, contact_name, phone) values ('Distribuidora de Cabello del Sureste', 'Atención a salones', '+529990000900') returning id`);
  await x(`select public.create_purchase_order($1, $2, $3::date, 'Reabasto mensual', $4::jsonb)`, [
    sup,
    LOC,
    addDays(today, 5),
    JSON.stringify([
      { variant_id: VAR.tono613, qty: 4, unit_cost_cents: 75000 },
      { variant_id: VAR.cinta, qty: 6, unit_cost_cents: 8000 },
    ]),
  ]);
});

console.log(`Datos de demostración listos (${today}; próximos días ${d1} y ${d2}).`);
await pool.end();
