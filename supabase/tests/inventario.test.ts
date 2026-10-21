import { beforeEach, describe, expect, it } from "vitest";
import { IDS, as, ana, inventory, owner, reception, resetFixtures, stock, superQuery } from "./helpers";

const SUPPLIER = "90000000-0000-0000-0000-000000000001";

beforeEach(async () => {
  await resetFixtures();
  // Tablas del módulo que resetFixtures no limpia.
  await superQuery(`truncate public.purchase_order_lines, public.purchase_orders, public.stock_count_lines, public.stock_counts cascade`);
  await superQuery(`update public.products set supplier_id = null`);
  await superQuery(`delete from public.suppliers`);
  await superQuery(`insert into public.suppliers (id, name) values ($1, 'Proveedora de prueba')`, [SUPPLIER]);
});

const createPO = (lines: unknown) =>
  as(inventory, async (c) => {
    const r = await c.query(`select public.create_purchase_order($1, $2, null, 'nota', $3::jsonb) as id`, [
      SUPPLIER,
      IDS.location,
      JSON.stringify(lines),
    ]);
    return r.rows[0].id as string;
  });

describe("Inventario: órdenes de compra", () => {
  it("crea la orden con sus partidas y la recepción parcial sube existencias y marca 'partial'", async () => {
    const po = await createPO([{ variant_id: IDS.hairVariant, qty: 5, unit_cost_cents: 61000 }]);
    const [h] = await superQuery(`select status, created_by from public.purchase_orders where id = $1`, [po]);
    expect(h.status).toBe("draft");
    expect(h.created_by).toBe(IDS.inventoryUser);
    const [line] = await superQuery(`select id, qty_ordered from public.purchase_order_lines where purchase_order_id = $1`, [po]);
    expect(Number(line.qty_ordered)).toBe(5);

    await as(inventory, (c) => c.query(`select public.receive_purchase_order_line($1, 2)`, [line.id]));
    expect((await stock(IDS.hairVariant)).onHand).toBe(3);
    const [po2] = await superQuery(`select status from public.purchase_orders where id = $1`, [po]);
    expect(po2.status).toBe("partial");
    const [m] = await superQuery(
      `select movement_type, quantity, unit_cost_cents, reference_type from public.stock_movements
        where reference_id = $1`,
      [po],
    );
    expect(m).toMatchObject({ movement_type: "purchase", unit_cost_cents: 61000, reference_type: "purchase_order" });

    await as(inventory, (c) => c.query(`select public.receive_purchase_order_line($1, 3)`, [line.id]));
    const [po3] = await superQuery(`select status from public.purchase_orders where id = $1`, [po]);
    expect(po3.status).toBe("received");
    await expect(as(inventory, (c) => c.query(`select public.receive_purchase_order_line($1, 1)`, [line.id]))).rejects.toThrow("PO_CLOSED");
  });

  it("es atómica: una partida inválida no deja la orden a medias", async () => {
    await expect(
      createPO([
        { variant_id: IDS.hairVariant, qty: 1, unit_cost_cents: 100 },
        { variant_id: IDS.adhesiveVariant, qty: 0, unit_cost_cents: 100 },
      ]),
    ).rejects.toThrow("INVALID_QUANTITY");
    await expect(createPO([])).rejects.toThrow("PO_EMPTY");
    await expect(createPO([{ variant_id: IDS.hairVariant, qty: 1, unit_cost_cents: -1 }])).rejects.toThrow("INVALID_AMOUNT");
    const rows = await superQuery(`select id from public.purchase_orders`);
    expect(rows).toHaveLength(0);
  });

  it("solo inventarios, administración y propietaria crean órdenes; anon no puede ejecutar", async () => {
    for (const who of [reception, ana]) {
      await expect(
        as(who, (c) =>
          c.query(`select public.create_purchase_order($1, $2, null, null, $3::jsonb)`, [
            SUPPLIER,
            IDS.location,
            JSON.stringify([{ variant_id: IDS.hairVariant, qty: 1, unit_cost_cents: 1 }]),
          ]),
        ),
      ).rejects.toThrow("FORBIDDEN");
    }
    await expect(
      as("anon", (c) => c.query(`select public.create_purchase_order($1, $2, null, null, '[]'::jsonb)`, [SUPPLIER, IDS.location])),
    ).rejects.toThrow(/permission denied/);
    await expect(as("anon", (c) => c.query(`select public.cancel_stock_count($1)`, [SUPPLIER]))).rejects.toThrow(/permission denied/);
    await expect(as("anon", (c) => c.query(`select public.set_bin_location($1, $2, 'A1')`, [IDS.hairVariant, IDS.location]))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("marcar enviada y cancelar se permite por política solo en borrador/enviada", async () => {
    const po = await createPO([{ variant_id: IDS.hairVariant, qty: 1, unit_cost_cents: 100 }]);
    const sent = await as(inventory, (c) => c.query(`update public.purchase_orders set status = 'sent' where id = $1 returning id`, [po]));
    expect(sent.rowCount).toBe(1);
    const [line] = await superQuery(`select id from public.purchase_order_lines where purchase_order_id = $1`, [po]);
    await as(inventory, (c) => c.query(`select public.receive_purchase_order_line($1, 1)`, [line.id]));
    // Recibida: ya no se puede cancelar.
    const cancel = await as(inventory, (c) => c.query(`update public.purchase_orders set status = 'cancelled' where id = $1 returning id`, [po]));
    expect(cancel.rowCount).toBe(0);
    // La recepción no se puede falsear editando la partida directamente.
    const forged = await as(inventory, (c) =>
      c.query(`update public.purchase_order_lines set qty_received = 0 where id = $1 returning id`, [line.id]).catch((e: Error) => e),
    );
    expect(forged instanceof Error || (forged as { rowCount: number }).rowCount === 0).toBe(true);
    const [after] = await superQuery(`select qty_received from public.purchase_order_lines where id = $1`, [line.id]);
    expect(Number(after.qty_received)).toBe(1);
  });
});

describe("Inventario: ubicación física y conteos", () => {
  it("set_bin_location crea la fila de existencias en cero y respeta roles", async () => {
    const [v] = await superQuery(
      `insert into public.product_variants (product_id, sku, name) values ($1, 'NUEVO-1', 'Nueva') returning id`,
      [IDS.hairProduct],
    );
    await as(inventory, (c) => c.query(`select public.set_bin_location($1, $2, ' Anaquel B2 ')`, [v.id, IDS.location]));
    const [s] = await superQuery(`select on_hand, reserved, bin_location from public.stock_levels where variant_id = $1`, [v.id]);
    expect(s).toMatchObject({ bin_location: "Anaquel B2" });
    expect(Number(s.on_hand)).toBe(0);
    await expect(as(ana, (c) => c.query(`select public.set_bin_location($1, $2, 'X')`, [v.id, IDS.location]))).rejects.toThrow("FORBIDDEN");
    await expect(as(reception, (c) => c.query(`select public.set_bin_location($1, $2, 'X')`, [v.id, IDS.location]))).rejects.toThrow("FORBIDDEN");
  });

  it("el conteo con diferencia genera count_adjustment; un conteo cancelado ya no se aplica", async () => {
    const count = await as(inventory, async (c) => {
      const r = await c.query(`insert into public.stock_counts (location_id, started_by) values ($1, $2) returning id`, [IDS.location, IDS.inventoryUser]);
      await c.query(`insert into public.stock_count_lines (stock_count_id, variant_id, counted_qty) values ($1, $2, 7)`, [
        r.rows[0].id,
        IDS.adhesiveVariant,
      ]);
      return r.rows[0].id as string;
    });
    const n = await as(inventory, (c) => c.query(`select public.apply_stock_count($1) as n`, [count]));
    expect(n.rows[0].n).toBe(1);
    expect((await stock(IDS.adhesiveVariant)).onHand).toBe(7);
    const [m] = await superQuery(`select movement_type, quantity from public.stock_movements where reference_type = 'stock_count' and reference_id = $1`, [
      count,
    ]);
    expect(m.movement_type).toBe("count_adjustment");
    expect(Number(m.quantity)).toBe(-3);

    const other = await as(owner, async (c) => {
      const r = await c.query(`insert into public.stock_counts (location_id) values ($1) returning id`, [IDS.location]);
      return r.rows[0].id as string;
    });
    await expect(as(ana, (c) => c.query(`select public.cancel_stock_count($1)`, [other]))).rejects.toThrow("FORBIDDEN");
    await as(inventory, (c) => c.query(`select public.cancel_stock_count($1)`, [other]));
    await expect(as(inventory, (c) => c.query(`select public.cancel_stock_count($1)`, [other]))).rejects.toThrow("COUNT_NOT_OPEN");
    await expect(as(inventory, (c) => c.query(`select public.apply_stock_count($1)`, [other]))).rejects.toThrow("COUNT_NOT_OPEN");
    // Las partidas de un conteo cerrado ya no se pueden editar.
    await expect(
      as(inventory, (c) =>
        c.query(`insert into public.stock_count_lines (stock_count_id, variant_id, counted_qty) values ($1, $2, 1)`, [other, IDS.hairVariant]),
      ),
    ).rejects.toThrow(/row-level security/);
  });
});

describe("Inventario: costos ocultos por rol", () => {
  it("estilista y recepción no leen el costo; inventarios sí", async () => {
    for (const who of [ana, reception]) {
      await expect(as(who, (c) => c.query(`select cost_cents from public.product_variants`))).rejects.toThrow(/permission denied/);
      const r = await as(who, (c) => c.query(`select * from public.v_variant_costs`));
      expect(r.rows).toHaveLength(0);
      const mv = await as(who, (c) => c.query(`select * from public.stock_movements`));
      expect(mv.rows).toHaveLength(0);
    }
    const r = await as(inventory, (c) => c.query(`select cost_cents from public.v_variant_costs where variant_id = $1`, [IDS.hairVariant]));
    expect(r.rows[0].cost_cents).toBe(60000);
  });

  it("los proveedores solo los ven inventarios, administración y propietaria", async () => {
    const r1 = await as(ana, (c) => c.query(`select * from public.suppliers`));
    expect(r1.rows).toHaveLength(0);
    const r2 = await as(inventory, (c) => c.query(`select * from public.suppliers`));
    expect(r2.rows).toHaveLength(1);
  });
});
