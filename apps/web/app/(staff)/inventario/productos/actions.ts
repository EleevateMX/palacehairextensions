"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail, optStr, pesosToCents, str } from "@/lib/actions";
import { requireStaff } from "@/lib/staff";
import { canSeeCost, canWrite, endOfLocalDayIso, KINDS, QTY_RE, UNITS, workingLocation } from "../_lib/shared";

type DB = Awaited<ReturnType<typeof requireStaff>>["supabase"];

const optionalId = z
  .string()
  .optional()
  .transform((s) => (s ? s : null))
  .pipe(z.guid().nullable());

const productSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del producto.").max(160),
  description: z.string().trim().max(2000).optional().transform((s) => s || null),
  kind: z.enum(KINDS as [string, ...string[]], { message: "Elige el tipo de producto." }),
  category_id: optionalId,
  brand_id: optionalId,
  supplier_id: optionalId,
  new_category: z.string().trim().max(80).optional(),
  new_brand: z.string().trim().max(80).optional(),
  technique: z.string().trim().max(40).optional().transform((s) => s?.toLowerCase() || null),
});

const checked = (form: FormData, key: string) => form.get(key) === "on";

/** Pesos opcionales → centavos (null si vacío). Lanza mensaje si es inválido. */
function money(form: FormData, key: string, label: string, required = false): number | null | { error: string } {
  const raw = str(form, key);
  if (raw === "") return required ? { error: `Escribe ${label}.` } : null;
  const c = pesosToCents(raw);
  return c === null ? { error: `${label[0]!.toUpperCase()}${label.slice(1)} no es un importe válido.` } : c;
}

function decimal(form: FormData, key: string, label: string, re: RegExp): number | null | { error: string } {
  const raw = str(form, key);
  if (raw === "") return null;
  if (!re.test(raw)) return { error: `${label} no es válido.` };
  return Number(raw);
}

const isErr = (v: unknown): v is { error: string } => typeof v === "object" && v !== null && "error" in v;

async function parseProduct(supabase: DB, form: FormData) {
  const parsed = productSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const d = parsed.data;
  let categoryId = d.category_id;
  if (d.new_category) {
    const { data: existing } = await supabase.from("product_categories").select("id").ilike("name", d.new_category).maybeSingle();
    if (existing) categoryId = existing.id;
    else {
      const { data, error } = await supabase.from("product_categories").insert({ name: d.new_category }).select("id").single();
      if (error) return fail(error, "No se pudo crear la categoría.");
      categoryId = data.id;
    }
  }
  let brandId = d.brand_id;
  if (d.new_brand) {
    const { data: existing } = await supabase.from("brands").select("id").ilike("name", d.new_brand).maybeSingle();
    if (existing) brandId = existing.id;
    else {
      const { data, error } = await supabase.from("brands").insert({ name: d.new_brand }).select("id").single();
      if (error) return fail(error, "No se pudo crear la marca.");
      brandId = data.id;
    }
  }
  return {
    row: {
      name: d.name,
      description: d.description,
      kind: d.kind,
      category_id: categoryId,
      brand_id: brandId,
      supplier_id: d.supplier_id,
      technique: d.technique,
      is_sellable_pos: checked(form, "is_sellable_pos"),
      is_sellable_online: checked(form, "is_sellable_online"),
      is_active: checked(form, "is_active"),
    },
  };
}

function parseVariant(form: FormData, opts: { withCost: boolean; tz: string }) {
  const sku = str(form, "sku").toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._\-/]{1,39}$/.test(sku)) return { error: "SKU inválido: 2 a 40 caracteres, letras, números, guion o punto." };
  const name = str(form, "variant_name");
  if (name.length < 2) return { error: "Escribe el nombre de la variante." };
  const unit = str(form, "unit") || "piece";
  if (!UNITS.includes(unit)) return { error: "Unidad inválida." };
  const length = decimal(form, "length_cm", "El largo", /^\d{1,3}(\.\d)?$/);
  const grams = decimal(form, "grams_per_unit", "Los gramos por unidad", /^\d{1,6}(\.\d{1,2})?$/);
  const minRaw = str(form, "min_stock") || "0";
  if (!QTY_RE.test(minRaw) || Number(minRaw) < 0) return { error: "El mínimo debe ser una cantidad positiva (hasta 3 decimales)." };
  const price = money(form, "price", "el precio", true);
  const promo = money(form, "promo_price", "el precio de promoción");
  const cost = opts.withCost ? money(form, "cost", "el costo") : null;
  for (const v of [length, grams, price, promo, cost]) if (isErr(v)) return v;
  const promoEnds = str(form, "promo_ends");
  if (promoEnds && !/^\d{4}-\d{2}-\d{2}$/.test(promoEnds)) return { error: "Fecha de fin de promoción inválida." };
  if (promoEnds && promo === null) return { error: "Indica el precio de promoción o quita la fecha." };
  if (promo !== null && typeof price === "number" && (promo as number) >= price) return { error: "El precio de promoción debe ser menor al precio normal." };
  const row: Record<string, unknown> = {
    sku,
    barcode: optStr(form, "barcode"),
    name,
    tone: optStr(form, "tone"),
    length_cm: length,
    texture: optStr(form, "texture")?.toLowerCase() ?? null,
    presentation: optStr(form, "presentation"),
    unit,
    grams_per_unit: grams,
    price_cents: price,
    promo_price_cents: promo,
    promo_ends_at: promoEnds ? endOfLocalDayIso(promoEnds, opts.tz) : null,
    min_stock: Number(minRaw),
    is_active: checked(form, "variant_active"),
  };
  // Solo los roles autorizados envían costo; si no, la columna no se toca.
  if (opts.withCost) row.cost_cents = cost ?? 0;
  return { row };
}

function variantError(error: { message?: string; code?: string }) {
  if (error.code === "23505" && /barcode/.test(error.message ?? "")) return { error: "Ese código de barras ya está registrado." };
  if (error.code === "23505") return { error: "Ese SKU ya existe. Usa otro." };
  return fail(error, "No se pudo guardar la variante.");
}

export async function createProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const { location } = await workingLocation(supabase, staff);
  const p = await parseProduct(supabase, form);
  if (!("row" in p)) return { error: p.error ?? "Datos inválidos." };
  const v = parseVariant(form, { withCost: canSeeCost(staff), tz: location?.timezone ?? "America/Mexico_City" });
  if ("error" in v) return { error: v.error };

  const { data: product, error } = await supabase.from("products").insert(p.row).select("id").single();
  if (error) return fail(error, "No se pudo crear el producto.");
  const { error: vErr } = await supabase.from("product_variants").insert({ ...v.row, product_id: product.id });
  if (vErr) {
    // Sin variante el producto no sirve: se deshace para no dejarlo a medias.
    await supabase.from("products").delete().eq("id", product.id);
    return variantError(vErr);
  }
  revalidatePath("/inventario");
  redirect(`/inventario/productos/${product.id}?ok=creado`);
}

export async function updateProductAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const id = z.guid().safeParse(str(form, "product_id"));
  if (!id.success) return { error: "Producto inválido." };
  const p = await parseProduct(supabase, form);
  if (!("row" in p)) return { error: p.error ?? "Datos inválidos." };
  const { data, error } = await supabase.from("products").update(p.row).eq("id", id.data).select("id");
  if (error) return fail(error, "No se pudo guardar el producto.");
  if (!data?.length) return { error: "No se encontró el producto o tu rol no puede editarlo." };
  revalidatePath(`/inventario/productos/${id.data}`);
  return { ok: "Producto guardado." };
}

export async function saveVariantAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const productId = z.guid().safeParse(str(form, "product_id"));
  if (!productId.success) return { error: "Producto inválido." };
  const variantId = str(form, "variant_id");
  const { location } = await workingLocation(supabase, staff);
  const v = parseVariant(form, { withCost: canSeeCost(staff), tz: location?.timezone ?? "America/Mexico_City" });
  if ("error" in v) return { error: v.error };
  if (variantId) {
    if (!z.guid().safeParse(variantId).success) return { error: "Variante inválida." };
    const { error, count } = await supabase
      .from("product_variants")
      .update(v.row, { count: "exact" })
      .eq("id", variantId)
      .eq("product_id", productId.data);
    if (error) return variantError(error);
    if (!count) return { error: "No se encontró la variante o tu rol no puede editarla." };
  } else {
    const { error } = await supabase.from("product_variants").insert({ ...v.row, product_id: productId.data });
    if (error) return variantError(error);
  }
  revalidatePath(`/inventario/productos/${productId.data}`);
  revalidatePath("/inventario");
  return { ok: variantId ? "Variante guardada." : "Variante agregada." };
}

export async function setBinLocationAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { supabase, staff } = await requireStaff();
  if (!canWrite(staff)) return { error: "Tu rol no tiene permiso para esta operación." };
  const ids = z.object({ variant_id: z.guid(), location_id: z.guid(), product_id: z.guid() }).safeParse(Object.fromEntries(form));
  if (!ids.success) return { error: "Datos inválidos." };
  const bin = str(form, "bin_location").slice(0, 60);
  const { error } = await supabase.rpc("set_bin_location", { p_variant: ids.data.variant_id, p_location: ids.data.location_id, p_bin: bin });
  if (error) return fail(error, "No se pudo guardar la ubicación.");
  revalidatePath(`/inventario/productos/${ids.data.product_id}`);
  return { ok: bin ? `Ubicación: ${bin}` : "Ubicación borrada." };
}
