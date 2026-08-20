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
      nichos: cfg.nichos || [],
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
    const { nicho, rango_alcance, nivel_tarifa, ciudad } = req.query;
    const creadoras = await db.getCatalogo({ nicho, rango_alcance, nivel_tarifa, ciudad });

    // Las muestras se adjuntan como ids: el binario se pide después a /media/:id.
    const muestras = await db.getMuestrasDeVarias(creadoras.map(c => c.id));
    const conMuestras = creadoras.map(c => ({
      ...c,
      muestras: (muestras[c.id] || []).map(m => ({ id: m.id, tipo: m.tipo })),
    }));

    res.json({ total: conMuestras.length, creadoras: conMuestras });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Detalle de una creadora. */
router.get('/:id', async (req, res) => {
  try {
    const creadora = await db.getCreadoraCatalogo(req.params.id);
    if (!creadora) return res.status(404).json({ error: 'Creadora no encontrada' });

    const muestras = await db.getMuestrasDeCreadora(creadora.id);
    res.json({
      ...creadora,
      muestras: muestras.map(m => ({ id: m.id, tipo: m.tipo })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
