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

/** Reemplaza la lista de creadoras de una colección. El orden es el contenido. */
router.put('/colecciones/:id/creadoras', async (req, res) => {
  try {
    const ids = Array.isArray(req.body.creadora_ids) ? req.body.creadora_ids : [];
    await db.ponerCreadorasEnColeccion(req.params.id, ids);
    res.json({ ok: true, total: ids.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
        busca: {
          que_vende: marca.busca_que_vende,
          canal: marca.busca_canal,
          tipo: marca.busca_tipo,
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
    const [borrador, publicada] = await Promise.all([
      db.getSeleccionDeMarca(req.params.marcaId, 'borrador'),
      db.getSeleccionDeMarca(req.params.marcaId, 'publicada'),
    ]);
    const cargar = async (sel) => sel ? { ...sel, items: await db.getItemsDeSeleccion(sel.id) } : null;
    res.json({ borrador: await cargar(borrador), publicada: await cargar(publicada) });
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

    let sel = await db.getSeleccionDeMarca(req.params.marcaId, 'borrador');
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
    if (!items.length) return res.status(400).json({ error: 'La selección está vacía' });

    const sinRazon = items.filter(i => !String(i.razon || '').trim());
    if (sinRazon.length) {
      return res.status(400).json({
        error: `Faltan ${sinRazon.length} razones. Cada creadora necesita su línea de "por qué ella" — sin eso es una grilla más.`,
      });
    }

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
