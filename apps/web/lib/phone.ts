/**
 * Normaliza un teléfono a E.164. Números de 10 dígitos se asumen de México (+52).
 * Acepta espacios, guiones y paréntesis; el prefijo móvil antiguo "1" (+52 1 …) se elimina.
 * Devuelve null si no parece un número válido.
 */
export function toE164(input: string, defaultCountry = "52"): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const hasPlus = raw.startsWith("+") || raw.startsWith("00");
  const digits = raw.replace(/^00/, "").replace(/\D/g, "");
  let e164: string;
  if (hasPlus) {
    e164 = digits;
    if (e164.startsWith("521") && e164.length === 13) e164 = `52${e164.slice(3)}`;
  } else if (digits.length === 10) {
    e164 = `${defaultCountry}${digits}`;
  } else if (digits.length === 12 && digits.startsWith("52")) {
    e164 = digits;
  } else if (digits.length === 13 && digits.startsWith("521")) {
    e164 = `52${digits.slice(3)}`;
  } else {
    return null;
  }
  if (!/^[1-9]\d{9,14}$/.test(e164)) return null;
  if (e164.startsWith("52") && e164.length !== 12) return null;
  return `+${e164}`;
}
