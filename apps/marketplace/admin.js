// Panel admin de Creators Manager — para el equipo que opera el marketplace.
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
const { rangoAlcance, resumirAlcance } = require('./comisiones');
const wompi = require('./wompi');
const { subirMuestra, borrarMuestra } = require('./muestras');
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

    // Dinero en custodia: lo que una marca ya pagó y todavía se le debe a
    // alguien. Se cuenta la entrada COMPLETA de los tratos que aún no se le han
    // pagado a la creadora — no la resta entrada menos salida, porque en un
    // trato ya pagado esa diferencia es la comisión ganada, no plata retenida.
    const conSalida = new Set(Object.keys(salidasPorTrato));
    const retenido = Object.entries(entradasPorTrato)
      .filter(([tratoId]) => !conSalida.has(tratoId))
      .reduce((s, [, entrada]) => s + entrada, 0);

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

/**
 * Diagnóstico de conexión, para no adivinar cuando algo falla.
 *
 * Nunca devuelve las credenciales: solo su forma —prefijo, largo, si tiene
 * espacios— que es lo que hace falta para saber si la que llegó es la correcta.
 */
router.get('/diagnostico', async (req, res) => {
  const llave = String(config.supabase.service_role_key || '');
  const forma = {
    empieza_con: llave.slice(0, 4) || '(vacía)',
    largo: llave.length,
    es_jwt: llave.startsWith('eyJ'),
    tiene_espacios: /\s/.test(llave),
    tiene_comillas: /["']/.test(llave),
  };

  // Tres pruebas, de la más simple a la más completa.
  const pruebas = {};

  try {
    await db.getConfig({ forzar: true });
    pruebas.base_de_datos = 'ok';
  } catch (e) {
    pruebas.base_de_datos = `falla: ${e.message}`;
  }

  try {
    const url = `${String(config.supabase.url).replace(/\/$/, '')}/storage/v1/bucket/${config.supabase.bucket_muestras}`;
    const r = await fetch(url, { headers: { 'Authorization': `Bearer ${llave}` } });
    const cuerpo = await r.text();
    pruebas.storage = r.ok
      ? 'ok'
      : `falla (${r.status}): ${cuerpo.slice(0, 200)}`;
  } catch (e) {
    pruebas.storage = `falla: ${e.message}`;
  }

  // Wompi: se revisa la forma de cada llave, no su valor.
  const w = config.wompi;
  const wompiEstado = {
    llave_publica: w.llave_publica
      ? `${w.llave_publica.slice(0, 9)}… (${w.llave_publica.startsWith('pub_test') ? 'PRUEBAS' : 'PRODUCCIÓN'})`
      : '(falta)',
    llave_privada: w.llave_privada ? `${w.llave_privada.slice(0, 9)}…` : '(falta)',
    secreto_integridad: w.secreto_integridad ? 'puesto' : '(falta)',
    secreto_eventos: w.secreto_eventos ? 'puesto' : '(falta)',
    listo_para_cobrar: wompi.disponible(),
    url_webhook: `${config.base_url}/webhook/wompi`,
  };

  const cfg = await db.getConfig().catch(() => ({}));
  wompiEstado.cobro_encendido = cfg.pagos_wompi_activos === true;
  wompiEstado.planes_encendidos = cfg.planes_activos === true;

  // Las llaves mezcladas son el error silencioso: el checkout abre y el pago
  // se rechaza al confirmar, sin que nadie entienda por qué.
  const publicaEsPrueba = String(w.llave_publica).startsWith('pub_test');
  const privadaEsPrueba = String(w.llave_privada).startsWith('prv_test');
  if (w.llave_publica && w.llave_privada && publicaEsPrueba !== privadaEsPrueba) {
    wompiEstado.problema = 'Una llave es de pruebas y la otra de producción. Tienen que ser del mismo ambiente.';
  }

  let recomendacion = null;
  if (!forma.es_jwt) {
    recomendacion = 'La llave no es un JWT. Storage exige la service_role clásica, que empieza por "eyJ".';
  } else if (forma.tiene_espacios || forma.tiene_comillas) {
    recomendacion = 'La llave llegó con espacios o comillas. Pégala limpia, sin comillas alrededor.';
  } else if (pruebas.storage !== 'ok') {
    recomendacion = 'La llave tiene forma correcta pero Storage la rechaza. Revisa que sea service_role y no anon.';
  }

  res.json({
    url_supabase: config.supabase.url,
    url_publica: config.base_url,
    bucket: config.supabase.bucket_muestras,
    llave: forma,
    pruebas,
    wompi: wompiEstado,
    recomendacion,
  });
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
    const permitidos = ['nombre_empresa', 'nombre_contacto', 'whatsapp', 'nit', 'pais', 'departamento', 'ciudad', 'sitio_web', 'estado', 'notas_admin'];
    const data = {};
    permitidos.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });
    res.json(await db.updateMarca(req.params.id, data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Curaduría del catálogo ──────────────────────────────────────────────────

/** Cola de perfiles esperando revisión, con sus handles para poder verificar. */
router.get('/por-revisar', async (req, res) => {
  try {
    const pendientes = await db.getCreadorasPorRevisar();
    const conDatos = await Promise.all(pendientes.map(async c => {
      const [priv, tarifas] = await Promise.all([
        db.getPrivadoDeCreadora(c.id),
        db.getTarifasDeCreadora(c.id),
      ]);
      const { password_hash, ...perfil } = c;
      return {
        ...perfil,
        instagram: priv?.instagram_handle || null,
        tiktok: priv?.tiktok_handle || null,
        nombre_real: priv?.nombre_real || null,
        tarifas_activas: tarifas.filter(t => t.activo !== false).length,
      };
    }));
    res.json(conDatos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Publica el perfil en el catálogo y se lo avisa a ella. */
router.post('/creadoras/:id/aprobar', async (req, res) => {
  try {
    const c = await db.getCreadoraCompleta(req.params.id);
    if (!c) return res.status(404).json({ error: 'No encontrada' });

    const tarifas = await db.getTarifasDeCreadora(c.id);
    if (!tarifas.some(t => t.activo !== false)) {
      return res.status(409).json({ error: 'No tiene tarifas. No se puede publicar sin precio.' });
    }
    if (!(c.nicho || []).length) {
      return res.status(409).json({ error: 'Falta asignarle nicho antes de publicar.' });
    }

    const actualizada = await db.updateCreadora(c.id, {
      visible: true,
      estado_perfil: 'aprobada',
      fecha_revision: new Date().toISOString(),
      motivo_rechazo: null,
    });
    notificaciones.perfilAprobado({ creadora: c }).catch(e =>
      console.error('[notif] perfilAprobado:', e.message));

    res.json({ ok: true, creadora: actualizada });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/creadoras/:id/rechazar', async (req, res) => {
  try {
    const actualizada = await db.updateCreadora(req.params.id, {
      visible: false,
      estado_perfil: 'rechazada',
      motivo_rechazo: req.body.motivo || null,
      fecha_revision: new Date().toISOString(),
    });
    res.json({ ok: true, creadora: actualizada });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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
    const [muestras, contacto, tarifas, privado] = await Promise.all([
      db.getMuestrasDeCreadora(creadora.id),
      db.getContactoCreadora(creadora.id),
      db.getTarifasDeCreadora(creadora.id),
      db.getPrivadoDeCreadora(creadora.id),
    ]);
    const { password_hash, ...perfil } = creadora;
    res.json({ ...perfil, muestras, contacto, tarifas, privado });
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
    // tarifa_min, tarifa_max, nivel_tarifa y entregable_tipico NO están aquí a
    // propósito: son derivados de mk_tarifas, que llena la creadora. El admin
    // no le pone precio a nadie.
    const permitidos = [
      'nombre_publico', 'whatsapp', 'pais', 'departamento', 'ciudad', 'nicho', 'categorias',
      'seguidores_instagram', 'seguidores_tiktok', 'engagement_pct',
      'es_bruja_embajadora', 'visible', 'bio_corta', 'notas_admin',
    ];
    const data = {};
    permitidos.forEach(k => { if (req.body[k] !== undefined) data[k] = req.body[k]; });

    const cfg = await db.getConfig();

    // Si cambia el alcance de alguna red, los tres rangos se recalculan solos.
    if (data.seguidores_instagram !== undefined || data.seguidores_tiktok !== undefined) {
      const previa = await db.getCreadoraCompleta(req.params.id);
      Object.assign(data, resumirAlcance({
        instagram: data.seguidores_instagram ?? previa?.seguidores_instagram,
        tiktok: data.seguidores_tiktok ?? previa?.seguidores_tiktok,
      }, cfg.rangos_alcance || []));
    }

    // La categoría madre se deduce de los subnichos elegidos.
    if (data.nicho !== undefined && !data.categorias) {
      const taxonomia = cfg.nichos || [];
      data.categorias = [...new Set(
        taxonomia
          .filter(c => (c.subnichos || []).some(s => data.nicho.includes(s)))
          .map(c => c.clave)
      )];
    }

    // Publicar un perfil sin tarifas lo deja en el catálogo sin precio, que es
    // justo lo que el producto promete no hacer ("precio publicado").
    if (data.visible === true) {
      const tarifas = await db.getTarifasDeCreadora(req.params.id);
      if (!tarifas.some(t => t.activo !== false)) {
        return res.status(409).json({
          error: 'No se puede publicar sin tarifas. La creadora debe definir sus precios primero.',
        });
      }
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
    const creadora = await db.getCreadoraCompleta(req.params.id);
    if (!creadora) return res.status(404).json({ error: 'Creadora no encontrada' });

    const muestra = await subirMuestra(creadora.id, { ...req.body, subida_por: 'admin' });
    res.json({ ok: true, muestra: { id: muestra.id, tipo: muestra.tipo } });
  } catch (e) {
    console.error('[admin/muestras]', e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/muestras/:id', async (req, res) => {
  try {
    await borrarMuestra(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
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
