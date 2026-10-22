-- Rendimiento: índice para cada llave foránea de "public" que no tenga uno que la cubra
-- (recomendación del asesor de Supabase: 0001_unindexed_foreign_keys).
-- Solo CREA índices; no cambia datos, políticas ni restricciones. Es idempotente.
do $$
declare
  r record;
  idx_name text;
begin
  for r in
    select c.conrelid::regclass as tbl,
           cl.relname as tbl_name,
           c.conname,
           array_agg(a.attname order by k.ord) as cols
    from pg_constraint c
    join pg_class cl on cl.oid = c.conrelid
    join pg_namespace n on n.oid = cl.relnamespace and n.nspname = 'public'
    cross join lateral unnest(c.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.contype = 'f'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] = c.conkey
      )
    group by c.conrelid, cl.relname, c.conname
  loop
    idx_name := left(r.tbl_name || '_' || array_to_string(r.cols, '_') || '_fk_idx', 63);
    execute format('create index if not exists %I on %s (%s)', idx_name, r.tbl,
                   (select string_agg(quote_ident(x), ', ') from unnest(r.cols) x));
  end loop;
end $$;
