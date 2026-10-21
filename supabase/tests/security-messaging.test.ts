import { beforeEach, describe, expect, it } from "vitest";
import { IDS, as, ana, createAppointment, installItem, inventory, reception, resetFixtures, superQuery } from "./helpers";

beforeEach(resetFixtures);

describe("Escenario 13: acceso sin permiso", () => {
  it("una estilista solo ve clientas que atiende", async () => {
    await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.ana, "11:00")));
    const r = await as(ana, (c) => c.query(`select id from public.clients`));
    expect(r.rows.map((x) => x.id)).toEqual([IDS.clientA]);
  });

  it("una estilista ve la ocupación de otras (sin datos de clienta) para no ofrecer horarios falsos", async () => {
    await as(reception, (c) => createAppointment(c, IDS.clientA, installItem(IDS.bea, "11:00")));
    const busy = await as(ana, (c) => c.query(`select staff_id, resource_id from public.v_busy_allocations`));
    expect(busy.rows.map((r) => r.staff_id ?? r.resource_id).sort()).toEqual([IDS.bea, IDS.est1].sort());
    const appts = await as(ana, (c) => c.query(`select id from public.appointments`));
    expect(appts.rows).toHaveLength(0);
  });

  it("inventarios no ve clientas; estilista no cobra ni ve costos", async () => {
    const r = await as(inventory, (c) => c.query(`select id from public.clients`));
    expect(r.rows).toHaveLength(0);
    await expect(as(ana, (c) => c.query(`select public.pos_checkout('{"lines":[]}'::jsonb)`))).rejects.toThrow("FORBIDDEN");
    await expect(as(ana, (c) => c.query(`select cost_cents from public.product_variants`))).rejects.toThrow(/permission denied/);
    const costs = await as(ana, (c) => c.query(`select * from public.v_variant_costs`));
    expect(costs.rows).toHaveLength(0);
    const costsInv = await as(inventory, (c) => c.query(`select * from public.v_variant_costs`));
    expect(costsInv.rows.length).toBeGreaterThan(0);
  });

  it("notas sensibles solo para propietaria/administración", async () => {
    await superQuery(`insert into public.client_notes (client_id, sensitivity, body) values ($1, 'sensitive', 'Alergia'), ($1, 'general', 'Prefiere té')`, [IDS.clientA]);
    const r = await as(reception, (c) => c.query(`select body from public.client_notes`));
    expect(r.rows.map((x) => x.body)).toEqual(["Prefiere té"]);
  });

  it("anon no puede crear citas ni leer clientas; sí ve el catálogo público sin costos", async () => {
    await expect(as("anon", (c) => c.query(`select public.create_appointment($1, null, '[]'::jsonb)`, [IDS.location]))).rejects.toThrow(
      /permission denied/,
    );
    const clients = await as("anon", (c) => c.query(`select id from public.clients`));
    expect(clients.rows).toHaveLength(0);
    const products = await as("anon", (c) => c.query(`select name from public.products`));
    expect(products.rows.map((x) => x.name)).toEqual(["Extensión cinta 55 cm"]);
    await expect(as("anon", (c) => c.query(`select cost_cents from public.product_variants`))).rejects.toThrow(/permission denied/);
  });

  it("usuario autenticado sin expediente de personal no ve nada operativo", async () => {
    await superQuery(`insert into auth.users (id) values ('99999999-0000-0000-0000-000000000001')`);
    const who = { userId: "99999999-0000-0000-0000-000000000001" };
    const r = await as(who, (c) => c.query(`select count(*)::int as n from public.appointments`));
    expect(r.rows[0].n).toBe(0);
    await expect(as(who, (c) => c.query(`select public.expire_holds()`))).rejects.toThrow("FORBIDDEN");
  });

  it("fotografías requieren consentimiento vigente", async () => {
    await expect(
      superQuery(`insert into public.client_photos (client_id, kind, storage_path) values ($1, 'before', 'x/y.jpg')`, [IDS.clientA]),
    ).rejects.toThrow("CONSENT_REQUIRED");
    await superQuery(`insert into public.client_consents (client_id, purpose, granted, source) values ($1, 'photos_internal', true, 'recepcion')`, [IDS.clientA]);
    await superQuery(`insert into public.client_photos (client_id, kind, storage_path) values ($1, 'before', 'x/y.jpg')`, [IDS.clientA]);
    await superQuery(`insert into public.client_consents (client_id, purpose, granted, source) values ($1, 'photos_internal', false, 'whatsapp')`, [IDS.clientA]);
    await expect(
      superQuery(`insert into public.client_photos (client_id, kind, storage_path) values ($1, 'after', 'x/z.jpg')`, [IDS.clientA]),
    ).rejects.toThrow("CONSENT_REQUIRED");
  });
});

describe("Mensajería y webhooks", () => {
  async function newConversation() {
    const [c] = await superQuery(`insert into public.conversations (channel, external_thread_id) values ('whatsapp', '5215500000001') returning id`);
    return c.id as string;
  }

  it("Escenario 12: webhooks duplicados se ignoran; firma inválida se rechaza", async () => {
    const first = await as("service_role", (c) => c.query(`select public.ingest_webhook_event('whatsapp', 'wamid.1', '{}'::jsonb, true) as n`));
    const again = await as("service_role", (c) => c.query(`select public.ingest_webhook_event('whatsapp', 'wamid.1', '{}'::jsonb, true) as n`));
    expect(first.rows[0].n).toBe(true);
    expect(again.rows[0].n).toBe(false);
    await expect(
      as("service_role", (c) => c.query(`select public.ingest_webhook_event('whatsapp', 'wamid.2', '{}'::jsonb, false)`)),
    ).rejects.toThrow("INVALID_SIGNATURE");
    await expect(as(reception, (c) => c.query(`select public.ingest_webhook_event('whatsapp', 'wamid.3', '{}'::jsonb, true)`))).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("Escenarios 10 y 11: tras transferir, el bot queda silenciado y el humano toma control", async () => {
    const conv = await newConversation();
    const [inbound] = await superQuery(
      `insert into public.messages (conversation_id, direction, sender_type, body) values ($1, 'inbound', 'customer', '¿Puedo hablar con una persona?') returning id`,
      [conv],
    );
    await as("service_role", (c) => c.query(`select public.escalate_conversation($1, 'customer_request')`, [conv]));
    await expect(
      superQuery(`insert into public.messages (conversation_id, direction, sender_type, body, in_reply_to) values ($1, 'outbound', 'bot', 'Hola', $2)`, [conv, inbound.id]),
    ).rejects.toThrow("BOT_SILENCED");
    await as(reception, (c) =>
      c.query(
        `insert into public.messages (conversation_id, direction, sender_type, sender_staff_id, body, in_reply_to) values ($1, 'outbound', 'agent', $2, 'Hola, soy recepción', $3)`,
        [conv, IDS.reception, inbound.id],
      ),
    );
    const [st] = await superQuery(`select state, assigned_staff_id from public.conversations where id = $1`, [conv]);
    expect(st).toEqual({ state: "in_progress", assigned_staff_id: IDS.reception });
    // No puede reactivarse el bot sin resolver.
    await expect(as(reception, (c) => c.query(`select public.reactivate_bot($1)`, [conv]))).rejects.toThrow("RESOLVE_FIRST");
    const alerts = await superQuery(`select kind from public.ops_alerts where reference_id = $1`, [conv]);
    expect(alerts[0].kind).toBe("conversation_handover");
  });

  it("solo una respuesta por mensaje entrante (bot y humano no responden lo mismo)", async () => {
    const conv = await newConversation();
    const [inbound] = await superQuery(
      `insert into public.messages (conversation_id, direction, sender_type, body) values ($1, 'inbound', 'customer', 'Horarios?') returning id`,
      [conv],
    );
    await superQuery(`insert into public.messages (conversation_id, direction, sender_type, body, in_reply_to) values ($1, 'outbound', 'bot', '10 a 19 h', $2)`, [
      conv,
      inbound.id,
    ]);
    await expect(
      as(reception, (c) =>
        c.query(
          `insert into public.messages (conversation_id, direction, sender_type, sender_staff_id, body, in_reply_to) values ($1, 'outbound', 'agent', $2, 'De 10 a 19', $3)`,
          [conv, IDS.reception, inbound.id],
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});
