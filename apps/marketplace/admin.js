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
const correo = require('./correo');
const { OLAS, filtrarCandidatas, pendientesDe, filtroDeEstados } = require('./invitaciones');
const referidos = require('./referidos');
const whatsapp = require('./whatsapp');

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
// Qué variables de WhatsApp ve el servicio. Nunca los valores, solo si están.
router.get('/diagnostico-wa', async (req, res) => {
  res.json({
    WA_PHONE_NUMBER_ID: Boolean(config.whatsapp.phone_number_id),
    WA_TOKEN: Boolean(config.whatsapp.token),
    WA_PLANTILLA: config.whatsapp.plantilla || null,
    largo_token: (config.whatsapp.token || '').length,
    verificacion: await whatsapp.verificar(),
  });
});

/**
 * ¿Está saliendo el correo?
 *
 * Se agregó después de encontrar 57 solicitudes de recuperar contraseña sin que
 * ninguna se usara: los tokens se creaban bien y el correo nunca llegaba. El
 * envío falla en silencio a propósito —no puede tumbar un registro— así que sin
 * esta pantalla el problema es invisible hasta que alguien se queja.
 */
router.get('/diagnostico-correo', async (req, res) => {
  res.json(await notificaciones.diagnostico());
});

router.post('/diagnostico-correo/probar', async (req, res) => {
  res.json(await notificaciones.probar(req.body.email));
});

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
      const [priv, tarifas, muestras] = await Promise.all([
        db.getPrivadoDeCreadora(c.id),
        db.getTarifasDeCreadora(c.id),
        db.getMuestrasDeCreadora(c.id),
      ]);
      const { password_hash, ...perfil } = c;
      return {
        ...perfil,
        instagram: priv?.instagram_handle || null,
        tiktok: priv?.tiktok_handle || null,
        nombre_real: priv?.nombre_real || null,
        tarifas_activas: tarifas.filter(t => t.activo !== false).length,
        muestras: muestras.length,
        // Lista de verdad: con nicho y con trabajo publicado. Sin piezas la
        // ficha existe pero no le sirve a ninguna marca, y aprobar eso en masa
        // llenaría el catálogo de perfiles vacíos.
        lista: Boolean((c.nicho || []).length) && muestras.length > 0,
      };
    }));
    res.json(conDatos);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Aprueba de una todas las que ya están listas.
 *
 * Solo las que tienen nicho y trabajo publicado: el botón individual permite
 * criterios más laxos porque ahí hay alguien mirando la ficha, pero aprobar en
 * masa sin ver es distinto y el criterio tiene que ser el que hace útil un
 * perfil.
 *
 * Va reusando la aprobación de a una, no un UPDATE en bloque, porque cada
 * aprobación dispara su correo, genera su código de invitaciones y le suma
 * prioridad a quien la refirió. Un update masivo se saltaría todo eso.
 */
router.post('/creadoras/aprobar-listas', async (req, res) => {
  try {
    const pendientes = await db.getCreadorasPorRevisar();
    const pedidas = Array.isArray(req.body.ids) ? req.body.ids : null;

    const listas = [];
    for (const c of pendientes) {
      // Con una selección explícita se respeta lo que decidió quien está
      // mirando las fichas: solo se exige nicho, igual que al aprobar de a una.
      // Sin selección, el criterio es el estricto —también con trabajo
      // publicado— porque nadie está revisando ficha por ficha.
      if (pedidas) {
        if (!pedidas.includes(c.id)) continue;
        if (!(c.nicho || []).length) continue;
      } else {
        if (!(c.nicho || []).length) continue;
        const muestras = await db.getMuestrasDeCreadora(c.id);
        if (!muestras.length) continue;
      }
      listas.push(c);
    }

    if (req.body.dry_run === true) {
      return res.json({
        simulacro: true, se_aprobarian: listas.length,
        muestra: listas.slice(0, 10).map(c => ({ nombre: c.nombre_publico, codigo: c.codigo })),
      });
    }

    if (!listas.length) {
      return res.status(409).json({
        error: pedidas ? 'Ninguna de las marcadas se puede aprobar: les falta el nicho.'
                       : 'Ninguna está lista todavía.',
      });
    }

    res.json({ ok: true, se_aprobaran: listas.length });

    let ok = 0;
    for (const c of listas) {
      try {
        await db.updateCreadora(c.id, {
          visible: true,
          estado_perfil: 'aprobada',
          fecha_revision: new Date().toISOString(),
          motivo_rechazo: null,
        });

        const codigoRef = await referidos.asegurarCodigoDeCreadora(c).catch(() => null);
        await notificaciones.perfilAprobado({ creadora: c, codigoRef }).catch(e =>
          console.error('[notif] perfilAprobado:', e.message));

        if (c.referida_por) {
          await premiarAQuienLaTrajo(c).catch(e =>
            console.error('[referidos] no se pudo premiar:', e.message));
        }
        ok++;
        // Cada aprobación manda al menos un correo, y la cuota diaria es
        // compartida con las invitaciones.
        await dormir(700);
      } catch (e) {
        console.error(`[aprobar-listas] ${c.codigo}:`, e.message);
      }
    }
    console.log(`[aprobar-listas] ${ok} de ${listas.length} aprobadas`);
  } catch (e) {
    console.error('[aprobar-listas]', e.message);
  }
});

/**
 * Le escribe a TODAS las que tienen algo pendiente, de una.
 *
 * No le escribe dos veces a la misma en menos de una semana: un recordatorio
 * cada dos días deja de ser un recordatorio y pasa a ser insistencia, y la
 * respuesta a eso es dejar de abrir los correos.
 */
router.post('/creadoras/recordatorio-masivo', async (req, res) => {
  try {
    const dias = Number(req.body.dias_gracia ?? 7);
    const corte = new Date(Date.now() - dias * 86400_000).toISOString();
    const todas = await db.getCreadorasAdmin();

    const pendientes = [];
    for (const c of todas) {
      if (!c.email) continue;
      if (c.estado_perfil === 'rechazada') continue;
      if (c.recordatorio_at && c.recordatorio_at > corte) continue;

      const [tarifas, muestras, priv] = await Promise.all([
        db.getTarifasDeCreadora(c.id),
        db.getMuestrasDeCreadora(c.id),
        db.getPrivadoDeCreadora(c.id),
      ]);

      const falta = [];
      if (!muestras.length) falta.push('Subir al menos una pieza de tu trabajo — foto o video');
      if (!(c.nicho || []).length) falta.push('Elegir tus nichos, para que las marcas del tema te encuentren');
      if (!priv?.instagram_handle && !priv?.tiktok_handle) falta.push('Conectar al menos una red');
      if (!tarifas.some(t => t.activo !== false) && !c.tarifa_abierta) {
        falta.push('Decir cuánto cobras — con un precio, o marcando que prefieres conversarlo');
      }
      if (falta.length) pendientes.push({ c, falta });
    }

    if (req.body.dry_run === true) {
      return res.json({
        simulacro: true, se_escribiria_a: pendientes.length,
        muestra: pendientes.slice(0, 8).map(x => ({
          nombre: x.c.nombre_publico, publicada: x.c.visible, falta: x.falta.length,
        })),
      });
    }

    // Se responde de una: escribirle a decenas toma minutos y ningún navegador
    // espera tanto sin cortar.
    res.json({ ok: true, se_escribira_a: pendientes.length });

    let ok = 0;
    for (const [i, x] of pendientes.entries()) {
      const salio = await notificaciones.recordatorioPerfil({
        email: x.c.email, nombre: x.c.nombre_publico, falta: x.falta,
      });
      if (salio) {
        ok++;
        await db.updateCreadora(x.c.id, { recordatorio_at: new Date().toISOString() });
      }
      if (i < pendientes.length - 1) await dormir(900);
    }
    console.log(`[recordatorios] ${ok} de ${pendientes.length} enviados`);
  } catch (e) {
    console.error('[recordatorio-masivo]', e.message);
  }
});

/**
 * Le recuerda a una creadora qué le falta para poder publicarse.
 *
 * Calcula lo que falta en el momento, en vez de fiarse de lo que el panel
 * mostraba: entre que se cargó la pantalla y se aprieta el botón, ella pudo
 * haber completado algo, y un recordatorio de algo ya hecho quema confianza.
 */
router.post('/creadoras/:id/recordatorio', async (req, res) => {
  try {
    const c = await db.getCreadoraCompleta(req.params.id);
    if (!c) return res.status(404).json({ error: 'No encontrada' });
    if (!c.email) return res.status(400).json({ error: 'No tiene correo' });

    const [tarifas, muestras, priv] = await Promise.all([
      db.getTarifasDeCreadora(c.id),
      db.getMuestrasDeCreadora(c.id),
      db.getPrivadoDeCreadora(c.id),
    ]);

    const falta = [];
    if (!tarifas.some(t => t.activo !== false) && !c.tarifa_abierta) {
      falta.push('Decir cuánto cobras — con un precio por entregable, o marcando que prefieres conversarlo');
    }
    if (!(c.nicho || []).length) falta.push('Elegir tus nichos, para que las marcas del tema te encuentren');
    if (!priv?.instagram_handle && !priv?.tiktok_handle) falta.push('Conectar al menos una red');
    if (!muestras.length) falta.push('Subir al menos una pieza de tu trabajo');

    if (!falta.length) {
      return res.status(409).json({ error: 'No le falta nada. Ya se puede aprobar.' });
    }

    const salio = await notificaciones.recordatorioPerfil({
      email: c.email, nombre: c.nombre_publico, falta,
    });
    if (!salio) return res.status(500).json({ error: 'El correo no salió. Revisa los logs.' });

    await db.updateCreadora(c.id, { recordatorio_at: new Date().toISOString() });
    res.json({ ok: true, falta });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** Publica el perfil en el catálogo y se lo avisa a ella. */
router.post('/creadoras/:id/aprobar', async (req, res) => {
  try {
    const c = await db.getCreadoraCompleta(req.params.id);
    if (!c) return res.status(404).json({ error: 'No encontrada' });

    // El precio no es requisito para publicarse. Exigirlo dejaba perfiles
    // buenos fuera del catálogo por el miedo a ponerse número, que es lo que
    // más traba a una creadora nueva. Sin tarifa, la ficha dice "a convenir" y
    // la conversación arranca igual.
    if (!(c.nicho || []).length) {
      return res.status(409).json({ error: 'Falta asignarle nicho antes de publicar.' });
    }

    const actualizada = await db.updateCreadora(c.id, {
      visible: true,
      estado_perfil: 'aprobada',
      fecha_revision: new Date().toISOString(),
      motivo_rechazo: null,
    });
    // Su código de invitaciones nace aquí: aprobarla es el momento en que
    // puede empezar a traer gente, y el correo que sigue se lo entrega.
    const codigoRef = await referidos.asegurarCodigoDeCreadora(c).catch(e => {
      console.error('[referidos] no se pudo generar código:', e.message);
      return null;
    });

    notificaciones.perfilAprobado({ creadora: c, codigoRef }).catch(e =>
      console.error('[notif] perfilAprobado:', e.message));

    // Si vino por invitación de otra creadora, esa se entera ahora — no cuando
    // la referida se registró. Lo que se celebra es haber traído a alguien que
    // pasó el filtro, y de paso gana más invitaciones: el premio por traer
    // gente buena es poder traer más.
    if (c.referida_por) {
      premiarAQuienLaTrajo(c).catch(e =>
        console.error('[referidos] no se pudo premiar:', e.message));
    }

    res.json({ ok: true, creadora: actualizada });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Le suma invitaciones a quien trajo a una creadora que quedó publicada, y se
 * lo cuenta.
 *
 * Las gana solo cuando la referida pasa la revisión, no cuando se registra:
 * así nadie invita por invitar, porque las que no pasan no suman nada.
 */
async function premiarAQuienLaTrajo(referida) {
  const cfg = await db.getConfig();
  const puntos = Number(cfg.prioridad_por_referida ?? 10);
  const cupos_extra = Number(cfg.referidos_por_creadora ?? 2);

  const madrina = await db.getUno('mk_creadoras', {
    codigo_ref: `eq.${referidos.normalizar(referida.referida_por)}`,
    select: 'id,email,nombre_publico,cupos_ref,prioridad',
  });
  if (!madrina?.email) return;

  const prioridad = (madrina.prioridad || 0) + puntos;
  const cupos = (madrina.cupos_ref || 2) + cupos_extra;
  await db.updateCreadora(madrina.id, { prioridad, cupos_ref: cupos });

  const usados = await referidos.contarUsos(referida.referida_por);
  await notificaciones.trajisteUna({
    creadora: madrina,
    nombreReferida: referida.nombre_publico,
    restantes: Math.max(0, cupos - usados),
    prioridad,
    traidas: usados,
  });
}

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


// ── Invitaciones al banco de creadoras ──────────────────────────────────────
//
// Corre aquí y no como script suelto porque en el servidor ya están la llave de
// Brevo y el resto de la configuración. Desde un portátil habría que replicarlas
// a mano, y una llave copiada a un .env es una llave que se filtra.

const dormir = (ms) => new Promise(r => setTimeout(r, ms));

async function candidatasDeOla(estados) {
  const filas = await db.get('influencers', {
    select: 'id,nombre,email,status',
    status: filtroDeEstados(estados),
  });
  return filtrarCandidatas(filas);
}

// ── Invitaciones por WhatsApp ───────────────────────────────────────────────
//
// Mismo mecanismo que el correo, pero con dos diferencias que impone Meta: solo
// se pueden mandar plantillas aprobadas, y un número nuevo tiene un tope diario
// bajo que sube solo si nadie reporta. Por eso el lote por defecto es chico.

async function candidatasConTelefono(estados) {
  const filas = await db.get('influencers', {
    select: 'id,nombre,email,telefono,status',
    status: filtroDeEstados(estados),
  });

  const vistos = new Set();
  return filtrarCandidatas(filas).filter(f => {
    const tel = whatsapp.normalizarTelefono(f.telefono);
    if (!tel || vistos.has(tel)) return false;
    vistos.add(tel);
    f._tel = tel;
    return true;
  });
}

router.get('/whatsapp', async (req, res) => {
  try {
    const previas = await db.get('mk_invitaciones', { select: 'email,enviada_at', canal: 'eq.whatsapp' });

    const olas = [];
    for (const [n, ola] of Object.entries(OLAS)) {
      const gente = await candidatasConTelefono(ola.estados);
      const faltan = pendientesDe(gente, previas).length;
      olas.push({
        ola: Number(n), nombre: ola.nombre,
        total: gente.length, invitadas: gente.length - faltan, faltan,
      });
    }

    // El token se comprueba aunque falte la plantilla: son dos cosas distintas
    // y la plantilla tarda en aprobarse, así que hay que poder saber si la
    // conexión sirve mientras tanto.
    const estado = await whatsapp.verificar();
    const falta_plantilla = !config.whatsapp.plantilla;

    res.json({
      olas,
      enviadas_total: previas.filter(p => p.enviada_at).length,
      conectado: estado.ok,
      falta_plantilla,
      listo: estado.ok && !falta_plantilla,
      estado,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Manda UNA plantilla al número que se le diga, sin tocar la lista real.
 *
 * Es la única forma barata de comprobar que la plantilla existe con ese
 * nombre, que Meta la aprobó, y que el número de variables coincide con lo que
 * el código le pasa. Si algo de eso está mal, el error de Meta lo dice con
 * nombre propio y se arregla antes de gastar una tanda entera.
 */
router.post('/whatsapp/prueba', async (req, res) => {
  try {
    const tel = whatsapp.normalizarTelefono(req.body.telefono);
    if (!tel) {
      return res.status(400).json({ error: 'Ese número no parece un celular colombiano' });
    }
    if (!config.whatsapp.plantilla) {
      return res.status(400).json({ error: 'Falta WA_PLANTILLA con el nombre de la plantilla aprobada' });
    }

    const nombre = String(req.body.nombre || 'María').trim().split(/\s+/)[0];
    const r = await whatsapp.enviarPlantilla(tel, [nombre]);

    if (!r.ok) return res.status(500).json({ error: r.error, telefono: tel });
    res.json({ ok: true, telefono: tel, id: r.id, idioma: r.idioma });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/whatsapp/enviar', async (req, res) => {
  try {
    const ola = Number(req.body.ola);
    // Tope bajo a propósito: un número nuevo que manda cientos el primer día
    // es lo que Meta castiga con bloqueo, y no hay apelación rápida.
    const limite = Math.min(Number(req.body.limite) || 50, 250);
    const simulacro = req.body.dry_run === true;

    if (!OLAS[ola]) return res.status(400).json({ error: 'Ola inválida (1 a 4)' });
    if (!whatsapp.configurado()) {
      return res.status(400).json({ error: 'Falta configurar WhatsApp: WA_PHONE_NUMBER_ID, WA_TOKEN y WA_PLANTILLA' });
    }

    const previas = await db.get('mk_invitaciones', { select: 'email', canal: 'eq.whatsapp' });
    const todas = await candidatasConTelefono(OLAS[ola].estados);
    const pendientes = pendientesDe(todas, previas);
    const lote = pendientes.slice(0, limite);

    if (simulacro) {
      return res.json({
        simulacro: true, ola, en_la_ola: todas.length,
        ya_invitadas: todas.length - pendientes.length,
        se_enviarian: lote.length, quedarian: Math.max(0, pendientes.length - lote.length),
        muestra: lote.slice(0, 8).map(c => ({ nombre: c.nombre, telefono: c._tel })),
      });
    }

    res.json({ ok: true, ola, se_enviaran: lote.length, quedaran: Math.max(0, pendientes.length - lote.length) });

    let ok = 0, fallos = 0;
    for (const [i, c] of lote.entries()) {
      let anotada;
      try {
        anotada = await db.post('mk_invitaciones', {
          influencer_id: c.id, email: c.email, nombre: c.nombre || null,
          telefono: c._tel, ola, canal: 'whatsapp', status_origen: c.status,
        });
      } catch (e) { continue; }

      const primerNombre = String(c.nombre || '').trim().split(/\s+/)[0] || 'hola';
      const r = await whatsapp.enviarPlantilla(c._tel, [primerNombre]);

      if (r.ok) {
        ok++;
        await db.patch('mk_invitaciones', { id: anotada.id }, { enviada_at: new Date().toISOString() });
      } else {
        fallos++;
        await db.patch('mk_invitaciones', { id: anotada.id }, { error: r.error });
        console.error(`[wa] ${c._tel}: ${r.error}`);
      }

      // Más espaciado que el correo: los envíos en ráfaga a números que no te
      // esperan son lo que dispara los reportes.
      if (i < lote.length - 1) await dormir(1500);
    }
    console.log(`[wa] Ola ${ola}: ${ok} enviados, ${fallos} fallidos`);
  } catch (e) {
    console.error('[wa]', e.message);
  }
});

/** Cuántas van y cuántas faltan, por ola. */
router.get('/invitaciones', async (req, res) => {
  try {
    const [previas, creadoras] = await Promise.all([
      db.get('mk_invitaciones', { select: 'email,enviada_at' }),
      db.get('mk_creadoras', { select: 'email' }),
    ]);

    const olas = [];
    for (const [n, ola] of Object.entries(OLAS)) {
      const gente = await candidatasDeOla(ola.estados);
      const faltan = pendientesDe(gente, previas).length;
      olas.push({
        ola: Number(n), nombre: ola.nombre,
        total: gente.length, invitadas: gente.length - faltan, faltan,
      });
    }

    // Cuántas invitadas terminaron creando su perfil.
    //
    // Se cruza contra mk_creadoras en vez de leer `registrada_at`, que existe
    // en la tabla pero nunca se escribe: el KPI marcaba 0 desde el principio
    // aunque casi cien personas se hubieran registrado, y ese es justamente el
    // número que dice si vale la pena mandar la siguiente ola.
    //
    // El cruce además funciona hacia atrás, sin tener que rellenar la columna.
    const registradas = new Set(creadoras.map(c => String(c.email || '').toLowerCase().trim()));
    const enviadas = previas.filter(p => p.enviada_at);
    const seRegistraron = enviadas
      .filter(p => registradas.has(String(p.email || '').toLowerCase().trim())).length;

    res.json({
      olas,
      enviadas_total: enviadas.length,
      se_registraron: seRegistraron,
      correo_listo: Boolean(correo.activo() || config.smtp.user),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Manda UNA invitación al correo que se le diga, sin tocar la lista real ni
 * anotarla en `mk_invitaciones`. Sirve para verla en el buzón antes de soltar
 * una tanda de doscientas.
 */
router.post('/invitaciones/prueba', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim();
    const status = req.body.status || 'Contenido Entregado';
    if (!email.includes('@')) return res.status(400).json({ error: 'Falta un correo válido' });

    const salio = await notificaciones.invitacionCreadora({
      email, nombre: req.body.nombre || 'María', status,
      codigoRef: req.body.codigo_ref || 'PRUEBA7X',
    });
    if (!salio) return res.status(500).json({ error: 'No salió. Revisa los logs.' });
    res.json({ ok: true, email });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Envía una tanda. El tope por defecto deja margen bajo el límite diario del
 * proveedor, que comparte cuota con los correos normales de la plataforma.
 */
router.post('/invitaciones/enviar', async (req, res) => {
  try {
    const ola = Number(req.body.ola);
    const limite = Math.min(Number(req.body.limite) || 250, 300);
    const simulacro = req.body.dry_run === true;

    if (!OLAS[ola]) return res.status(400).json({ error: 'Ola inválida (1 a 4)' });
    if (!correo.activo() && !config.smtp.user) {
      return res.status(400).json({ error: 'No hay correo configurado: no se enviaría nada' });
    }

    const previas = await db.get('mk_invitaciones', { select: 'email' });
    const todas = await candidatasDeOla(OLAS[ola].estados);
    const pendientes = pendientesDe(todas, previas);
    const lote = pendientes.slice(0, limite);

    if (simulacro) {
      return res.json({
        simulacro: true, ola, en_la_ola: todas.length,
        ya_invitadas: todas.length - pendientes.length,
        se_enviarian: lote.length, quedarian: Math.max(0, pendientes.length - lote.length),
        muestra: lote.slice(0, 8).map(c => ({ nombre: c.nombre, email: c.email })),
      });
    }

    // Se responde de una y el envío sigue por detrás: 250 correos con pausa
    // toman varios minutos y ningún navegador espera tanto sin cortar.
    res.json({ ok: true, ola, se_enviaran: lote.length, quedaran: Math.max(0, pendientes.length - lote.length) });

    let ok = 0, fallos = 0;
    for (const [i, c] of lote.entries()) {
      let anotada;
      try {
        // Anotar antes de enviar: si el proceso muere, lo peor es una
        // invitación registrada sin salir. Al revés sería escribir dos veces.
        anotada = await db.post('mk_invitaciones', {
          influencer_id: c.id, email: c.email, nombre: c.nombre || null,
          ola, status_origen: c.status,
        });
      } catch (e) {
        continue; // choca con el índice único: ya estaba invitada
      }

      // Su código de referida viaja en el enlace del correo: sin él, el bloque
      // de "traes a dos" no tendría a dónde apuntar.
      const codigoRef = await referidos.asegurarCodigo(anotada.id, anotada.codigo_ref);

      const salio = await notificaciones.invitacionCreadora({
        email: c.email, nombre: c.nombre, status: c.status, codigoRef,
      });
      salio ? ok++ : fallos++;
      await db.patch('mk_invitaciones', { id: anotada.id },
        salio ? { enviada_at: new Date().toISOString() } : { error: 'El envío falló' });

      // Sin pausa, cientos de correos seguidos parecen un ataque.
      if (i < lote.length - 1) await dormir(900);
    }
    console.log(`[invitaciones] Ola ${ola}: ${ok} enviadas, ${fallos} fallidas`);
  } catch (e) {
    console.error('[invitaciones]', e.message);
  }
});

// ── Verificar métricas ──────────────────────────────────────────────────────

/**
 * Creadoras que subieron captura de sus Insights y esperan que alguien compare.
 *
 * El sello de "métricas verificadas" es una promesa que le hacemos a la marca,
 * así que lo pone una persona mirando la captura, no el sistema confiando en lo
 * que la creadora escribió.
 */
router.get('/metricas/cola', async (req, res) => {
  try {
    const pendientes = await db.get('mk_creadoras', {
      select: 'id,codigo,nombre_publico,metricas_estado,metricas_captura_path,estado_perfil',
      metricas_captura_path: 'not.is.null',
      metricas_estado: 'eq.declarado',
      order: 'created_at.asc',
    });

    // Sus números declarados, para poder compararlos contra la captura sin
    // tener que abrir cada perfil.
    const conRedes = await Promise.all(pendientes.map(async (c) => ({
      ...c,
      redes: await db.getRedesPrivadas(c.id).catch(() => []),
    })));

    res.json({
      pendientes: conRedes,
      verificadas: (await db.get('mk_creadoras', {
        select: 'id', metricas_estado: 'eq.verificado',
      })).length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Marca las métricas de una creadora como verificadas, o las devuelve a
 * declaradas si la captura no cuadra.
 */
router.post('/metricas/:id', async (req, res) => {
  try {
    const aprobar = req.body.aprobar !== false;
    const c = await db.getCreadoraCompleta(req.params.id);
    if (!c) return res.status(404).json({ error: 'Creadora no encontrada' });

    if (aprobar && !c.metricas_captura_path) {
      return res.status(400).json({
        error: 'No subió captura. Verificar sin verla contra qué sería firmar en blanco.',
      });
    }

    await db.updateCreadora(c.id, aprobar
      ? { metricas_estado: 'verificado', metricas_verificadas_at: new Date().toISOString() }
      : { metricas_estado: 'declarado', metricas_verificadas_at: null,
          notas_admin: [c.notas_admin, req.body.motivo].filter(Boolean).join(' · ') || null });

    res.json({ ok: true, estado: aprobar ? 'verificado' : 'declarado' });
  } catch (e) {
    console.error('[admin/metricas]', e.message);
    res.status(500).json({ error: e.message });
  }
});

/**
 * Segundo toque: quién recibió invitación y nunca creó su perfil.
 *
 * De cada tres invitadas se registró una. Las otras dos son el grupo más barato
 * que hay para crecer: ya saben qué es esto y ya pasaron el filtro de "vale la
 * pena invitarla". Solo no volvieron.
 *
 * Se manda una sola vez por persona; `segundo_toque_at` es lo que lo garantiza.
 * Insistir dos veces con el mismo argumento no convence a nadie y sí quema el
 * dominio.
 */
router.get('/invitaciones/sin-registrar', async (req, res) => {
  try {
    const [invs, creadoras] = await Promise.all([
      db.get('mk_invitaciones', {
        select: 'id,email,nombre,enviada_at,segundo_toque_at,codigo_ref',
        enviada_at: 'not.is.null',
      }),
      db.get('mk_creadoras', { select: 'email' }),
    ]);

    const registradas = new Set(creadoras.map(c => String(c.email || '').toLowerCase().trim()));
    const sinRegistrar = invs.filter(i => !registradas.has(String(i.email || '').toLowerCase().trim()));

    res.json({
      invitadas: invs.length,
      sin_registrar: sinRegistrar.length,
      pendientes_de_segundo_toque: sinRegistrar.filter(i => !i.segundo_toque_at).length,
      ya_recontactadas: sinRegistrar.filter(i => i.segundo_toque_at).length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/invitaciones/segundo-toque', async (req, res) => {
  try {
    const limite = Math.min(Number(req.body.limite) || 200, 300);
    const simulacro = req.body.dry_run === true;

    if (!correo.activo() && !config.smtp.user) {
      return res.status(400).json({ error: 'No hay correo configurado: no se enviaría nada' });
    }

    const [invs, creadoras] = await Promise.all([
      db.get('mk_invitaciones', {
        select: 'id,email,nombre,codigo_ref,segundo_toque_at',
        enviada_at: 'not.is.null',
        segundo_toque_at: 'is.null',
      }),
      db.get('mk_creadoras', { select: 'email' }),
    ]);

    const registradas = new Set(creadoras.map(c => String(c.email || '').toLowerCase().trim()));
    const pendientes = invs.filter(i => !registradas.has(String(i.email || '').toLowerCase().trim()));
    const lote = pendientes.slice(0, limite);

    if (simulacro) {
      return res.json({
        simulacro: true, sin_registrar: pendientes.length, se_enviarian: lote.length,
        quedarian: Math.max(0, pendientes.length - lote.length),
        muestra: lote.slice(0, 8).map(c => ({ nombre: c.nombre, email: c.email })),
      });
    }

    res.json({ ok: true, se_enviaran: lote.length, quedaran: Math.max(0, pendientes.length - lote.length) });

    let ok = 0, fallos = 0;
    for (const [i, c] of lote.entries()) {
      // Se marca antes de enviar, igual que la primera invitación: si el
      // proceso muere a mitad, lo peor es que alguien no reciba el recordatorio.
      // Al revés le llegaría dos veces.
      await db.patch('mk_invitaciones', { id: c.id }, { segundo_toque_at: new Date().toISOString() });

      const salio = await notificaciones.invitacionSegundoToque({
        email: c.email, nombre: c.nombre, codigoRef: c.codigo_ref,
      });
      salio ? ok++ : fallos++;

      if (i < lote.length - 1) await dormir(900);
    }
    console.log(`[segundo-toque] ${ok} enviadas, ${fallos} fallidas`);
  } catch (e) {
    console.error('[segundo-toque]', e.message);
  }
});

/**
 * Despierta los cupos de referido que nadie está usando.
 *
 * El enlace ya viaja en el correo de bienvenida, pero se lee una vez y se
 * olvida: hay cientos de cupos intactos. Esto solo vuelve a ponerlo enfrente.
 *
 * Solo se le escribe a quien tiene perfil aprobado. Pedirle que traiga amigas a
 * alguien que todavía no pasó la revisión es pedirle que recomiende algo que
 * ella misma no ha visto funcionar.
 */
router.get('/referidos/dormidos', async (req, res) => {
  try {
    const creadoras = await db.get('mk_creadoras', {
      select: 'id,codigo_ref,cupos_ref,estado_perfil,referidos_empujon_at',
      estado_perfil: 'eq.aprobada',
    });
    const conCupo = creadoras.filter(c => c.codigo_ref && (c.cupos_ref || 0) > 0);
    res.json({
      aprobadas: creadoras.length,
      con_cupos_libres: conCupo.length,
      cupos_sin_usar: conCupo.reduce((s, c) => s + (c.cupos_ref || 0), 0),
      pendientes_de_empujon: conCupo.filter(c => !c.referidos_empujon_at).length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/referidos/empujon', async (req, res) => {
  try {
    const limite = Math.min(Number(req.body.limite) || 200, 300);
    const simulacro = req.body.dry_run === true;

    if (!correo.activo() && !config.smtp.user) {
      return res.status(400).json({ error: 'No hay correo configurado: no se enviaría nada' });
    }

    const creadoras = await db.get('mk_creadoras', {
      select: 'id,email,nombre_publico,codigo_ref,cupos_ref,referidos_empujon_at',
      estado_perfil: 'eq.aprobada',
      referidos_empujon_at: 'is.null',
    });

    const pendientes = creadoras.filter(c => c.email && c.codigo_ref && (c.cupos_ref || 0) > 0);
    const lote = pendientes.slice(0, limite);

    if (simulacro) {
      return res.json({
        simulacro: true, con_cupos: pendientes.length, se_enviarian: lote.length,
        quedarian: Math.max(0, pendientes.length - lote.length),
        muestra: lote.slice(0, 8).map(c => ({ nombre: c.nombre_publico, cupos: c.cupos_ref })),
      });
    }

    res.json({ ok: true, se_enviaran: lote.length, quedaran: Math.max(0, pendientes.length - lote.length) });

    let ok = 0, fallos = 0;
    for (const [i, c] of lote.entries()) {
      await db.updateCreadora(c.id, { referidos_empujon_at: new Date().toISOString() });

      // Cuántas trajo ya: es la diferencia entre los cupos con los que nació y
      // los que le quedan. Decirle "ya trajiste una" cuando no ha traído
      // ninguna sería el tipo de detalle que le quita credibilidad a todo el
      // mensaje.
      const traidas = Math.max(0, 2 - (c.cupos_ref || 0));

      const salio = await notificaciones.activarReferidos({
        creadora: c, codigoRef: c.codigo_ref, restantes: c.cupos_ref, traidas,
      });
      salio ? ok++ : fallos++;

      if (i < lote.length - 1) await dormir(900);
    }
    console.log(`[referidos] empujón: ${ok} enviados, ${fallos} fallidos`);
  } catch (e) {
    console.error('[referidos]', e.message);
  }
});

module.exports = router;
