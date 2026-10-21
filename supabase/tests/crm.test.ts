import { beforeEach, describe, expect, it } from "vitest";
import { IDS, ana, as, inventory, owner, reception, resetFixtures, superQuery } from "./helpers";

// La migración del CRM no crea tablas: resetFixtures ya limpia clients, client_consents,
// appointments, appointment_services y maintenance_reminders.
beforeEach(async () => {
  await resetFixtures();
  await superQuery(`update public.business_settings set privacy_notice_version = 'aviso-2026-10' where id = 1`);
});

const ALL_CONSENTS = {
  privacy_notice: true,
  appointment_reminders: true,
  marketing_whatsapp: false,
  marketing_email: false,
  photos_internal: true,
  photos_marketing: false,
};

function newClient(extra: Record<string, unknown> = {}) {
  return { first_name: "Lucía", last_name: "Pérez", phone: "+529991234567", consents: ALL_CONSENTS, ...extra };
}

async function createClient(who: { userId: string }, p: Record<string, unknown>) {
  return as(who, async (c) => (await c.query(`select public.create_client_with_consents($1::jsonb) as id`, [JSON.stringify(p)])).rows[0].id as string);
}

describe("Alta de clienta con consentimientos", () => {
  it("recepción registra clienta y todas las finalidades con versión del aviso y quién registró", async () => {
    const id = await createClient(reception, newClient({ hair_tone: "4", extension_technique: "cinta", extension_length_cm: "55" }));
    const [client] = await superQuery(`select first_name, phone, hair_tone, extension_length_cm from public.clients where id = $1`, [id]);
    expect(client).toMatchObject({ first_name: "Lucía", phone: "+529991234567", hair_tone: "4", extension_length_cm: "55.0" });
    const rows = await superQuery(
      `select purpose::text, granted, source, privacy_notice_version, recorded_by from public.client_consents where client_id = $1 order by purpose`,
      [id],
    );
    expect(rows).toHaveLength(6);
    for (const r of rows) {
      expect(r.source).toBe("recepcion");
      expect(r.privacy_notice_version).toBe("aviso-2026-10");
      expect(r.recorded_by).toBe(IDS.reception);
      expect(r.granted).toBe(ALL_CONSENTS[r.purpose as keyof typeof ALL_CONSENTS]);
    }
  });

  it("sin aviso de privacidad no se registra nada", async () => {
    await expect(createClient(reception, newClient({ consents: { ...ALL_CONSENTS, privacy_notice: false } }))).rejects.toThrow("PRIVACY_REQUIRED");
    const [n] = await superQuery(`select count(*)::int n from public.clients where phone = '+529991234567'`);
    expect(n.n).toBe(0);
  });

  it("valida teléfono, nombre y duplicados", async () => {
    await expect(createClient(reception, newClient({ phone: "9991234567" }))).rejects.toThrow("INVALID_PHONE");
    await expect(createClient(reception, newClient({ first_name: "  " }))).rejects.toThrow("NAME_REQUIRED");
    await createClient(reception, newClient());
    await expect(createClient(owner, newClient({ first_name: "Otra" }))).rejects.toThrow("PHONE_TAKEN");
  });

  it("estilistas e inventarios no pueden dar de alta clientas", async () => {
    await expect(createClient(ana, newClient())).rejects.toThrow("FORBIDDEN");
    await expect(createClient(inventory, newClient())).rejects.toThrow("FORBIDDEN");
  });

  it("anon no puede ejecutar las funciones ni leer la vista", async () => {
    await expect(
      as("anon", (c) => c.query(`select public.create_client_with_consents($1::jsonb)`, [JSON.stringify(newClient())])),
    ).rejects.toThrow(/permission denied/);
    await expect(as("anon", (c) => c.query(`select * from public.v_client_activity`))).rejects.toThrow(/permission denied/);
  });
});

describe("Consentimientos: otorgar y revocar agrega historial", () => {
  it("revocar inserta una fila nueva y la vigente cambia", async () => {
    const id = await createClient(reception, newClient());
    await as(reception, (c) => c.query(`select public.record_client_consent($1, 'appointment_reminders', false, 'Pidió no recibir avisos')`, [id]));
    const history = await superQuery(
      `select granted, evidence, recorded_by from public.client_consents where client_id = $1 and purpose = 'appointment_reminders' order by recorded_at`,
      [id],
    );
    expect(history.map((h) => h.granted)).toEqual([true, false]);
    expect(history[1]).toMatchObject({ evidence: "Pidió no recibir avisos", recorded_by: IDS.reception });
    const current = await as(reception, (c) =>
      c.query(`select granted from public.v_client_current_consents where client_id = $1 and purpose = 'appointment_reminders'`, [id]),
    );
    expect(current.rows[0].granted).toBe(false);
  });

  it("estilistas no registran consentimientos; clienta inexistente → NOT_FOUND", async () => {
    const id = await createClient(reception, newClient());
    await expect(as(ana, (c) => c.query(`select public.record_client_consent($1, 'photos_internal', true)`, [id]))).rejects.toThrow("FORBIDDEN");
    await expect(
      as(reception, (c) => c.query(`select public.record_client_consent('80000000-0000-0000-0000-0000000000ff', 'photos_internal', true)`)),
    ).rejects.toThrow("NOT_FOUND");
  });
});

describe("Segmentos de clientas (v_client_activity)", () => {
  async function appointment(client: string, daysFromNow: number, attendance: string, staff = IDS.ana) {
    const [a] = await superQuery(
      `insert into public.appointments (location_id, client_id, starts_at, ends_at, attendance_status)
       values ($1, $2, now() + make_interval(days => $3), now() + make_interval(days => $3) + interval '1 hour', $4::public.attendance_status)
       returning id`,
      [IDS.location, client, daysFromNow, attendance],
    );
    await superQuery(
      `insert into public.appointment_services (appointment_id, service_id, staff_id, starts_at, ends_at, price_cents)
       select id, $2, $3, starts_at, ends_at, 100000 from public.appointments where id = $1`,
      [a.id, IDS.install, staff],
    );
    return a.id as string;
  }

  beforeEach(async () => {
    // Clienta A: frecuente (3 visitas completadas en 180 días), no nueva.
    await appointment(IDS.clientA, -150, "completed");
    await appointment(IDS.clientA, -60, "completed");
    await appointment(IDS.clientA, -20, "completed");
    // Clienta B: nueva (primera cita hace 5 días) con mantenimiento próximo; la atiende Bea.
    await appointment(IDS.clientB, -5, "completed", IDS.bea);
    await superQuery(
      `insert into public.maintenance_reminders (client_id, due_date, remind_on, technique) values ($1, app.business_today() + 7, app.business_today(), 'cinta')`,
      [IDS.clientB],
    );
    // Clienta C: dada de alta hace 200 días y nunca vino → inactiva.
    await superQuery(
      `insert into public.clients (id, first_name, phone, created_at) values ('80000000-0000-0000-0000-000000000003', 'Clienta C', '+525500000003', now() - interval '200 days')`,
    );
  });

  it("calcula nuevas, frecuentes, inactivas y mantenimiento próximo", async () => {
    const r = await as(owner, (c) =>
      c.query(`select client_id, is_new, is_frequent, is_inactive, maintenance_due_soon, completed_visits_180d from public.v_client_activity order by first_name`),
    );
    const by = Object.fromEntries(r.rows.map((x) => [x.client_id, x]));
    expect(by[IDS.clientA]).toMatchObject({ is_new: false, is_frequent: true, is_inactive: false, maintenance_due_soon: false, completed_visits_180d: 3 });
    expect(by[IDS.clientB]).toMatchObject({ is_new: true, is_frequent: false, is_inactive: false, maintenance_due_soon: true });
    expect(by["80000000-0000-0000-0000-000000000003"]).toMatchObject({ is_new: false, is_inactive: true });
  });

  it("respeta RLS: la estilista solo ve sus clientas e inventarios no ve ninguna", async () => {
    const mine = await as(ana, (c) => c.query(`select client_id from public.v_client_activity`));
    expect(mine.rows.map((x) => x.client_id)).toEqual([IDS.clientA]);
    const none = await as(inventory, (c) => c.query(`select client_id from public.v_client_activity`));
    expect(none.rows).toHaveLength(0);
  });

  it("notas sensibles: recepción no las ve aunque existan", async () => {
    await as(owner, (c) =>
      c.query(`insert into public.client_notes (client_id, sensitivity, body, author_staff_id) values ($1, 'sensitive', 'Alergia', $2)`, [
        IDS.clientA,
        IDS.owner,
      ]),
    );
    const r = await as(reception, (c) => c.query(`select * from public.client_notes where client_id = $1`, [IDS.clientA]));
    expect(r.rows).toHaveLength(0);
    await expect(
      as(reception, (c) =>
        c.query(`insert into public.client_notes (client_id, sensitivity, body, author_staff_id) values ($1, 'sensitive', 'x', $2)`, [
          IDS.clientA,
          IDS.reception,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("Anonimización completa", () => {
  it("libera apartados manuales y cierra recordatorios y lista de espera", async () => {
    const [ids, asRole, ownerUser, q] = [IDS, as, owner, superQuery];
    await resetFixtures();
    await asRole(ownerUser, (c) => c.query(`select public.reserve_stock($1, $2, 1, $3, 'apartado')`, [ids.hairVariant, ids.location, ids.clientA]));
    await q(`insert into public.maintenance_reminders (client_id, due_date, remind_on) values ($1, current_date + 10, current_date + 3)`, [ids.clientA]);
    await q(`insert into public.waitlist_entries (client_id, service_id, desired_from, desired_to) values ($1, $2, current_date, current_date + 7)`, [ids.clientA, ids.install]);
    await asRole(ownerUser, (c) => c.query(`select public.anonymize_client($1)`, [ids.clientA]));
    const [st] = await q(`select reserved from public.stock_levels where variant_id = $1`, [ids.hairVariant]);
    expect(Number(st.reserved)).toBe(0);
    const [rem] = await q(`select status from public.maintenance_reminders where client_id = $1`, [ids.clientA]);
    expect(rem.status).toBe("dismissed");
    const [w] = await q(`select status from public.waitlist_entries where client_id = $1`, [ids.clientA]);
    expect(w.status).toBe("cancelled");
    const [cl] = await q(`select first_name, phone, is_anonymized from public.clients where id = $1`, [ids.clientA]);
    expect(cl).toEqual({ first_name: "Anonimizada", phone: null, is_anonymized: true });
  });
});
