# Creators Manager (marketplace): apagado

**El marketplace está apagado desde el 7 de octubre de 2026.** María decidió cerrarlo para usar creatorsmanager.com como sitio de la agencia Creators Manager (repo aparte: `brujeriapro/creators-manager-web`).

Nada se borró. El código sigue aquí tal como estaba y los datos siguen en Supabase (tablas `mk_*`). Ni a las creadoras ni a las marcas se les avisó del cierre; fue una decisión explícita.

## Cómo está apagado

En el servicio de Railway del marketplace está puesta la variable `MK_APAGADO=1`. Con ella, `index.js` no monta ninguna ruta ni arranca `programarPlazos()`:

- `GET /health` responde `{ ok: true, estado: 'apagado' }`
- Todo lo demás redirige con **302** a `https://creatorsmanager.com` (o a `MK_APAGADO_DESTINO` si está puesta)
- No se cierran plazos, no se concilian pagos de Wompi, no se avisan vencimientos de planes, no se cierran campañas y no sale ningún correo ni WhatsApp

**Por qué una variable y no detener el servicio:** este repo autodespliega con cada push a `main`, y el Programa Creadoras recibe pushes casi a diario. Un servicio detenido volvía a arrancar con el siguiente push, y con él los procesos automáticos.

## Lo que sigue funcionando

- `r.mail.creatorsmanager.com` sigue conectado a este servicio. Los enlaces de correos viejos de Brevo caen aquí y se redirigen al sitio de la agencia.
- El Programa Creadoras (`apps/creadoras/marketplace.js`) lee las tablas `mk_*` directo de Supabase, sin pasar por este servicio. Su pestaña "[C] Creators Manager" muestra lo que ya existía, pero no entra nada nuevo.

## Qué queda en pausa

- La invitación por WhatsApp a las 145 creadoras de Ettos (`PLANTILLA-WHATSAPP-LISTAS.md`, migración `mk_054`)
- La plantilla `invitacion_creators_manager` del Programa Creadoras: **no mandarla**, porque lleva a un sitio que ya no es el marketplace

## Para volver a prenderlo

1. **En Railway, quitar los dominios del sitio de la agencia** (`creatorsmanager.com` y `www.creatorsmanager.com`) y volver a conectarlos a este servicio. También se puede usar otro dominio.
2. **Revisar `MK_BASE_URL`**: tiene que ser el dominio público por el que se va a servir. De ahí cuelgan los enlaces de los correos y el retorno de Wompi.
3. **Antes de quitar el interruptor, pensar en lo que venció durante el apagado.** Al prender, la primera pasada de `plazos.ejecutar()` (a los 2 minutos) cierra de golpe toda propuesta vencida y avisa los planes por vencer. Si no se quiere eso, arrancar primero con `MK_PLAZOS_AUTO=0`, revisar en el panel admin y después quitarla.
4. **Correr las migraciones `mk_*` que falten** en el SQL Editor de Supabase, si se agregaron después del apagado.
5. **Borrar `MK_APAGADO`** de las variables del servicio. Railway redespliega solo.
6. Comprobar `/health`: ya no dice `apagado`.
