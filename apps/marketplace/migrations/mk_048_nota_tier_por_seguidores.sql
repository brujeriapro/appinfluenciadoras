-- mk_048 · Dejar por escrito que el tier se calcula por seguidores
--
-- No cambia nada: documenta una decisión que ya está aplicada, en el sitio
-- donde alguien la va a buscar cuando quiera cambiarla.
--
-- El handoff de diseño de agosto de 2026 propone recalcular el tier por vistas
-- promedio en vez de por seguidores, con cortes distintos. Se decidió NO
-- aplicarlo por ahora, y el motivo es un dato, no una preferencia: solo 26 de
-- 299 creadoras tienen vistas promedio cargadas. Calcular el tier por vistas
-- dejaría al 91% del catálogo sin clasificar, y un catálogo donde casi nadie
-- tiene tamaño es peor que uno con el tamaño medido de otra forma.
--
-- Se revisa cuando las vistas estén cargadas. Quien cambie esto tiene que
-- mover mk_tier_de() Y mk_config.tiers: la misma verdad vive en los dos sitios.

comment on function mk_tier_de(integer) is
  'Tier por SEGUIDORES (decisión de agosto 2026). Diseño propuso calcularlo por vistas promedio; no se aplicó porque solo 26 de 299 creadoras las tienen cargadas. Si cambia, mover también mk_config.tiers.';
