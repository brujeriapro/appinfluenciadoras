// Panel admin de Creadores.app — para el equipo que opera el marketplace.
//
// Es el único lugar del sistema donde:
//   - se ve la identidad real de las creadoras,
//   - se registran los movimientos de plata (entrada y salida del escrow),
//   - se decide qué perfil entra al catálogo.
//
// Todo el router va detrás de Basic Auth, montado en index.js.

const express = require('express');
const fetch = require('node-fetch');
const crypto = require('crypto');
const db = require('./db');
const config = require('./config');
const maquina = require('./tratos');
const { calcularTrato, rangoAlcance, nivelPorTarifa } = require('./comisiones');
const notificaciones = require('./notificaciones');

const router = express.Router();

// ── Resumen ─────────────────────────────────────────────────────────────────

/**
 * Tablero de control: en qué estado está cada trato, cuánta plata hay retenida,
 * cuánta comisión se ha causado y qué tratos llevan demasiado tiempo quietos.
 */
router.get('/resumen', async (req, res) => {
  try {
    const [tratos, pagos] = await Promise.all([db.getTratosAdmin(), db.getTodosLosPagos()]);

    const porEstado = {};
    tratos.forEach(t => { porEstado[t.estado] = (porEstado[t.estado] || 0) + 1; });

    const entradasPorTrato = {};
    const salidasPorTrato = {};
    pagos.forEach(p => {
      const destino = p.direccion === 'entrada' ? entradasPorTrato : salidasPorTrato;
      destino[p.trato_id] = (destino[p.trato_id] || 0) + Number(p.monto || 0);
    });

    // Dinero en custodia: lo que entró y todavía no ha salido.
    let retenido = 0;
    Object.entries(entradasPorTrato).forEach(([tratoId, entrada]) => {
      retenido += Math.max(0, entrada - (salidasPorTrato[tratoId] || 0));
    });

    // La comisión se cuenta como causada cuando el trato llegó a pagado o cerrado:
    // antes de eso todavía puede cancelarse y devolverse.
    const cerrados = tratos.filter(t => ['pagado', 'cerrado'].includes(t.estado));
    const comisionCausada = cerrados.reduce((s, t) => s + Number(t.comision_total_valor || 0), 0);

    const mesActual = new Date().toISOString().slice(0, 7);
    const comisionMes = cerrados
      .filter(t => String(t.fecha_pago_creadora || t.fecha_cierre || '').startsWith(mesActual))
      .reduce((s, t) => s + Number(t.comision_total_valor || 0), 0);

    // Tratos estancados: más de 7 días en un estado que espera acción humana.
    const hace7dias = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const estancados = tratos
      .filter(t => !maquina.esTerminal(t.estado))
      .filter(t => new Date(t.updated_at || t.created_at).getTime() < hace7dias)
      .map(t => ({
        id: t.id,
        codigo: t.codigo,
        estado: t.estado,
        etiqueta: maquina.ETIQUETAS[t.estado],
        marca: t.mk_marcas?.nombre_empresa,
        creadora: t.mk_creadoras?.nombre_publico,
        dias: Math.floor((Date.now() - new Date(t.updated_at || t.created_at)) / 86400000),
      }));

    res.json({
      total_tratos: tratos.length,
      por_estado: porEstado,
      dinero_retenido: retenido,
      comision_causada_total: comisionCausada,
      comision_mes_actual: comisionMes,
      tratos_activos: tratos.filter(t => !maquina.esTerminal(t.estado)).length,
      estancados,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Tratos ──────────────────────────────────────────────────────────────────

router.get('/tratos', async (req, res) => {
  try {
    res.json(await db.getTratosAdmin({ estado: req.query.estado }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/tratos/:id', async (req, res) => {
  try {
    const trato = await db.getTratoById(req.params.id);
    if (!trato) return res.status(404).json({ error: 'Trato no encontrado' });
    const [eventos, pagos, entregas, marca, contacto] = await Promise.all([
      db.getEventosDeTrato(trato.id),
      db.getPagosDeTrato(trato.id),
      db.getEntregasDeTrato(trato.id),
      db.getMarcaById(trato.marca_id),
      db.getContactoCreadora(trato.creadora_id),
    ]);
    res.json({ ...trato, marca, contacto, eventos, pagos, entregas });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Registra el pago que hizo la marca y marca el dinero como retenido.
 * Este es el momento en que se revela el contacto entre las partes.
 */
router.post('/tratos/:id/pago-entrada', async (req, res) => {
  try {
    const { monto, metodo, referencia, fecha, notas } = req.body;
    const trato = await db.getTratoById(req.params.id);
    if (!trato) return res.status(404).json({ error: 'Trato no encontrado' });

    await db.insertPago({
      trato_id: trato.id,
      direccion: 'entrada',
      monto: Number(monto ?? trato.total_a_pagar_marca),
      metodo: metodo || 'transferencia',
      referencia: referencia || null,
      fecha: fecha || new Date().toISOString().split('T')[0],
      registrado_por: 'admin',
      notas: notas || null,
    });

    const actualizado = await maquina.aplicarTransicion(trato, 'pago_retenido', 'admin', {
      nota: `Pago de la marca registrado${referencia ? ` (ref. ${referencia})` : ''}`,
    });

    const [marca, contacto] = await Promise.all([
      db.getMarcaById(trato.marca_id),
      db.getContactoCreadora(trato.creadora_id),
    ]);
    notificaciones.pagoRetenido({ trato: actualizado, marca, contacto }).catch(e =>
      console.error('[notif] pagoRetenido:', e.message)
    );

    res.json({ ok: true, trato: actualizado });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

/** Registra el pago hecho a la creadora y cierra el ciclo de plata. */
router.post('/tratos/:id/pago-salida', async (req, res) => {
  try {
    const { monto, metodo, referencia, fecha, notas } = req.body;
    const trato = await db.getTratoById(req.params.id);
    if (!trato) return res.status(404).json({ error: 'Trato no encontrado' });

    if (trato.estado !== 'aprobado') {
      return res.status(409).json({
        error: `El trato debe estar aprobado para pagar a la creadora (está en "${trato.estado}")`,
      });
    }

    await db.insertPago({
      trato_id: trato.id,
      direccion: 'salida',
      monto: Number(monto ?? trato.neto_a_recibir_creadora),
      metodo: metodo || 'transferencia',
      referencia: referencia || null,
      fecha: fecha || new Date().toISOString().split('T')[0],
      registrado_por: 'admin',
      notas: notas || null,
    });

    const actualizado = await maquina.aplicarTransicion(trato, 'pagado', 'admin', {
      nota: `Pago a la creadora registrado${referencia ? ` (ref. ${referencia})` : ''}`,
    });

    const creadora = await db.getCreadoraCompleta(trato.creadora_id);
    notificaciones.pagoLiberado({ trato: actualizado, creadora }).catch(e =>
      console.error('[notif] pagoLiberado:', e.message)
    );

    res.json({ ok: true, trato: actualizado });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/tratos/:id/cerrar', async (req, res) => {
  try {
    const trato = await db.getTratoById(req.params.id);
    if (!trato) return res.status(404).json({ error: 'Trato no encontrado' });
    const actualizado = await maquina.aplicarTransicion(trato, 'cerrado', 'admin', {
      nota: req.body.nota || 'Cerrado por admin',
    });

    // El historial de colaboraciones es lo que sostiene la tarifa de la creadora.
    const creadora = await db.getCreadoraCompleta(trato.creadora_id);
    await db.updateCreadora(creadora.id, {
      colaboraciones_completadas: (creadora.colaboraciones_completadas || 0) + 1,
    });

    res.json({ ok: true, trato: actualizado });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/tratos/:id/cancelar', async (req, res) => {
  try {
    const trato = await db.getTratoById(req.params.id);
    if (!trato) return res.status(404).json({ error: 'Trato no encontrado' });
    const actualizado = await maquina.aplicarTransicion(trato, 'cancelado', 'admin', {
      motivo_cancelacion: req.body.motivo || null,
      nota: 'Cancelado por admin',
    });
    res.json({ ok: true, trato: actualizado });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

// ── Marcas ──────────────────────────────────────────────────────────────────

router.get('/marcas', async (req, res) => {
  try {
    res.json(await db.getMarcas());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/marcas/:id', async (req, res) => {
  try {
    const permitidos = ['nombre_empresa', 'nombre_contacto', 'whatsapp', 'nit', 'ciudad', 'sitio_web', 'estado', 'notas_admin'];
    const data = {};
    permitidos.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    res.json(await db.updateMarca(req.params.id, data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Curaduría del catálogo ──────────────────────────────────────────────────

router.get('/creadoras', async (req, res) => {
  try {
    const creadoras = await db.getCreadorasAdmin();
    res.json(creadoras.map(({ password_hash, ...c }) => c));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/creadoras/:id', async (req, res) => {
  try {
    const creadora = await db.getCreadoraCompleta(req.params.id);
    if (!creadora) return res.status(404).json({ error: 'No encontrada' });
    const [muestras, contacto] = await Promise.all([
      db.getMuestrasDeCreadora(creadora.id),
      db.getContactoCreadora(creadora.id),
    ]);
    const { password_hash, ...perfil } = creadora;
    res.json({ ...perfil, muestras, contacto });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/creadoras', async (req, res) => {
  try {
    const { nombre_publico, email } = req.body;
    if (!nombre_publico || !email) {
      return res.status(400).json({ error: 'Faltan nombre público y email' });
    }
    if (await db.getCreadoraPorEmail(email)) {
      return res.status(409).json({ error: 'Ya existe una creadora con ese correo' });
    }
    res.json(await db.insertCreadora({
      ...req.body,
      email: String(email).toLowerCase().trim(),
      visible: false,   // nadie entra al catálogo sin revisión
    }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Edición del perfil de catálogo. Aquí se hace la curaduría: asignar nicho,
 * nivel de tarifa, activar la comisión 0% y publicar el perfil.
 */
router.patch('/creadoras/:id', async (req, res) => {
  try {
    const permitidos = [
      'nombre_publico', 'whatsapp', 'ciudad', 'nicho', 'alcance_total',
      'rango_alcance', 'engagement_pct', 'nivel_tarifa', 'tarifa_min',
      'tarifa_max', 'entregable_tipico', 'es_bruja_embajadora', 'visible',
      'bio_corta', 'notas_admin',
    ];
    const data = {};
    permitidos.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

    // Si cambia el alcance, el rango visible se recalcula solo.
    if (data.alcance_total !== undefined) {
      const cfg = await db.getConfig();
      data.rango_alcance = rangoAlcance(data.alcance_total, cfg.rangos_alcance || []);
    }
    // Y si se fija una tarifa sin nivel, se sugiere el nivel que corresponde.
    if (data.tarifa_min !== undefined && !data.nivel_tarifa) {
      const cfg = await db.getConfig();
      data.nivel_tarifa = nivelPorTarifa(data.tarifa_min, cfg.niveles_tarifa || {});
    }

    res.json(await db.updateCreadora(req.params.id, data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Sube una pieza de muestra al bucket privado.
 * Recibe base64 en el cuerpo para no agregar una dependencia de multipart.
 * El nombre en Storage es aleatorio: no revela nada de la creadora.
 */
router.post('/creadoras/:id/muestras', async (req, res) => {
  try {
    const { archivo_base64, mime, tipo } = req.body;
    if (!archivo_base64) return res.status(400).json({ error: 'Falta el archivo' });

    const creadora = await db.getCreadoraCompleta(req.params.id);
    if (!creadora) return res.status(404).json({ error: 'Creadora no encontrada' });

    const buffer = Buffer.from(String(archivo_base64).replace(/^data:[^;]+;base64,/, ''), 'base64');
    const ext = (mime || 'image/jpeg').split('/')[1] || 'jpg';
    const storage_path = `${crypto.randomUUID()}.${ext}`;

    const url = `${String(config.supabase.url).replace(/\/$/, '')}/storage/v1/object/${config.supabase.bucket_muestras}/${storage_path}`;
    const subida = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.supabase.service_role_key}`,
        'Content-Type': mime || 'image/jpeg',
      },
      body: buffer,
    });
    if (!subida.ok) {
      throw new Error(`Storage: ${subida.status} ${await subida.text()}`);
    }

    const existentes = await db.getMuestrasDeCreadora(creadora.id);
    const muestra = await db.insertMuestra({
      creadora_id: creadora.id,
      tipo: tipo || 'imagen',
      storage_path,
      mime: mime || 'image/jpeg',
      orden: existentes.length,
    });

    res.json({ ok: true, muestra: { id: muestra.id, tipo: muestra.tipo } });
  } catch (e) {
    console.error('[admin/muestras]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ── Configuración ───────────────────────────────────────────────────────────

router.get('/config', async (req, res) => {
  try {
    res.json(await db.getConfig({ forzar: true }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Cambia parámetros de negocio sin desplegar.
 * Ojo: cambiar las comisiones NO afecta a los tratos ya creados — cada uno
 * guarda los porcentajes con los que nació.
 */
router.patch('/config', async (req, res) => {
  try {
    const entradas = Object.entries(req.body || {});
    if (!entradas.length) return res.status(400).json({ error: 'Nada que actualizar' });
    for (const [clave, valor] of entradas) {
      await db.setConfig(clave, valor);
    }
    res.json({ ok: true, config: await db.getConfig({ forzar: true }) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Export para contabilidad ────────────────────────────────────────────────

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV de comisiones causadas, listo para entregar a la contadora. */
router.get('/export/comisiones.csv', async (req, res) => {
  try {
    const { desde, hasta } = req.query;
    const tratos = await db.getTratosAdmin();

    const filas = tratos
      .filter(t => ['pagado', 'cerrado'].includes(t.estado))
      .filter(t => {
        const fecha = String(t.fecha_pago_creadora || t.fecha_cierre || '').slice(0, 10);
        if (desde && fecha < desde) return false;
        if (hasta && fecha > hasta) return false;
        return true;
      });

    const encabezado = [
      'codigo', 'fecha', 'marca', 'nit_marca', 'creadora', 'bruja_embajadora',
      'monto_base', 'comision_marca_pct', 'comision_marca_valor',
      'comision_creadora_pct', 'comision_creadora_valor', 'comision_total',
      'total_cobrado_marca', 'neto_pagado_creadora', 'estado',
    ];

    const lineas = filas.map(t => [
      t.codigo,
      String(t.fecha_pago_creadora || t.fecha_cierre || '').slice(0, 10),
      t.mk_marcas?.nombre_empresa,
      t.mk_marcas?.nit,
      t.mk_creadoras?.nombre_publico,
      t.mk_creadoras?.es_bruja_embajadora ? 'si' : 'no',
      t.monto_creadora,
      t.comision_marca_pct,
      t.comision_marca_valor,
      t.comision_creadora_pct,
      t.comision_creadora_valor,
      t.comision_total_valor,
      t.total_a_pagar_marca,
      t.neto_a_recibir_creadora,
      t.estado,
    ].map(csvEscape).join(','));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="comisiones-${desde || 'inicio'}-${hasta || 'hoy'}.csv"`);
    // BOM para que Excel en Windows abra las tildes bien.
    res.send('﻿' + [encabezado.join(','), ...lineas].join('\n'));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
