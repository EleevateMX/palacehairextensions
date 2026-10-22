import type { PortalLocation } from "@/lib/portal";
import { buttonClass, secondaryButtonClass } from "@/components/ui";

/** Búsqueda de Google Maps a partir de un texto (sin llave de API). */
export function mapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * "Visítanos": mapa, dirección, teléfono, cómo llegar y Facebook.
 * El mapa es el embebido público de Google Maps; se carga solo al acercarse (loading="lazy").
 */
export function VisitCard({ location, facebookUrl, displayName }: { location: PortalLocation | null; facebookUrl: string | null; displayName: string }) {
  if (!location) return null;
  // El mapa busca por el nombre del salón (muestra su ficha de Google); la dirección es respaldo.
  const query = location.map_query || location.address;
  const directions = location.maps_url || (query ? mapsSearchUrl(query) : null);
  if (!query && !directions && !facebookUrl && !location.phone) return null;
  return (
    <section aria-labelledby="visitanos" className="overflow-hidden rounded-2xl border border-line bg-surface">
      {query ? (
        <iframe
          title={`Mapa de ubicación de ${displayName}`}
          src={`https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed&hl=es`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="block aspect-[4/3] w-full border-0 bg-surface-muted lg:aspect-square"
        />
      ) : null}
      <div className="space-y-3 p-5">
        <p id="visitanos" className="eyebrow">
          Visítanos
        </p>
        <p className="font-display text-xl">{displayName}</p>
        {location.address ? <p className="text-sm">{location.address}</p> : null}
        {location.phone ? (
          <p className="text-sm">
            <a className="underline underline-offset-2" href={`tel:${location.phone.replace(/[^\d+]/g, "")}`}>
              {location.phone}
            </a>
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2 pt-1">
          {directions ? (
            <a className={`${buttonClass} flex-1`} href={directions} target="_blank" rel="noopener noreferrer">
              Cómo llegar
            </a>
          ) : null}
          {facebookUrl ? (
            <a className={`${secondaryButtonClass} flex-1`} href={facebookUrl} target="_blank" rel="noopener noreferrer">
              Facebook
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}
