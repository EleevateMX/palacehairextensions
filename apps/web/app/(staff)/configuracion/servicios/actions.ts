"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { type ActionState, fail } from "@/lib/actions";
import { checkbox, firstIssue, intField, optUuid, pesosField, text } from "../_lib/fields";
import { managerAction } from "../_lib/guard";

const createSchema = z.object({
  name: text("Nombre", 2, 120),
  category_id: optUuid,
  price: pesosField("Precio"),
  price_is_from: checkbox,
  duration_min: intField("Duración", 5, 720),
});

export async function createService(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await managerAction();
  if (ctx.error !== undefined) return { error: ctx.error };
  const parsed = createSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const d = parsed.data;
  // Se crea inactivo y sin reserva en línea: se activa al terminar de configurarlo.
  const { data, error } = await ctx.supabase
    .from("services")
    .insert({
      name: d.name,
      category_id: d.category_id,
      price_cents: d.price,
      price_is_from: d.price_is_from,
      duration_min: d.duration_min,
      is_active: false,
      online_bookable: false,
    })
    .select("id")
    .single();
  if (error || !data) return fail(error);
  revalidatePath("/configuracion/servicios");
  redirect(`/configuracion/servicios/${data.id}?nuevo=1`);
}
