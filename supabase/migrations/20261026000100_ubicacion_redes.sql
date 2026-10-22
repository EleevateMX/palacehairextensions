-- Ubicación y redes del salón para el portal público y la configuración.
-- Solo agrega columnas y llena las vacías: no toca datos que ya tengan valor.

alter table public.business_settings
  add column if not exists facebook_url text
  constraint business_settings_facebook_url_check check (facebook_url is null or facebook_url ~ '^https://(www\.|m\.|es-la\.)?facebook\.com/[^\s]+$');

alter table public.locations
  add column if not exists map_query text
  constraint locations_map_query_check check (map_query is null or char_length(map_query) between 3 and 200);

alter table public.locations
  add constraint locations_maps_url_https check (maps_url is null or maps_url ~ '^https://[^\s]+$');

-- Datos públicos que compartió la dueña (página de Facebook y enlace de Google Maps).
-- La dirección es la de la ficha de Google Maps de ese mismo enlace (/g/11qmqpjpmk).
update public.business_settings
   set facebook_url = 'https://www.facebook.com/alpalaciodelasextensiones/'
 where id = 1 and facebook_url is null;

update public.locations
   set maps_url = coalesce(maps_url, 'https://share.google/6v10OOjRqtZk2kvqW'),
       map_query = coalesce(map_query, 'El Palacio de las Extensiones, Mérida, Yucatán'),
       address = coalesce(address, 'C. 41 327-42 y 48, Francisco de Montejo III, 97203 Mérida, Yuc.')
 where is_active and (maps_url is null or map_query is null or address is null);
