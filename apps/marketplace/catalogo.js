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

/** Valores disponibles para poblar los selectores de filtro. */
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

/** Detalle de una creadora. */
router.get('/:id', async (req, res) => {
  try {
    const creadora = await db.getCreadoraCatalogo(req.params.id);
    if (!creadora) return res.status(404).json({ error: 'Creadora no encontrada' });

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
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
