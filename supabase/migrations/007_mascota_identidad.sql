-- Identidad de PIBBI (sistema de mascota igualito al de Muse): el nombre
-- que le pone la pareja, su personalidad (vibe) y el tamaño de su avatar
-- en el encabezado. Se guarda por usuario en pibbi_customization, junto a
-- la prenda (migración 003); el fallback es localStorage (ver
-- src/lib/pibbi.tsx). Las políticas RLS existentes cubren las columnas
-- nuevas sin cambios: cada quien lee y guarda su propia fila.
alter table public.pibbi_customization
  add column if not exists mascot_name text not null default 'PIBBI',
  add column if not exists vibe text not null default 'alegre'
    check (vibe in ('alegre', 'tranquilo', 'motivador', 'bromista')),
  add column if not exists size text not null default 'normal'
    check (size in ('compacto', 'normal', 'grande'));
