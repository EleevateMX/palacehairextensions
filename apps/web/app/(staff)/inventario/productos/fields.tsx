import { Field, inputClass } from "@/components/ui";
import { centsToPesosInput, KIND_LABEL, TECHNIQUES, UNIT_LABEL } from "../_lib/shared";

type Opt = { id: string; name: string };

export interface ProductValues {
  name?: string;
  description?: string | null;
  kind?: string;
  category_id?: string | null;
  brand_id?: string | null;
  supplier_id?: string | null;
  technique?: string | null;
  is_sellable_pos?: boolean;
  is_sellable_online?: boolean;
  is_active?: boolean;
}

export function ProductFields({
  v = {},
  categories,
  brands,
  suppliers,
}: {
  v?: ProductValues;
  categories: Opt[];
  brands: Opt[];
  suppliers: Opt[];
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label="Nombre del producto" className="md:col-span-2">
        <input name="name" required minLength={2} maxLength={160} defaultValue={v.name ?? ""} className={inputClass} />
      </Field>
      <Field label="Descripción" className="md:col-span-2">
        <textarea name="description" rows={2} maxLength={2000} defaultValue={v.description ?? ""} className={`${inputClass} py-2`} />
      </Field>
      <Field label="Tipo">
        <select name="kind" required defaultValue={v.kind ?? "hair_extension"} className={inputClass}>
          {Object.entries(KIND_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Técnica" hint="Cinta, keratina, microlink, cosida… (opcional)">
        <input name="technique" list="techniques" defaultValue={v.technique ?? ""} className={inputClass} />
        <datalist id="techniques">
          {TECHNIQUES.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <Field label="Categoría">
        <select name="category_id" defaultValue={v.category_id ?? ""} className={inputClass}>
          <option value="">Sin categoría</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nueva categoría" hint="Si la escribes, se crea y se asigna.">
        <input name="new_category" maxLength={80} className={inputClass} />
      </Field>
      <Field label="Marca">
        <select name="brand_id" defaultValue={v.brand_id ?? ""} className={inputClass}>
          <option value="">Sin marca</option>
          {brands.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Nueva marca" hint="Si la escribes, se crea y se asigna.">
        <input name="new_brand" maxLength={80} className={inputClass} />
      </Field>
      <Field label="Proveedor" className="md:col-span-2">
        <select name="supplier_id" defaultValue={v.supplier_id ?? ""} className={inputClass}>
          <option value="">Sin proveedor</option>
          {suppliers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="flex flex-wrap gap-4 md:col-span-2">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="is_sellable_pos" defaultChecked={v.is_sellable_pos ?? true} /> Se vende en caja
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="is_sellable_online" defaultChecked={v.is_sellable_online ?? false} /> Se vende en línea
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name="is_active" defaultChecked={v.is_active ?? true} /> Activo
        </label>
      </div>
    </div>
  );
}

export interface VariantValues {
  id?: string;
  sku?: string;
  barcode?: string | null;
  name?: string;
  tone?: string | null;
  length_cm?: number | string | null;
  texture?: string | null;
  presentation?: string | null;
  unit?: string;
  grams_per_unit?: number | string | null;
  cost_cents?: number | null;
  price_cents?: number;
  promo_price_cents?: number | null;
  promo_ends?: string;
  min_stock?: number | string;
  is_active?: boolean;
}

export function VariantFields({ v = {}, showCost }: { v?: VariantValues; showCost: boolean }) {
  const n = (x: number | string | null | undefined) => (x === null || x === undefined ? "" : String(Number(x)));
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Field label="SKU">
        <input name="sku" required maxLength={40} defaultValue={v.sku ?? ""} className={`${inputClass} uppercase`} />
      </Field>
      <Field label="Código de barras">
        <input name="barcode" maxLength={64} inputMode="numeric" defaultValue={v.barcode ?? ""} className={inputClass} />
      </Field>
      <Field label="Nombre de la variante" className="col-span-2">
        <input name="variant_name" required minLength={2} maxLength={160} defaultValue={v.name ?? ""} className={inputClass} />
      </Field>
      <Field label="Tono / color">
        <input name="tone" maxLength={40} defaultValue={v.tone ?? ""} className={inputClass} />
      </Field>
      <Field label="Largo (cm)">
        <input name="length_cm" inputMode="decimal" defaultValue={n(v.length_cm)} className={inputClass} />
      </Field>
      <Field label="Textura">
        <input name="texture" list={`textures-${v.id ?? "new"}`} maxLength={40} defaultValue={v.texture ?? ""} className={inputClass} />
        <datalist id={`textures-${v.id ?? "new"}`}>
          {["lacio", "ondulado", "rizado"].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </Field>
      <Field label="Presentación" hint="Paquete 50 g, 20 piezas…">
        <input name="presentation" maxLength={80} defaultValue={v.presentation ?? ""} className={inputClass} />
      </Field>
      <Field label="Unidad">
        <select name="unit" defaultValue={v.unit ?? "piece"} className={inputClass}>
          {Object.entries(UNIT_LABEL).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Gramos por unidad">
        <input name="grams_per_unit" inputMode="decimal" defaultValue={n(v.grams_per_unit)} className={inputClass} />
      </Field>
      {showCost ? (
        <Field label="Costo (MXN)" hint="Solo visible para Inventarios y Administración.">
          <input name="cost" inputMode="decimal" defaultValue={centsToPesosInput(v.cost_cents)} placeholder="0.00" className={inputClass} />
        </Field>
      ) : null}
      <Field label="Precio (MXN)" hint="IVA incluido">
        <input name="price" required inputMode="decimal" defaultValue={centsToPesosInput(v.price_cents ?? null)} placeholder="0.00" className={inputClass} />
      </Field>
      <Field label="Precio de promoción (MXN)">
        <input name="promo_price" inputMode="decimal" defaultValue={centsToPesosInput(v.promo_price_cents)} className={inputClass} />
      </Field>
      <Field label="Promoción termina">
        <input name="promo_ends" type="date" defaultValue={v.promo_ends ?? ""} className={inputClass} />
      </Field>
      <Field label="Existencia mínima">
        <input name="min_stock" inputMode="decimal" defaultValue={n(v.min_stock ?? 0)} className={inputClass} />
      </Field>
      <label className="flex min-h-11 items-center gap-2 self-end text-sm">
        <input type="checkbox" name="variant_active" defaultChecked={v.is_active ?? true} /> Variante activa
      </label>
    </div>
  );
}
