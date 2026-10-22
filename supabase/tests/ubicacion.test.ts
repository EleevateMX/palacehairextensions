import { beforeEach, describe, expect, it } from "vitest";
import { IDS, as, owner, reception, resetFixtures, superQuery } from "./helpers";

beforeEach(resetFixtures);

describe("Ubicación y redes del salón", () => {
  it("owner guarda enlace de Maps, texto del mapa y Facebook", async () => {
    await as(owner, async (c) => {
      const loc = await c.query(`update public.locations set maps_url = 'https://maps.app.goo.gl/abc', map_query = 'Salón, Mérida' where id = $1`, [IDS.location]);
      expect(loc.rowCount).toBe(1);
      const bs = await c.query(`update public.business_settings set facebook_url = 'https://www.facebook.com/salon/' where id = 1`);
      expect(bs.rowCount).toBe(1);
    }, { commit: true });
    const [row] = await superQuery(`select maps_url, map_query from public.locations where id = $1`, [IDS.location]);
    expect(row).toEqual({ maps_url: "https://maps.app.goo.gl/abc", map_query: "Salón, Mérida" });
  });

  it("recepción no puede cambiarlos (RLS: 0 filas)", async () => {
    const n = await as(reception, (c) => c.query(`update public.locations set map_query = 'Otro lugar' where id = $1`, [IDS.location]));
    expect(n.rowCount).toBe(0);
    const m = await as(reception, (c) => c.query(`update public.business_settings set facebook_url = 'https://www.facebook.com/otro/' where id = 1`));
    expect(m.rowCount).toBe(0);
  });

  it("rechaza enlaces que no son https ni de Facebook", async () => {
    await expect(as(owner, (c) => c.query(`update public.locations set maps_url = 'javascript:alert(1)' where id = $1`, [IDS.location]))).rejects.toThrow(
      "locations_maps_url_https",
    );
    await expect(as(owner, (c) => c.query(`update public.business_settings set facebook_url = 'https://evil.example/fb' where id = 1`))).rejects.toThrow(
      "business_settings_facebook_url_check",
    );
  });

  it("anon no lee la columna de Facebook directamente (el portal la lee en el servidor)", async () => {
    await expect(as("anon", (c) => c.query(`select facebook_url from public.business_settings`))).rejects.toThrow(/permission denied/);
  });
});
