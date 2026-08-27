// El perfil de la creadora: su progreso, y su media kit público.
//
// Dos rutas con permisos opuestos:
//
//   · `/api/creadoras/mi-perfil/*` — privada. Su círculo de completitud, su
//     nivel, sus logros y qué se desbloquea. Es la pantalla que la hace querer
//     terminar el perfil.
//   · `/c/:slug` — PÚBLICA y sin sesión. Lo que ella comparte en su bio.
//
// ⚠️ La página pública es el único sitio del sistema donde la identidad de una
// creadora sale sin pago retenido de por medio. Se sostiene sobre dos cosas y
// las dos importan:
//
//   1. La prende ELLA, no el equipo. Compartir su identidad es su decisión.
//   2. El slug lo elige ella. Si fuera derivable del código, cualquiera podría
//      recorrerlos y cruzar el catálogo ciego con identidades reales — que es
//      exactamente lo que el catálogo ciego existe para impedir.
//
// Y una tercera que se aplica acá: la página NO lleva el código del catálogo.
// Es su página, no su ficha.

const express = require('express');
const db = require('./db');
const perfil = require('./perfil');

const privado = express.Router();
const publico = express.Router();

/** Reúne lo que hace falta para medir un perfil. */
async function medir(creadora_id) {
  const [c, muestras, tarifas, redes, cumplimiento] = await Promise.all([
    db.getCreadoraCompleta(creadora_id),
    db.getMuestrasDeCreadora(creadora_id),
    db.getTarifasDeCreadora(creadora_id),
    db.getRedesDeCreadora(creadora_id).catch(() => []),
    db.getCumplimientoDeUna(creadora_id).catch(() => ({})),
  ]);
  if (!c) return null;

  const estado = perfil.completitud({
    piezas: muestras.length,
    redes: redes.length,
    tarifas: tarifas.length,
    tarifa_abierta: c.tarifa_abierta,
    foto_perfil_path: c.foto_perfil_path,
    bio_corta: c.bio_corta,
    metricas_estado: c.metricas_estado,
  });

  return { creadora: c, muestras, tarifas, redes, cumplimiento: cumplimiento || {}, estado };
}

/** Los cortes de nivel vigentes, con los del código como red de seguridad. */
async function nivelesVigentes() {
  const cfg = await db.getConfig().catch(() => ({}));
  const n = cfg?.niveles_creadora;
  return Array.isArray(n) && n.length ? n : perfil.NIVELES_POR_DEFECTO;
}

/**
 * Cuántas marcas la volvieron a contratar.
 *
 * Es el logro que más vale y el único que no sale de `mk_cumplimiento`: hay que
 * mirar si alguna marca aparece dos veces entre sus tratos cerrados.
 */
async function marcasQueRepitieron(creadora_id) {
  const tratos = await db.get('mk_tratos', {
    creadora_id: `eq.${creadora_id}`,
    estado: 'in.(aprobado,pagado,cerrado)',
    select: 'marca_id',
  }).catch(() => []);

  const veces = new Map();
  tratos.forEach(t => veces.set(t.marca_id, (veces.get(t.marca_id) || 0) + 1));
  return [...veces.values()].filter(n => n > 1).length;
}

// ── Lo que ve la creadora de sí misma ───────────────────────────────────────

privado.get('/', async (req, res) => {
  try {
    const datos = await medir(req.usuarioId);
    if (!datos) return res.status(404).json({ error: 'Perfil no encontrado' });

    const [niveles, repitieron] = await Promise.all([
      nivelesVigentes(),
      marcasQueRepitieron(req.usuarioId),
    ]);

    const nivel = perfil.nivelDe({
      cumplimiento: datos.cumplimiento,
      metricas_estado: datos.creadora.metricas_estado,
    }, niveles);

    res.json({
      completitud: datos.estado,
      nivel,
      logros: perfil.logrosDe({ ...datos.cumplimiento, marcas_que_repitieron: repitieron }),
      desbloqueos: perfil.desbloqueos(datos.estado),
      media_kit: {
        slug: datos.creadora.media_kit_slug,
        publico: datos.creadora.media_kit_publico === true,
        url: datos.creadora.media_kit_slug
          ? `${require('./config').base_url}/c/${datos.creadora.media_kit_slug}`
          : null,
      },
    });
  } catch (e) {
    console.error('[mi-perfil]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Cómo están sus precios contra los de creadoras parecidas.
 *
 * Es lo que se desbloquea al poner tarifas, y la razón por la que vale la pena
 * ponerlas: información que ella no tiene de ninguna otra forma. Se compara
 * contra el mismo entregable, que es lo único comparable — un reel y una
 * historia no son el mismo trabajo.
 *
 * Solo abre si ella puso las suyas. No es una condición artificial: sin sus
 * tarifas no hay nada contra qué compararla.
 */
privado.get('/precios', async (req, res) => {
  try {
    const mias = await db.getTarifasDeCreadora(req.usuarioId);
    if (!mias.length) {
      return res.status(409).json({
        error: 'Poné tus precios y acá te mostramos cómo están frente a creadoras como vos.',
      });
    }

    const todas = await db.get('mk_tarifas', { select: 'entregable,precio' });

    const comparacion = mias.map(m => {
      const pares = todas
        .filter(t => t.entregable === m.entregable && Number(t.precio) > 0)
        .map(t => Number(t.precio))
        .sort((a, b) => a - b);
      if (pares.length < 5) {
        // Con menos de cinco, una "mediana" es la opinión de tres personas.
        // Decirlo es mejor que dar un número que no se sostiene.
        return { entregable: m.entregable, precio: Number(m.precio), pocos: true, cuantas: pares.length };
      }

      const mediana = pares[Math.floor(pares.length / 2)];
      const menores = pares.filter(p => p < Number(m.precio)).length;
      return {
        entregable: m.entregable,
        precio: Number(m.precio),
        mediana,
        // En qué parte de la fila queda. Se dice sin juicio: cobrar poco no es
        // un error, y decirle "estás barata" es empujarla a subir sin saber
        // nada de su situación.
        percentil: Math.round(menores / pares.length * 100),
        cuantas: pares.length,
      };
    });

    res.json({ comparacion });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Prende o apaga su media kit, y elige su dirección.
 *
 * El slug se limpia acá y no en el navegador: el navegador es de quien lo usa.
 */
privado.post('/media-kit', async (req, res) => {
  try {
    const cambios = {};

    if (req.body.slug !== undefined) {
      const slug = String(req.body.slug || '').toLowerCase().trim()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

      if (slug.length < 3) {
        return res.status(400).json({ error: 'La dirección necesita al menos 3 letras.' });
      }
      // Reservadas: si alguien tomara "registro" o "precios", su página taparía
      // una del sitio.
      if (['registro', 'precios', 'admin', 'panel', 'api', 'terminos', 'c'].includes(slug)) {
        return res.status(400).json({ error: 'Esa dirección está reservada. Elegí otra.' });
      }

      const ocupada = await db.getUno('mk_creadoras', {
        media_kit_slug: `eq.${slug}`, select: 'id',
      });
      if (ocupada && ocupada.id !== req.usuarioId) {
        return res.status(409).json({ error: 'Esa dirección ya la tiene otra creadora.' });
      }
      cambios.media_kit_slug = slug;
    }

    if (req.body.publico !== undefined) {
      cambios.media_kit_publico = req.body.publico === true;
      cambios.media_kit_at = new Date().toISOString();
    }

    // Publicar sin dirección deja la página inalcanzable.
    const actual = await db.getCreadoraCompleta(req.usuarioId);
    const slugFinal = cambios.media_kit_slug ?? actual.media_kit_slug;
    if (cambios.media_kit_publico && !slugFinal) {
      return res.status(400).json({ error: 'Elegí primero la dirección de tu página.' });
    }

    await db.updateCreadora(req.usuarioId, cambios);
    res.json({
      ok: true,
      slug: slugFinal,
      publico: cambios.media_kit_publico ?? actual.media_kit_publico,
      url: slugFinal ? `${require('./config').base_url}/c/${slugFinal}` : null,
    });
  } catch (e) {
    console.error('[media-kit]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── La página pública ───────────────────────────────────────────────────────

/**
 * Los datos del media kit. Sin sesión.
 *
 * Un perfil apagado responde 404 y no 403: un 403 confirmaría que ese slug
 * existe, y con eso se puede ir probando hasta mapear el catálogo.
 *
 * Lo que sale acá es lo que ELLA decidió publicar. No sale su código del
 * catálogo: esta es su página, no su ficha, y el código es lo que permitiría
 * cruzarla con el catálogo ciego.
 */
publico.get('/:slug', async (req, res) => {
  try {
    const slug = String(req.params.slug || '').toLowerCase();
    const fila = await db.getUno('mk_creadoras', {
      media_kit_slug: `eq.${slug}`, select: 'id,media_kit_publico',
    });
    if (!fila || !fila.media_kit_publico) {
      return res.status(404).json({ error: 'No encontramos esa página' });
    }

    const datos = await medir(fila.id);
    const [niveles, repitieron] = await Promise.all([
      nivelesVigentes(),
      marcasQueRepitieron(fila.id),
    ]);

    const nivel = perfil.nivelDe({
      cumplimiento: datos.cumplimiento,
      metricas_estado: datos.creadora.metricas_estado,
    }, niveles);

    res.json({
      nombre: datos.creadora.nombre_publico,
      bio: datos.creadora.bio_corta,
      ciudad: datos.creadora.ciudad,
      nicho: datos.creadora.nicho,
      foto: datos.creadora.foto_perfil_path ? `/media/perfil/${fila.id}` : null,
      nivel: { nombre: nivel.nombre, cuadros: nivel.cuadros },
      verificada: datos.creadora.metricas_estado === 'verificado'
               || datos.creadora.metricas_estado === 'conectado',
      // Las vistas promedio sí; los seguidores exactos NO, ni siquiera acá.
      // Es el número que permite rastrear una cuenta, y publicarlo en su
      // propia página no lo vuelve menos rastreable.
      redes: (datos.redes || []).map(r => ({
        red: r.red, tier: r.tier, vistas: r.vistas_promedio, principal: r.es_principal,
      })),
      cumplimiento: datos.cumplimiento?.entregas
        ? {
            entregas: datos.cumplimiento.entregas,
            a_tiempo: datos.cumplimiento.entregas_a_tiempo,
          }
        : null,
      logros: perfil.logrosDe({ ...datos.cumplimiento, marcas_que_repitieron: repitieron })
        .filter(l => l.ganado),
      // Con marca de agua, igual que en el catálogo: esta página es pública y
      // es de donde más fácil se copia una pieza.
      piezas: (datos.muestras || []).slice(0, 8).map(m => ({
        id: m.id, tipo: m.tipo, poster: Boolean(m.poster_path),
      })),
      tarifa_desde: datos.creadora.tarifa_min || null,
    });
  } catch (e) {
    console.error('[mediakit]', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = { privado, publico };
