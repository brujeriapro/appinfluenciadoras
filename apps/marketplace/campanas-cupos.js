// Rutas de las campañas con cupos.
//
// El modo de contratar a varias de una: un brief, N cupos, invitaciones que
// las creadoras aceptan o pasan, y confirmación de la marca hasta llenar.
//
// Las reglas viven en cupos.js, que es puro y está probado. Acá solo se leen
// datos, se pregunta, y se escribe lo que la respuesta diga. Esa separación es
// lo que permite probar "no se confirma por encima de los cupos" sin levantar
// un servidor ni una base.
//
// Va montado dos veces con auth distinta: lo de la marca bajo marcaAuth y lo
// de la creadora bajo creadoraAuth. Por eso son dos routers.

const express = require('express');
const db = require('./db');
const cupos = require('./cupos');
const maquina = require('./tratos');
const notificaciones = require('./notificaciones');
// Se pide en caliente para no cerrar el ciclo de require con marcas.js.
const topeDePropuestas = (id) => require('./marcas').topeDePropuestas(id);

const deMarca = express.Router();
const deCreadora = express.Router();

/**
 * Las invitaciones de campañas ANTERIORES de esta marca.
 *
 * Se excluye la campaña actual: dentro de la misma, quien ya está invitada se
 * filtra por otro camino, y contarla acá la haría parecer reinvitable gratis.
 */
async function historialDeMarca(marca_id, exceptoCampana) {
  const campanas = await db.get('mk_campanas', { marca_id: `eq.${marca_id}`, select: 'id' });
  const otras = campanas.map(c => c.id).filter(id => id !== exceptoCampana);
  if (!otras.length) return [];
  return db.get('mk_campana_invitacion', {
    campana_id: `in.(${otras.join(',')})`, select: 'creadora_id,estado',
  });
}

/** Carga la campaña y su estado calculado. Devuelve null si no es de la marca. */
async function cargar(campana_id, marca_id) {
  const campana = await db.getCampana(campana_id);
  if (!campana) return null;
  if (marca_id && campana.marca_id !== marca_id) return null;

  const invitaciones = await db.getInvitacionesDeCampana(campana_id);
  return { campana, invitaciones, estado: cupos.estadoDeCampana(campana, invitaciones) };
}

// ── Lado marca ──────────────────────────────────────────────────────────────

/**
 * Crea una campaña con cupos.
 *
 * Distinta de la campaña plantilla que ya existía: acá el monto es fijo para
 * todas y hay un número de cupos. Se valida fuerte porque este brief lo van a
 * leer diez personas que decidirán si aceptan un trabajo con él.
 */
deMarca.post('/', async (req, res) => {
  try {
    const {
      nombre, brief_base, entregables, producto, exclusividad,
      cupos: cuantos, monto_creadora, fecha_entrega, horas_limite,
    } = req.body;

    if (!nombre) return res.status(400).json({ error: 'La campaña necesita un nombre' });
    if (!brief_base || String(brief_base).trim().length < 20) {
      return res.status(400).json({
        error: 'Escribí el brief. Las creadoras deciden si aceptan leyendo esto.',
      });
    }
    if (!Array.isArray(entregables) || !entregables.length) {
      return res.status(400).json({ error: 'Marcá al menos un entregable' });
    }

    const n = Number(cuantos);
    if (!Number.isInteger(n) || n < 1) {
      return res.status(400).json({ error: '¿Cuántas creadoras buscás? Tiene que ser al menos una.' });
    }
    if (!Number(monto_creadora)) {
      return res.status(400).json({ error: 'Falta cuánto le pagás a cada creadora' });
    }
    if (!fecha_entrega) {
      return res.status(400).json({ error: 'Falta la fecha de entrega' });
    }

    // El plazo se guarda como una fecha concreta, no como "72 horas": si se
    // guardara la duración, cambiar la campaña después movería el plazo de
    // quienes ya fueron invitadas.
    const horas = cupos.HORAS_LIMITE.includes(Number(horas_limite))
      ? Number(horas_limite)
      : cupos.HORAS_LIMITE[0];

    const campana = await db.insertCampana({
      marca_id: req.usuarioId,
      nombre,
      brief_base,
      entregables,
      producto: producto || null,
      exclusividad: exclusividad || null,
      cupos: n,
      monto_creadora: Number(monto_creadora),
      fecha_entrega,
      fecha_limite_respuesta: new Date(Date.now() + horas * 3600_000).toISOString(),
      // El tope total se deriva: es lo que se va a gastar si se llenan los
      // cupos. Guardarlo evita recalcularlo en cada pantalla.
      tope_total: Number(monto_creadora) * n,
      tope_por_creadora: Number(monto_creadora),
      estado: 'activa',
    });

    res.json({ ok: true, campana });
  } catch (e) {
    console.error('[cupos/crear]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Cómo va: quiénes aceptaron, quiénes faltan, cuántos cupos quedan. */
deMarca.get('/:id', async (req, res) => {
  try {
    const datos = await cargar(req.params.id, req.usuarioId);
    if (!datos) return res.status(404).json({ error: 'Campaña no encontrada' });

    // Se adjunta el alias de cada creadora para no obligar al panel a cruzar
    // contra el catálogo, que puede no estar cargado en esta pantalla.
    const ids = datos.invitaciones.map(i => i.creadora_id);
    const perfiles = ids.length
      ? await db.get('mk_creadoras', {
          select: 'id,codigo,nombre_publico,ciudad,nicho',
          id: `in.(${ids.join(',')})`,
        })
      : [];
    const porId = new Map(perfiles.map(p => [p.id, p]));

    res.json({
      campana: datos.campana,
      estado: datos.estado,
      invitaciones: datos.invitaciones.map(i => ({
        ...i,
        creadora: porId.get(i.creadora_id) || null,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Invita a una tanda de creadoras.
 *
 * **Cada una consume una propuesta del plan.** Es la regla que sostiene el
 * modelo de cobro y por eso se verifica antes de escribir nada: sin ella el
 * plan gratuito sería ilimitado, bastaría con hacer una campaña e invitar a
 * doscientas.
 */
deMarca.post('/:id/invitar', async (req, res) => {
  try {
    const datos = await cargar(req.params.id, req.usuarioId);
    if (!datos) return res.status(404).json({ error: 'Campaña no encontrada' });

    const [plan, historial] = await Promise.all([
      topeDePropuestas(req.usuarioId),
      // Campañas anteriores de ESTA marca: de ahí sale a quién se reinvita sin
      // volver a cobrarle una propuesta.
      historialDeMarca(req.usuarioId, datos.campana.id),
    ]);

    const veredicto = cupos.puedeInvitar({
      campana: datos.campana,
      yaInvitadas: datos.invitaciones,
      nuevas: Array.isArray(req.body.creadora_ids) ? req.body.creadora_ids : [],
      plan: { tope: plan.tope, enviadas: plan.enviadas || 0 },
      historial,
    });

    if (!veredicto.ok) {
      // 402 y no 400 cuando el problema es el plan: el panel lo usa para
      // levantar el muro de suscripción en vez de mostrar un error suelto.
      return res.status(veredicto.sinPropuestas ? 402 : 400).json({ error: veredicto.motivo });
    }

    const filas = await db.insertInvitaciones(
      veredicto.porInvitar.map(creadora_id => ({
        campana_id: datos.campana.id, creadora_id, estado: 'invitada',
      }))
    );

    const marca = await db.getMarcaById(req.usuarioId);
    // Los correos no pueden tumbar la invitación: ya está guardada, y una
    // creadora que no recibió el correo igual la ve al entrar a su portal.
    Promise.all(veredicto.porInvitar.map(async (id) => {
      const contacto = await db.getContactoCreadora(id).catch(() => null);
      if (contacto?.email) {
        return notificaciones.invitacionACampana({
          campana: datos.campana, marca, contacto, estado: datos.estado,
        });
      }
    })).catch(e => console.error('[notif] invitacionACampana:', e.message));

    res.json({
      ok: true,
      invitadas: veredicto.porInvitar.length,
      consumio: veredicto.consume,
      // Las que entraron sin gastar propuesta, para poder decírselo a la marca
      // en vez de que solo note que la cuenta no cuadra.
      sin_costo: (veredicto.sinCosto || []).length,
      ignoradas: (req.body.creadora_ids || []).length - veredicto.porInvitar.length,
      invitaciones: filas,
    });
  } catch (e) {
    console.error('[cupos/invitar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Confirma a una creadora que aceptó. De acá nace el trato.
 *
 * El trato se crea con el flujo normal —el mismo estado inicial, la misma
 * comisión congelada— porque a partir de acá una campaña con cupos no se
 * distingue de una propuesta individual. Un segundo camino para lo mismo es un
 * segundo sitio donde el escrow se puede romper.
 */
deMarca.post('/:id/confirmar/:invitacionId', async (req, res) => {
  try {
    const datos = await cargar(req.params.id, req.usuarioId);
    if (!datos) return res.status(404).json({ error: 'Campaña no encontrada' });

    const invitacion = datos.invitaciones.find(i => i.id === req.params.invitacionId);
    const veredicto = cupos.puedeConfirmar({ invitacion, estado: datos.estado });
    if (!veredicto.ok) return res.status(409).json({ error: veredicto.motivo });

    const c = datos.campana;
    const { trato } = await maquina.crearTrato({
      marca_id: req.usuarioId,
      creadora_id: invitacion.creadora_id,
      campana_id: c.id,
      invitacion_id: invitacion.id,
      brief: c.brief_base,
      entregables: (c.entregables || []).join(', '),
      monto: Number(c.monto_creadora),
      fecha_entrega_esperada: c.fecha_entrega,
      producto: c.producto,
      exclusividad: c.exclusividad,
    });

    await db.actualizarInvitacion(invitacion.id, {
      estado: 'confirmada',
      confirmada_at: new Date().toISOString(),
      trato_id: trato.id,
    });

    res.json({ ok: true, trato, libres: datos.estado.libres - 1 });
  } catch (e) {
    console.error('[cupos/confirmar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** Cierra la campaña con las que tenga. */
deMarca.post('/:id/cerrar', async (req, res) => {
  try {
    const datos = await cargar(req.params.id, req.usuarioId);
    if (!datos) return res.status(404).json({ error: 'Campaña no encontrada' });

    await db.updateCampana(datos.campana.id, { estado: 'cerrada' });
    await avisarCuposLlenos(datos);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * A quienes aceptaron y no fueron elegidas se les dice "cupos completos".
 *
 * Nunca un rechazo. Que no la eligieran no dice nada de ella, y presentarlo
 * como un "no" la castiga por haber aceptado. Es la misma regla que sostiene
 * que en este producto no exista sello negativo.
 */
async function avisarCuposLlenos(datos) {
  const enEspera = datos.invitaciones.filter(i => i.estado === 'acepto');
  for (const i of enEspera) {
    await db.actualizarInvitacion(i.id, { estado: 'cupos_llenos' });
    const contacto = await db.getContactoCreadora(i.creadora_id).catch(() => null);
    if (contacto?.email) {
      notificaciones.cuposCompletos({ campana: datos.campana, contacto })
        .catch(e => console.error('[notif] cuposCompletos:', e.message));
    }
  }
  return enEspera.length;
}

// ── Lado creadora ───────────────────────────────────────────────────────────

/** Las campañas a las que la invitaron y siguen abiertas. */
deCreadora.get('/', async (req, res) => {
  try {
    const invitaciones = await db.getInvitacionesDeCreadora(
      req.usuarioId, ['invitada', 'acepto', 'confirmada', 'cupos_llenos']
    );
    if (!invitaciones.length) return res.json([]);

    const campanas = await db.get('mk_campanas', {
      select: '*', id: `in.(${invitaciones.map(i => i.campana_id).join(',')})`,
    });
    const porId = new Map(campanas.map(c => [c.id, c]));

    const marcas = await db.get('mk_marcas', {
      select: 'id,nombre_empresa',
      id: `in.(${[...new Set(campanas.map(c => c.marca_id))].join(',')})`,
    });
    const marcaPorId = new Map(marcas.map(m => [m.id, m]));

    res.json(invitaciones.map(i => {
      const c = porId.get(i.campana_id);
      return {
        invitacion_id: i.id,
        estado: i.estado,
        invitada_at: i.invitada_at,
        campana: c && {
          id: c.id, nombre: c.nombre, brief: c.brief_base, entregables: c.entregables,
          producto: c.producto, exclusividad: c.exclusividad,
          monto: c.monto_creadora, cupos: c.cupos,
          fecha_entrega: c.fecha_entrega,
          fecha_limite_respuesta: c.fecha_limite_respuesta,
          marca: marcaPorId.get(c.marca_id)?.nombre_empresa || null,
        },
      };
    }).filter(x => x.campana));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Aceptar o pasar. */
deCreadora.post('/:invitacionId/responder', async (req, res) => {
  try {
    const invitacion = await db.getInvitacion(req.params.invitacionId);
    if (!invitacion || invitacion.creadora_id !== req.usuarioId) {
      return res.status(404).json({ error: 'Invitación no encontrada' });
    }

    const acepta = req.body.acepta === true;
    const datos = await cargar(invitacion.campana_id, null);
    const veredicto = cupos.puedeResponder({
      invitacion, campana: datos.campana, estado: datos.estado,
    });
    if (!veredicto.ok) return res.status(409).json({ error: veredicto.motivo });

    await db.actualizarInvitacion(invitacion.id, {
      estado: acepta ? 'acepto' : 'paso',
      respondida_at: new Date().toISOString(),
      nota: req.body.nota || null,
    });

    if (acepta) {
      const marca = await db.getMarcaById(datos.campana.marca_id).catch(() => null);
      const creadora = await db.getCreadoraCatalogo(req.usuarioId).catch(() => null);
      if (marca?.email) {
        notificaciones.aceptoLaCampana({ campana: datos.campana, marca, creadora })
          .catch(e => console.error('[notif] aceptoLaCampana:', e.message));
      }
    }

    res.json({
      ok: true,
      estado: acepta ? 'acepto' : 'paso',
      // Se le dice de una si los cupos ya están llenos, para que no espere
      // pensando que el trabajo es suyo. No es un no: la marca todavía puede
      // ampliar los cupos.
      aviso: acepta && veredicto.avisoCuposLlenos
        ? 'Aceptaste, pero los cupos de esta campaña ya están llenos. La marca puede ampliarlos; te avisamos si te elige.'
        : null,
    });
  } catch (e) {
    console.error('[cupos/responder]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Vencimiento ─────────────────────────────────────────────────────────────

/**
 * Cierra las invitaciones cuyo plazo venció.
 *
 * Corre en el mismo reloj que los plazos de los tratos. Con `simulacro` dice
 * qué haría sin tocar nada — conviene mirarlo así la primera vez, porque de
 * acá en adelante esto le cierra la puerta a gente sin que nadie lo mire.
 */
async function cerrarVencidas({ simulacro = false, ahora = new Date() } = {}) {
  const abiertas = await db.getInvitacionesPorVencer();
  if (!abiertas.length) return { revisadas: 0, vencidas: 0, cupos_llenos: 0, campanas: 0 };

  const porCampana = new Map();
  for (const i of abiertas) {
    if (!porCampana.has(i.campana_id)) porCampana.set(i.campana_id, []);
    porCampana.get(i.campana_id).push(i);
  }

  let vencidas = 0, llenos = 0, cerradas = 0;
  for (const [campana_id, invitaciones] of porCampana) {
    const campana = await db.getCampana(campana_id);
    if (!campana?.fecha_limite_respuesta) continue;
    if (new Date(campana.fecha_limite_respuesta) > ahora) continue;

    // El estado se calcula con TODAS las invitaciones de la campaña, no solo
    // las abiertas: las confirmadas son las que ocupan los cupos.
    const todas = await db.getInvitacionesDeCampana(campana_id);
    const estado = cupos.estadoDeCampana(campana, todas, ahora);
    const plan = cupos.alVencerse({ campana, invitaciones: todas, estado });

    for (const c of plan.cambios) {
      c.estado === 'vencida' ? vencidas++ : llenos++;
      if (simulacro) continue;

      await db.actualizarInvitacion(c.id, { estado: c.estado });
      if (c.estado === 'cupos_llenos') {
        const contacto = await db.getContactoCreadora(c.creadora_id).catch(() => null);
        if (contacto?.email) {
          notificaciones.cuposCompletos({ campana, contacto })
            .catch(e => console.error('[notif] cuposCompletos:', e.message));
        }
      }
    }

    if (plan.cerrar && campana.estado !== 'cerrada') {
      cerradas++;
      if (!simulacro) await db.updateCampana(campana_id, { estado: 'cerrada' });
    }
  }

  return { revisadas: abiertas.length, vencidas, cupos_llenos: llenos, campanas: cerradas, simulacro };
}

module.exports = { deMarca, deCreadora, cerrarVencidas };
