// Datos de la landing pública.
//
// Único endpoint del marketplace sin autenticación. Existe para que las cifras
// de la landing (comisiones, banco de creadoras, métricas del hero) dejen de
// estar escritas a mano en el HTML: son datos de negocio y cambian.
//
// ⚠️ El handoff de diseño muestra handles reales en las tarjetas del banco
// (@VALERIARIZOS, @LACHICASKIN...). Eso choca de frente con la promesa del
// producto: el username NO se muestra nunca, ni siquiera en la vitrina pública.
// Aquí se sirve `nombre_publico` (el alias de catálogo) en ese mismo lugar, con
// el mismo formato visual. Las 8 tarjetas del diseño son ficticias y se usan
// como demo mientras no haya perfiles curados.

const express = require('express');
const db = require('./db');

const router = express.Router();

// Tarjetas del handoff de diseño. Se sirven tal cual mientras el catálogo real
// esté vacío, marcadas con demo:true para que el panel admin lo advierta.
const BANCO_DEMO = [
  { nombre_publico: 'VALERIARIZOS',  nicho: ['rizos'],           ciudad: 'MEDELLÍN',  rango_alcance: '48K',  engagement_pct: 7.2,  entregable_tipico: 'REEL+STORY', tarifa_min: 680000,  color: 'lima' },
  { nombre_publico: 'LACHICASKIN',   nicho: ['skincare'],        ciudad: 'BOGOTÁ',    rango_alcance: '112K', engagement_pct: 5.4,  entregable_tipico: 'TIKTOK X2',  tarifa_min: 1250000, color: 'magenta' },
  { nombre_publico: 'MAKEUPSOFI',    nicho: ['maquillaje'],      ciudad: 'CALI',      rango_alcance: '23K',  engagement_pct: 9.1,  entregable_tipico: 'RESEÑA UGC', tarifa_min: 420000,  color: 'blanco' },
  { nombre_publico: 'DANISALONN',    nicho: ['peluqueria'],      ciudad: 'B/QUILLA',  rango_alcance: '76K',  engagement_pct: 6.3,  entregable_tipico: 'REEL+UGC',   tarifa_min: 890000,  color: 'azul' },
  { nombre_publico: 'JULIAGLOSS',    nicho: ['unas'],            ciudad: 'PEREIRA',   rango_alcance: '9.8K', engagement_pct: 11.4, entregable_tipico: 'TIKTOK',     tarifa_min: 240000,  color: 'lima' },
  { nombre_publico: 'CAMIHAIRCARE',  nicho: ['cuidado capilar'], ciudad: 'MEDELLÍN',  rango_alcance: '154K', engagement_pct: 4.8,  entregable_tipico: 'REEL+STORY', tarifa_min: 1480000, color: 'blanco' },
  { nombre_publico: 'LUZCURLS',      nicho: ['rizos'],           ciudad: 'CARTAGENA', rango_alcance: '62K',  engagement_pct: 6.9,  entregable_tipico: 'REEL',       tarifa_min: 740000,  color: 'magenta' },
  { nombre_publico: 'SARABEAUTYLAB', nicho: ['skincare'],        ciudad: 'B/MANGA',   rango_alcance: '31K',  engagement_pct: 8.0,  entregable_tipico: 'RESEÑA UGC', tarifa_min: 520000,  color: 'azul' },
];

// Los colores rotan en este orden en el carrusel del diseño.
const ROTACION_COLOR = ['lima', 'magenta', 'blanco', 'azul', 'lima', 'blanco', 'magenta', 'azul'];

router.get('/', async (req, res) => {
  try {
    const cfg = await db.getConfig();

    let banco = [];
    let demo = true;
    try {
      const creadoras = await db.getCatalogo();
      if (creadoras.length >= 4) {
        demo = false;
        banco = creadoras.slice(0, 8).map((c, i) => ({
          nombre_publico: c.nombre_publico,
          nicho: c.nicho,
          ciudad: (c.ciudad || '').toUpperCase(),
          rango_alcance: c.rango_alcance,
          engagement_pct: c.engagement_pct,
          entregable_tipico: c.entregable_tipico,
          tarifa_min: c.tarifa_min,
          color: ROTACION_COLOR[i % ROTACION_COLOR.length],
        }));
      }
    } catch (e) {
      console.warn('[landing] catálogo no disponible, se usa la demo:', e.message);
    }

    if (demo) banco = BANCO_DEMO;

    res.json({
      comision_marca_pct: Number(cfg.comision_marca_pct ?? 12),
      comision_creadora_pct: Number(cfg.comision_creadora_pct ?? 8),
      metricas: cfg.landing_metricas || {},
      banco,
      demo,
    });
  } catch (e) {
    console.error('[landing]', e.message);
    // La landing nunca debe caerse por un problema de datos: devuelve la demo.
    res.json({
      comision_marca_pct: 12,
      comision_creadora_pct: 8,
      metricas: {},
      banco: BANCO_DEMO,
      demo: true,
    });
  }
});

module.exports = router;
module.exports.BANCO_DEMO = BANCO_DEMO;
