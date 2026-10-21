import pg from "pg";

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

export const IDS = {
  location: "10000000-0000-0000-0000-000000000001",
  ownerUser: "20000000-0000-0000-0000-000000000001",
  receptionUser: "20000000-0000-0000-0000-000000000002",
  anaUser: "20000000-0000-0000-0000-000000000003",
  beaUser: "20000000-0000-0000-0000-000000000004",
  inventoryUser: "20000000-0000-0000-0000-000000000005",
  owner: "30000000-0000-0000-0000-000000000001",
  reception: "30000000-0000-0000-0000-000000000002",
  ana: "30000000-0000-0000-0000-000000000003",
  bea: "30000000-0000-0000-0000-000000000004",
  inventory: "30000000-0000-0000-0000-000000000005",
  carla: "30000000-0000-0000-0000-000000000006", // estilista no capacitada en instalación
  carlaUser: "20000000-0000-0000-0000-000000000006",
  install: "40000000-0000-0000-0000-000000000001",
  estacionType: "50000000-0000-0000-0000-000000000001",
  est1: "60000000-0000-0000-0000-000000000001",
  hairProduct: "70000000-0000-0000-0000-000000000001",
  hairVariant: "71000000-0000-0000-0000-000000000001",
  adhesiveProduct: "70000000-0000-0000-0000-000000000002",
  adhesiveVariant: "71000000-0000-0000-0000-000000000002",
  clientA: "80000000-0000-0000-0000-000000000001",
  clientB: "80000000-0000-0000-0000-000000000002",
};

// Sábado 5 de enero de 2030, hora de Ciudad de México (UTC−6).
export const DAY = "2030-01-05";
export const at = (hhmm: string) => `${DAY}T${hhmm}:00-06:00`;

/** Reinicia datos operativos y carga un catálogo mínimo. Se ejecuta como superusuario. */
export async function resetFixtures() {
  const c = await pool.connect();
  try {
    await c.query(`
      truncate public.audit_log, public.messages, public.conversations, public.webhook_events, public.ops_alerts,
        public.refunds, public.sale_payments, public.sale_lines, public.sales, public.cash_sessions, public.gift_cards, public.coupons,
        public.maintenance_reminders, public.appointment_deposits, public.appointment_allocations, public.appointment_services,
        public.appointments, public.stock_reservations, public.stock_levels, public.client_notes, public.client_photos,
        public.clients, public.service_materials, public.service_resource_requirements, public.service_cost_items, public.commission_rules, public.expenses, public.staff_services, public.services,
        public.resources, public.resource_types, public.product_variants, public.products, public.staff_time_off,
        public.staff_schedules, public.staff_members, public.business_hours, public.special_days, public.locations,
        public.stock_movements, public.client_consents, auth.users cascade;
    `);
    await c.query(
      `insert into public.locations (id, name) values ($1, 'Palace (desarrollo)');
       insert into public.business_settings (id) values (1) on conflict do nothing;
       insert into public.business_hours (location_id, weekday, opens_at, closes_at)
         select $1, d, '10:00', '19:00' from generate_series(0, 6) d;`.replace(/\$1/g, `'${IDS.location}'`),
    );
    const users: [string, string, string, string, boolean][] = [
      [IDS.ownerUser, IDS.owner, "Dueña", "owner", false],
      [IDS.receptionUser, IDS.reception, "Recepción", "receptionist", false],
      [IDS.anaUser, IDS.ana, "Ana", "stylist", true],
      [IDS.beaUser, IDS.bea, "Bea", "stylist", true],
      [IDS.inventoryUser, IDS.inventory, "Almacén", "inventory", false],
      [IDS.carlaUser, IDS.carla, "Carla", "stylist", true],
    ];
    for (const [uid, sid, name, role, bookable] of users) {
      await c.query(`insert into auth.users (id, email) values ($1, $2)`, [uid, `${role}-${sid.slice(-1)}@palace.test`]);
      await c.query(
        `insert into public.staff_members (id, user_id, location_id, display_name, role, is_bookable) values ($1,$2,$3,$4,$5,$6)`,
        [sid, uid, IDS.location, name, role, bookable],
      );
      if (bookable) {
        await c.query(
          `insert into public.staff_schedules (staff_id, location_id, weekday, starts_at, ends_at)
           select $1, $2, d, '10:00', '19:00' from generate_series(0, 6) d`,
          [sid, IDS.location],
        );
      }
    }
    await c.query(`insert into public.resource_types (id, code, name) values ($1, 'estacion', 'Estación')`, [IDS.estacionType]);
    await c.query(`insert into public.resources (id, resource_type_id, location_id, name) values ($1, $2, $3, 'Estación 1')`, [
      IDS.est1,
      IDS.estacionType,
      IDS.location,
    ]);
    await c.query(
      `insert into public.services (id, name, price_cents, duration_min, cleanup_min, deposit_type, deposit_value, online_bookable, maintenance_interval_days, technique)
       values ($1, 'Instalación de extensiones', 500000, 120, 20, 'fixed', 100000, true, 42, 'cinta')`,
      [IDS.install],
    );
    await c.query(`insert into public.staff_services (staff_id, service_id) values ($1, $3), ($2, $3)`, [IDS.ana, IDS.bea, IDS.install]);
    await c.query(`insert into public.service_resource_requirements (service_id, resource_type_id) values ($1, $2)`, [IDS.install, IDS.estacionType]);
    await c.query(
      `insert into public.products (id, name, kind, is_sellable_online) values ($1, 'Extensión cinta 55 cm', 'hair_extension', true), ($2, 'Adhesivo', 'supply', false)`,
      [IDS.hairProduct, IDS.adhesiveProduct],
    );
    await c.query(
      `insert into public.product_variants (id, product_id, sku, name, tone, length_cm, unit, cost_cents, price_cents)
       values ($1, $2, 'EXT-CIN-55-6', 'Cinta 55 cm tono 6', '6', 55, 'pack', 60000, 120000),
              ($3, $4, 'ADH-01', 'Adhesivo 10 ml', null, null, 'piece', 5000, 0)`,
      [IDS.hairVariant, IDS.hairProduct, IDS.adhesiveVariant, IDS.adhesiveProduct],
    );
    await c.query(`insert into public.service_materials (service_id, variant_id, material_role, quantity) values ($1, $2, 'adhesive', 1)`, [
      IDS.install,
      IDS.adhesiveVariant,
    ]);
    // Existencias iniciales vía la función atómica (crea movimiento 'initial').
    for (const [v, q] of [
      [IDS.hairVariant, 1],
      [IDS.adhesiveVariant, 10],
    ] as const) {
      await c.query(`select app.apply_movement($1, $2, 'initial', $3)`, [v, IDS.location, q]);
    }
    await c.query(
      `insert into public.clients (id, first_name, phone) values ($1, 'Clienta A', '+525500000001'), ($2, 'Clienta B', '+525500000002')`,
      [IDS.clientA, IDS.clientB],
    );
  } finally {
    c.release();
  }
}

type Who = { userId: string } | "anon" | "service_role";

/** Ejecuta fn dentro de una transacción con la identidad indicada (como PostgREST). */
export async function as<T>(who: Who, fn: (c: pg.PoolClient) => Promise<T>, opts: { commit?: boolean } = {}): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await setIdentity(c, who);
    const out = await fn(c);
    await c.query(opts.commit === false ? "rollback" : "commit");
    return out;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function setIdentity(c: pg.PoolClient, who: Who) {
  if (who === "anon") {
    await c.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    await c.query("set local role anon");
  } else if (who === "service_role") {
    await c.query(`select set_config('request.jwt.claims', '{"role":"service_role"}', true)`);
    await c.query("set local role service_role");
  } else {
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: who.userId, role: "authenticated" })]);
    await c.query("set local role authenticated");
  }
}

export const reception = { userId: IDS.receptionUser };
export const owner = { userId: IDS.ownerUser };
export const ana = { userId: IDS.anaUser };
export const inventory = { userId: IDS.inventoryUser };

export function installItem(staff: string, startHHMM: string, extra: Record<string, unknown> = {}) {
  return [{ service_id: IDS.install, staff_id: staff, resource_ids: [IDS.est1], starts_at: at(startHHMM), ...extra }];
}

export async function createAppointment(
  c: pg.PoolClient,
  client: string,
  items: unknown[],
  opts: { holdMinutes?: number | null; key?: string | null; allowMissing?: boolean } = {},
): Promise<string> {
  const r = await c.query(`select public.create_appointment($1, $2, $3::jsonb, $4, 'reception', $5, $6) as id`, [
    IDS.location,
    client,
    JSON.stringify(items),
    opts.holdMinutes ?? null,
    opts.key ?? null,
    opts.allowMissing ?? false,
  ]);
  return r.rows[0].id;
}

export async function superQuery<T = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool.query(sql, params);
  return r.rows as T[];
}

export async function stock(variant: string) {
  const [row] = await superQuery<{ on_hand: string; reserved: string }>(
    `select on_hand, reserved from public.stock_levels where variant_id = $1 and location_id = $2`,
    [variant, IDS.location],
  );
  return { onHand: Number(row?.on_hand ?? 0), reserved: Number(row?.reserved ?? 0) };
}
