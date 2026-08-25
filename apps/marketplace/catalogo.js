// Router del catálogo de creadoras.
//
// Es la superficie más sensible del producto: aquí es donde la promesa de
// "identidad oculta" se cumple o se rompe. La protección no está en este
// archivo sino en db.getCatalogo(), que enumera columnas y nunca trae el
// handle. Este router solo agrega las muestras y los filtros.
//
// Requiere sesión de marca: en la Fase 1 no hay vista pública anónima.

const express = require('express');
const db = require('./db');
const { marcaAuth } = require('./auth');

const router = express.Router();

router.use(marcaAuth);

/**
 * ¿Puede esta marca abrir esta ficha?
 *
 * Devuelve el estado del plan y registra la vista si procede. Una ficha ya
 * abierta este mes no vuelve a contar: la llave de mk_fichas_vistas es
 * (marca, creadora, mes).
 */
/**
 * Registra que esta marca abrió esta ficha.
 *
 * Desde mk_022 el catálogo NO se limita: se abre completo en todos los planes.
 * Limitar la búsqueda no protegía nada —lo que se ve se anota— e impedía que
 * la marca encontrara a la creadora por la que valdría la pena pagar. El tope
 * vive ahora donde está el valor: al enviar la propuesta.
 *
 * El registro se mantiene porque es lo que alimenta el "quién miró tu perfil"
 * del portal de la creadora.
 */
async function anotarVista(marca_id, creadora_id) {
  try {
    await db.registrarFichaVista(marca_id, creadora_id);
  } catch (e) {
    // Que falle el conteo no puede impedir ver una ficha.
    console.error('[catalogo] no se pudo anotar la vista:', e.message);
  }
}

router.get('/filtros', async (req, res) => {
  try {
    const cfg = await db.getConfig();
    res.json({
      // Taxonomía de dos niveles: la marca filtra por categoría (amplio) o
      // afina por subnicho.
      categorias: cfg.nichos || [],
      paises: cfg.paises || [],
      departamentos_co: cfg.departamentos_co || [],
      entregables: cfg.entregables || [],
      rangos_alcance: (cfg.rangos_alcance || []).map(r => r.clave),
      niveles_tarifa: Object.entries(cfg.niveles_tarifa || {}).map(([clave, n]) => ({
        clave,
        etiqueta: n.etiqueta || clave,
        min: n.min,
        max: n.max,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Listado con filtros. */
router.get('/', async (req, res) => {
  try {
    const { categoria, nicho, rango_alcance, nivel_tarifa, pais, departamento,
            ciudad, presupuesto_max, entregable } = req.query;
    let creadoras = await db.getCatalogo({
      categoria, nicho, rango_alcance, nivel_tarifa, pais, departamento, ciudad, presupuesto_max,
    });

    const ids = creadoras.map(c => c.id);
    // Las muestras se adjuntan como ids: el binario se pide después a /media/:id.
    const [muestras, tarifas] = await Promise.all([
      db.getMuestrasDeVarias(ids),
      db.getTarifasDeVarias(ids),
    ]);

    let resultado = creadoras.map(c => ({
      ...c,
      muestras: (muestras[c.id] || []).map(m => ({ id: m.id, tipo: m.tipo })),
      tarifas: (tarifas[c.id] || []).map(t => ({ entregable: t.entregable, precio: t.precio })),
    }));

    // "Quiero un reel": se filtra en memoria porque depende de la tabla de
    // tarifas, no de una columna de mk_creadoras.
    if (entregable) {
      resultado = resultado.filter(c => c.tarifas.some(t => t.entregable === entregable));
    }

    res.json({ total: resultado.length, creadoras: resultado });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Detalle de una creadora.
 *
 * Abrir una ficha es lo que consume el plan: el catálogo se ve completo en
 * todos, lo que se limita es entrar a ver las piezas y las tarifas. Así el
 * demo no parece pobre —la marca ve que el banco es grande— y el muro aparece
 * justo cuando ya entendió el valor.
 */
router.get('/:id', async (req, res) => {
  try {
    const creadora = await db.getCreadoraCatalogo(req.params.id);
    if (!creadora) return res.status(404).json({ error: 'Creadora no encontrada' });

    await anotarVista(req.usuarioId, req.params.id);

    const [muestras, tarifas] = await Promise.all([
      db.getMuestrasDeCreadora(creadora.id),
      db.getTarifasDeCreadora(creadora.id),
    ]);

    res.json({
      ...creadora,
      muestras: muestras.map(m => ({ id: m.id, tipo: m.tipo })),
      // Solo las que ella tiene publicadas.
      tarifas: tarifas
        .filter(t => t.activo !== false)
        .map(t => ({ entregable: t.entregable, precio: t.precio })),
      plan: limite.plan,
      fichas_vistas: limite.vistas,
      fichas_tope: limite.tope,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
