import "server-only";
import { inputClass, secondaryButtonClass } from "@/components/ui";
import { currentLocationId } from "@/lib/location";
import type { CurrentStaff } from "@/lib/staff";
import type { createClient } from "@/lib/supabase/server";

type DB = Awaited<ReturnType<typeof createClient>>;
export type LocationRow = { id: string; name: string; is_active: boolean };

/** Sucursales y la seleccionada (?location=… o la de la persona). */
export async function resolveLocation(supabase: DB, staff: CurrentStaff, requested?: string) {
  const { data } = await supabase.from("locations").select("id, name, is_active").order("name");
  const locations = (data ?? []) as LocationRow[];
  const chosen = locations.find((l) => l.id === requested)?.id ?? (await currentLocationId(supabase, staff)) ?? locations[0]?.id ?? null;
  return { locations, locationId: chosen };
}

/** Selector de sucursal (solo aparece si hay más de una). */
export function LocationPicker({ locations, current }: { locations: LocationRow[]; current: string | null }) {
  if (locations.length < 2) return null;
  return (
    <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
      <label className="block space-y-1">
        <span className="text-sm font-medium">Sucursal</span>
        <select name="location" defaultValue={current ?? ""} className={inputClass}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.is_active ? "" : " (inactiva)"}
            </option>
          ))}
        </select>
      </label>
      <button className={secondaryButtonClass}>Cambiar</button>
    </form>
  );
}
