-- Vincula cada creadora del marketplace con su ficha del Programa Creadoras.
--
-- Sin este vínculo el catálogo no puede mostrar historial de cumplimiento: son
-- dos tablas que hablan de la misma persona y hasta hoy no se conocían. El
-- cruce es por correo, que es con el que ella se registró en ambos lados.
--
-- Se verificó antes de correr que el match es 1:1 — ningún correo del
-- marketplace toca dos fichas del programa, y ninguna ficha del programa es
-- reclamada por dos creadoras del marketplace. Si se vuelve a correr en otra
-- base, verificar lo mismo primero:
--
--   SELECT m.id FROM mk_creadoras m JOIN influencers i ON lower(i.email)=lower(m.email)
--   WHERE m.influencer_id IS NULL GROUP BY m.id HAVING count(i.id) > 1;

UPDATE mk_creadoras m
SET influencer_id = i.id
FROM influencers i
WHERE m.influencer_id IS NULL
  AND lower(i.email) = lower(m.email);

CREATE INDEX IF NOT EXISTS idx_mk_creadoras_influencer ON mk_creadoras (influencer_id);
