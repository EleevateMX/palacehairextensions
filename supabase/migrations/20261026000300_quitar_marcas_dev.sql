-- Quita las marcas "(DEV)" / "(demo)" de los datos iniciales que se cargaron en el entorno en línea.
-- Solo renombra filas con esos nombres exactos: en otros entornos no hace nada. Idempotente.

update public.business_settings set display_name = 'Palace Hair Extensions'
 where id = 1 and display_name = 'Palace Hair Extensions (DEV)';

update public.locations set name = 'Sucursal Mérida'
 where name = 'Sucursal principal (DEV)';

update public.products set name = 'Extensión de cinta 55 cm' where name = 'Extensión de cinta 55 cm (DEV)';
update public.products set name = 'Cinta adhesiva de repuesto' where name = 'Cinta adhesiva de repuesto (DEV)';

update public.product_variants set sku = 'CIN-55-04' where sku = 'DEV-CIN-55-04';
update public.product_variants set sku = 'CIN-55-613' where sku = 'DEV-CIN-55-613';
update public.product_variants set sku = 'CINTA-REP' where sku = 'DEV-CINTA-REP';

-- Cuentas de prueba del personal: nombre por rol, sin sufijo.
update public.staff_members set display_name = regexp_replace(display_name, '\s*\((demo|DEV)\)$', '')
 where display_name ~ '\s*\((demo|DEV)\)$';
