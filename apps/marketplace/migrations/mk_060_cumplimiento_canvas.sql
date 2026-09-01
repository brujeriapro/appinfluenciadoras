-- mk_060 · El sello de cumplimiento aprende a contar canvas
--
-- mk_cumplimiento cuenta UNA entrega por trato completado. Con canvas eso deja
-- de funcionar y de la peor manera: una operadora que publica 20 videos al mes
-- durante tres meses sumaría un punto de historial —o ninguno, porque su
-- programa sigue abierto y no hay nada «cerrado»— mientras alguien que hizo un
-- solo reel y lo cerró sumaría lo mismo. La que más ha demostrado que cumple
-- aparecería con menos historial que la que menos.
--
-- La unidad correcta es el CICLO CERRADO, no el programa: es lo que se parece a
-- un trato entregado —un compromiso con fecha, que se cumple o no— y llega
-- cada quincena o cada mes en vez de una sola vez al final.
--
-- Reglas nuevas, en el mismo tono que las que ya estaban, para que el sello
-- siga siendo defendible frente a una creadora que pregunte por qué le aparece
-- lo que le aparece:
--
--   ENTREGA (canvas)    → ciclo cerrado con al menos una pieza válida.
--   A TIEMPO (canvas)   → ciclo cerrado habiendo publicado la cuota completa.
--                         Publicar 15 de 20 cuenta como entrega, no como
--                         cumplimiento: se le pagaron las 15 y no se le castiga,
--                         pero tampoco puede figurar igual que quien hizo 20.
--   INCUMPLIDA (canvas) → ciclo cerrado sin una sola pieza. Cobró el compromiso
--                         y no publicó nada.
--
-- Los ciclos abiertos no cuentan para ningún lado: todavía no pasó nada.
--
-- Como mk_creadoras.colaboraciones_completadas se sincroniza desde esta vista
-- (mk_026), el orden del catálogo se corrige solo la próxima vez que corra.

begin;

create or replace view mk_cumplimiento as
with gifting as (
  select
    m.id as creadora_id,
    case when i.fecha_envio is not null
          and coalesce(i.paquete_no_llego, false) = false then 1 else 0 end as kit_recibido,
    (select min(c.fecha_submision)::date from contenidos c where c.influencer_id = i.id) as entrega,
    (select count(*) from contenidos c where c.influencer_id = i.id)                     as piezas,
    i.fecha_envio,
    coalesce(i.paquete_no_llego, false) as paquete_perdido
  from mk_creadoras m
  join influencers i on i.id = m.influencer_id
),
g as (
  select
    creadora_id,
    case when entrega is not null then 1 else 0 end as entregada,
    case when entrega is not null and fecha_envio is not null
         then (entrega - fecha_envio) end                                       as dias,
    case when entrega is not null and fecha_envio is not null
          and (entrega - fecha_envio) <= 30 then 1 else 0 end                   as a_tiempo,
    case when entrega is null and kit_recibido = 1 and paquete_perdido = false
          and fecha_envio < current_date - 45 then 1 else 0 end                 as incumplida,
    piezas
  from gifting
),
t as (
  select
    creadora_id,
    count(*) filter (where estado in ('aprobado','pagado','cerrado'))            as tratos_completados,
    count(*) filter (where estado in ('aprobado','pagado','cerrado')
                       and fecha_entrega is not null
                       and fecha_entrega_esperada is not null
                       and fecha_entrega::date <= fecha_entrega_esperada)        as tratos_a_tiempo,
    count(*) filter (where estado = 'pago_retenido'
                       and fecha_entrega_esperada < current_date)                as tratos_vencidos
  from mk_tratos group by creadora_id
),
-- Canvas. Se cuenta por ciclo cerrado, y se lee del programa —no de las
-- piezas— porque el ciclo es el compromiso; las piezas son la evidencia.
cv as (
  select
    p.creadora_id,
    count(*) filter (where c.estado = 'cerrado'
                       and coalesce(c.piezas_validas, 0) > 0)                    as ciclos_entregados,
    count(*) filter (where c.estado = 'cerrado'
                       and coalesce(c.piezas_validas, 0) >= c.cuota)             as ciclos_completos,
    count(*) filter (where c.estado = 'cerrado'
                       and coalesce(c.piezas_validas, 0) = 0)                    as ciclos_vacios,
    coalesce(sum(c.piezas_validas) filter (where c.estado = 'cerrado'), 0)       as piezas_canvas
  from mk_canvas_ciclo c
  join mk_canvas_programa p on p.id = c.programa_id
  where p.creadora_id is not null
  group by p.creadora_id
)
select
  m.id as creadora_id,

  coalesce(g.entregada, 0) + coalesce(t.tratos_completados, 0)
                           + coalesce(cv.ciclos_entregados, 0)         as entregas,
  coalesce(g.a_tiempo, 0)  + coalesce(t.tratos_a_tiempo, 0)
                           + coalesce(cv.ciclos_completos, 0)          as entregas_a_tiempo,
  coalesce(g.incumplida, 0) + coalesce(t.tratos_vencidos, 0)
                            + coalesce(cv.ciclos_vacios, 0)            as incumplidas,
  g.dias                                                               as dias_primera_entrega,
  -- Las piezas de canvas suman acá: son contenido publicado y comprobable, con
  -- su URL. Que no salgan del perfil de ella no las hace menos trabajo.
  coalesce(g.piezas, 0) + coalesce(cv.piezas_canvas, 0)                as piezas_publicadas,

  case
    when coalesce(g.entregada,0) + coalesce(t.tratos_completados,0)
       + coalesce(cv.ciclos_entregados,0) >= 3 then 'comprobado'
    when coalesce(g.entregada,0) + coalesce(t.tratos_completados,0)
       + coalesce(cv.ciclos_entregados,0) >= 1 then 'parcial'
    when coalesce(g.incumplida,0) + coalesce(t.tratos_vencidos,0)
       + coalesce(cv.ciclos_vacios,0)   >= 1 then 'pendiente'
    else 'sin_historial'
  end                                                                  as confianza
from mk_creadoras m
left join g  on g.creadora_id  = m.id
left join t  on t.creadora_id  = m.id
left join cv on cv.creadora_id = m.id;

commit;
