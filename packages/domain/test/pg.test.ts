import { describe, expect, it } from "vitest";
import { parsePgRange } from "../src";

describe("parsePgRange", () => {
  it("parsea el formato de texto de tstzrange de PostgREST", () => {
    const r = parsePgRange('["2030-01-05 16:00:00+00","2030-01-05 18:20:00+00")');
    expect(new Date(r.start).toISOString()).toBe("2030-01-05T16:00:00.000Z");
    expect((r.end - r.start) / 60000).toBe(140);
  });
  it("acepta desfases con minutos y fracciones", () => {
    const r = parsePgRange('["2030-01-05 10:00:00.5-06:00","2030-01-05 12:00:00-06")');
    expect(new Date(r.start).toISOString()).toBe("2030-01-05T16:00:00.500Z");
  });
  it("rechaza rangos no soportados", () => {
    expect(() => parsePgRange("empty")).toThrow();
  });
});
