// Panel admin de la vitrina: colecciones, destacado y selección curada.
//
// Vive aparte de admin.js porque ese archivo ya lleva más de mil quinientas
// líneas y esto es un bloque con vida propia — todo lo que el equipo edita a
// mano para que el home de la marca no sea una grilla cruda.
//
// El hilo que conecta las tres cosas: NADA de esto se genera solo. Las
// colecciones las arma una persona, el destacado lo elige una persona, y la
// selección la propone el sistema pero la firma una persona. Lo que hace que
// una vitrina valga es que alguien eligió; automatizarla la devuelve al punto
// de partida, que es una grilla ordenada por un puntaje.
//
// Va montado detrás del mismo Basic Auth que el resto del admin.

const express = require('express');
const db = require('./db');
const { proponerSeleccion } = require('./aprendizaje');
const { catalogoEnriquecido, queTanCompleto } = require('./catalogo');
const seleccion = require('./seleccion');
const notificaciones = require('./notificaciones');

const router = express.Router();

/** El slug de una colección: estable, legible y sin sorpresas en una URL. */
const slugificar = (texto) =>
  String(texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);

// ── Colecciones ─────────────────────────────────────────────────────────────

/** Todas, incluidas las apagadas: el equipo tiene que poder volver a prenderlas. */
router.get('/colecciones', async (req, res) => {
  try {
    res.json(await db.getColecciones({ soloActivas: false }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/colecciones', async (req, res) => {
  try {
    const { nombre, descripcion, color, orden } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Falta el nombre' });

    const fila = await db.insertColeccion({
      slug: slugificar(nombre) || `coleccion-${Date.now()}`,
      nombre, descripcion: descripcion || null,
      color: color || '#2323F0',
      orden: Number(orden) || 0,
    });
    res.json(fila);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/colecciones/:id', async (req, res) => {
  try {
    const { nombre, descripcion, color, orden, activa } = req.body;
    const cambios = {};
    if (nombre !== undefined) cambios.nombre = nombre;
    if (descripcion !== undefined) cambios.descripcion = descripcion;
    if (color !== undefined) cambios.color = color;
    if (orden !== undefined) cambios.orden = Number(orden) || 0;
    if (activa !== undefined) cambios.activa = Boolean(activa);
    // El slug NO se regenera al renombrar: si alguien ya compartió el enlace
    // de una colección, renombrarla no puede romperlo.
    res.json(await db.updateColeccion(req.params.id, cambios));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/colecciones/:id', async (req, res) => {
  try {
    await db.borrarColeccion(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Reemplaza la lista de creadoras de una colección. El orden es el contenido.
 *
 * Acepta códigos (C-0316) además de ids. Nadie arma una colección pegando
 * ocho UUID: el código es lo que está impreso en la tarjeta del catálogo y en
 * la tabla de creadoras, así que es lo que la persona tiene a mano.
 *
 * Los códigos que no existen se devuelven en la respuesta en vez de ignorarse.
 * Una colección a la que le faltan tres perfiles y nadie avisó es peor que un
 * error: se publica incompleta y se descubre semanas después.
 */
router.put('/colecciones/:id/creadoras', async (req, res) => {
  try {
    const entrada = Array.isArray(req.body.creadora_ids) ? req.body.creadora_ids : [];
    const { ids, noEncontrados } = await resolverCreadoras(entrada);

    await db.ponerCreadorasEnColeccion(req.params.id, ids);
    res.json({ ok: true, total: ids.length, no_encontrados: noEncontrados });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Un UUID se reconoce por su forma; lo demás se busca como código. */
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolverCreadoras(entrada = []) {
  const limpias = entrada.map(x => String(x).trim()).filter(Boolean);
  const codigos = limpias.filter(x => !ES_UUID.test(x));

  let porCodigo = new Map();
  if (codigos.length) {
    const filas = await db.get('mk_creadoras', {
      select: 'id,codigo',
      codigo: `in.(${codigos.map(c => c.toUpperCase()).join(',')})`,
    });
    porCodigo = new Map(filas.map(f => [String(f.codigo).toUpperCase(), f.id]));
  }

  const ids = [];
  const noEncontrados = [];
  for (const x of limpias) {
    if (ES_UUID.test(x)) { ids.push(x); continue; }
    const id = porCodigo.get(x.toUpperCase());
    id ? ids.push(id) : noEncontrados.push(x);
  }
  // Sin repetidos: la tabla tiene un único por (colección, creadora) y un
  // código pegado dos veces reventaría la inserción entera.
  return { ids: [...new Set(ids)], noEncontrados };
}

// ── Destacado del hero ──────────────────────────────────────────────────────

router.get('/destacado', async (req, res) => {
  try {
    const d = await db.getDestacado();
    if (!d) return res.json(null);
    const muestra = await db.getMuestra(d.muestra_id);
    const creadora = muestra ? await db.getCreadoraCatalogo(muestra.creadora_id) : null;
    res.json({ ...d, muestra, creadora });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/destacado', async (req, res) => {
  try {
    const { muestra_id, titulo } = req.body;
    if (!muestra_id) return res.status(400).json({ error: 'Falta la pieza' });

    const muestra = await db.getMuestra(muestra_id);
    if (!muestra) return res.status(404).json({ error: 'Esa pieza no existe' });

    res.json(await db.ponerDestacado({
      muestra_id, titulo: titulo || null, creado_por: 'admin',
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Selección curada ────────────────────────────────────────────────────────

/**
 * La cola del equipo, ordenada por urgencia.
 *
 * Lo primero que se ve al abrir la pantalla: a quién hay que armarle la
 * selección y cuánto queda de las 24 horas que se le prometieron. Ordenada por
 * cualquier otra cosa, la promesa se incumple sin que nadie lo note.
 */
router.get('/solicitudes', async (req, res) => {
  try {
    const filas = await db.get('mk_seleccion', {
      select: '*', estado: 'in.(solicitada,borrador)', order: 'vence_at.asc',
    });
    if (!filas.length) return res.json({ solicitudes: [] });

    const marcas = await db.get('mk_marcas', {
      select: COLS_BUSQUEDA, id: `in.(${filas.map(f => f.marca_id).join(',')})`,
    });
    const porId = new Map(marcas.map(m => [m.id, m]));

    res.json({
      solicitudes: filas.map(f => ({
        ...f,
        tiempo: seleccion.tiempoRestante(f.vence_at),
        marca: porId.get(f.marca_id) || null,
      })),
      // Las vencidas van aparte: son las que ya incumplieron la promesa.
      vencidas: filas.filter(f => seleccion.tiempoRestante(f.vence_at).vencida).length,
    });
  } catch (e) {
    console.error('[admin/solicitudes]', e.message);
    res.status(500).json({ error: e.message });
  }
});

const COLS_BUSQUEDA = 'id,nombre_empresa,email,ciudad,busca_categorias,busca_otra,'
                    + 'busca_canal,busca_canal_otra,busca_audiencia,busca_ciudades,busca_tamano,'
                    + 'busca_presupuesto,busca_completado_at';

/**
 * El banco ya filtrado por lo que pidió la marca.
 *
 * Devuelve quiénes califican y quiénes no, con el motivo. Las que no califican
 * se mandan igual: quien arma la selección a veces sabe algo que el filtro no
 * —que una creadora de otro nicho encaja perfecto con ese producto— y
 * esconderlas le quitaría esa decisión.
 */
router.get('/solicitudes/:marcaId/candidatas', async (req, res) => {
  try {
    const marca = await db.getMarcaById(req.params.marcaId);
    if (!marca) return res.status(404).json({ error: 'Marca no encontrada' });

    const catalogo = await catalogoEnriquecido({});
    const evaluadas = catalogo.map(c => {
      const v = seleccion.califica(c, marca);
      return { ...c, califica: v.califica, motivos: v.motivos };
    });

    const califican = evaluadas.filter(c => c.califica);
    res.json({
      busca: {
        categorias: marca.busca_categorias, otra: marca.busca_otra,
        canal: marca.busca_canal, canal_otra: marca.busca_canal_otra,
        audiencia: marca.busca_audiencia,
        ciudades: marca.busca_ciudades, tamano: marca.busca_tamano,
        presupuesto: marca.busca_presupuesto,
      },
      califican: califican.length,
      total: evaluadas.length,
      // Primero las que califican, y dentro de ellas las más completas: es el
      // orden en que alguien las va a querer mirar.
      candidatas: [...califican, ...evaluadas.filter(c => !c.califica)]
        .slice(0, 60)
        .map(c => ({
          id: c.id, codigo: c.codigo, nombre_publico: c.nombre_publico,
          nicho: c.nicho, ciudad: c.ciudad, redes: c.redes,
          tarifa_min: c.tarifa_min, cumplimiento: c.cumplimiento,
          muestras: (c.muestras || []).slice(0, 1),
          califica: c.califica, motivos: c.motivos,
        })),
    });
  } catch (e) {
    console.error('[admin/candidatas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Propone un borrador de selección para una marca.
 *
 * No guarda nada: devuelve la propuesta para que la persona la mire. Guardar
 * al proponer llenaría la base de borradores que nadie abrió, y convertiría un
 * "a ver qué sugiere" en un compromiso.
 */
router.get('/seleccion/:marcaId/propuesta', async (req, res) => {
  try {
    const marca = await db.getMarcaById(req.params.marcaId);
    if (!marca) return res.status(404).json({ error: 'Marca no encontrada' });

    const [catalogo, decisiones] = await Promise.all([
      catalogoEnriquecido({}),
      db.getTriageDeMarca(req.params.marcaId),
    ]);

    const r = proponerSeleccion({
      catalogo,
      decisiones,
      queTanCompleto,
      cuantas: Number(req.query.cuantas) || 8,
    });

    res.json({
      marca: {
        id: marca.id,
        nombre_empresa: marca.nombre_empresa,
        // Lo que dijo en el registro. Es el único criterio que hay antes de
        // que empiece a triar, así que quien arma la selección tiene que
        // verlo aunque el motor todavía no lo use para puntuar.
        // `que_vende` y `tipo` eran del tanteo de mk_045; mk_053 los borró y
        // los reemplazó por las seis respuestas reales. Seguían acá devolviendo
        // `undefined` en silencio.
        busca: {
          categorias: marca.busca_categorias,
          otra: marca.busca_otra,
          canal: marca.busca_canal,
          canal_otra: marca.busca_canal_otra,
          presupuesto: marca.busca_presupuesto,
        },
      },
      ...r,
    });
  } catch (e) {
    console.error('[admin/seleccion/propuesta]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/** El borrador guardado de una marca, si lo hay, con lo publicado aparte. */
router.get('/seleccion/:marcaId', async (req, res) => {
  try {
    const [borrador, publicada, solicitada] = await Promise.all([
      db.getSeleccionDeMarca(req.params.marcaId, 'borrador'),
      db.getSeleccionDeMarca(req.params.marcaId, 'publicada'),
      db.getSeleccionDeMarca(req.params.marcaId, 'solicitada'),
    ]);
    const cargar = async (sel) => sel ? { ...sel, items: await db.getItemsDeSeleccion(sel.id) } : null;
    const abierta = borrador || solicitada;
    res.json({
      borrador: await cargar(borrador),
      publicada: await cargar(publicada),
      // Cuánto queda de las 24 horas, para poder mostrarlo mientras se arma.
      tiempo: abierta ? seleccion.tiempoRestante(abierta.vence_at) : null,
      atajos: seleccion.ATAJOS,
      minimo: seleccion.MINIMO, maximo: seleccion.MAXIMO, max_razon: seleccion.MAX_RAZON,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Guarda el borrador. Se puede llamar cuantas veces se quiera.
 *
 * Reemplaza el borrador anterior de esa marca en vez de acumular: mientras no
 * esté publicado no es historia, es trabajo en curso.
 */
router.post('/seleccion/:marcaId', async (req, res) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : [];
    if (!items.length) return res.status(400).json({ error: 'La selección está vacía' });

    // Si venía como solicitud del registro, pasa a borrador: alguien empezó.
    let sel = await db.getSeleccionDeMarca(req.params.marcaId, 'borrador');
    if (!sel) {
      const pedida = await db.getSeleccionDeMarca(req.params.marcaId, 'solicitada');
      if (pedida) {
        sel = await db.updateSeleccion(pedida.id, { estado: 'borrador' });
      }
    }
    if (!sel) {
      sel = await db.insertSeleccion({
        marca_id: req.params.marcaId,
        estado: 'borrador',
        decisiones_al_armar: Number(req.body.decisiones_al_armar) || 0,
        nota_interna: req.body.nota_interna || null,
        creada_por: 'admin',
      });
    } else if (req.body.nota_interna !== undefined) {
      await db.updateSeleccion(sel.id, { nota_interna: req.body.nota_interna });
    }

    await db.ponerItemsDeSeleccion(sel.id, items.map(it => ({
      creadora_id: it.creadora_id,
      razon: it.razon || null,
      razon_sugerida: it.razon_sugerida || null,
      puntaje: it.puntaje ?? null,
    })));

    res.json({ ok: true, seleccion_id: sel.id, total: items.length });
  } catch (e) {
    console.error('[admin/seleccion/guardar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Publica el borrador y avisa a la marca.
 *
 * Se exige una razón por cada creadora. Es la regla del producto: una
 * selección sin razones es una grilla más, y "seleccionadas por nuestro
 * equipo" sin decir por qué no le da a la marca nada que no tuviera ya.
 *
 * La publicada anterior se archiva, no se borra: sirve para ver qué se le
 * había propuesto antes a esa marca cuando llame a preguntar.
 */
router.post('/seleccion/:marcaId/publicar', async (req, res) => {
  try {
    const sel = await db.getSeleccionDeMarca(req.params.marcaId, 'borrador');
    if (!sel) return res.status(404).json({ error: 'No hay borrador que publicar' });


    const items = await db.getItemsDeSeleccion(sel.id);

    // Las mismas tres reglas que bloquean el botón, verificadas acá. El
    // handoff lo pide explícito y tiene razón: un bloqueo que solo vive en el
    // navegador no es una regla, es una sugerencia.
    const veredicto = seleccion.puedeEnviar(items);
    if (!veredicto.ok) return res.status(400).json({ error: veredicto.aviso });

    const anterior = await db.getSeleccionDeMarca(req.params.marcaId, 'publicada');
    if (anterior) await db.updateSeleccion(anterior.id, { estado: 'archivada' });

    await db.updateSeleccion(sel.id, {
      estado: 'publicada',
      publicada_at: new Date().toISOString(),
    });

    // El correo no puede tumbar la publicación: si falla, la selección ya está
    // arriba y la marca la ve al entrar.
    const marca = await db.getMarcaById(req.params.marcaId);
    notificaciones.seleccionLista({ marca, cuantas: items.length })
      .catch(e => console.error('[notif] seleccionLista:', e.message));

    res.json({ ok: true, publicadas: items.length });
  } catch (e) {
    console.error('[admin/seleccion/publicar]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
