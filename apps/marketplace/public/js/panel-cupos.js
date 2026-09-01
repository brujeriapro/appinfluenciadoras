// Campañas con cupos, lado marca. Las tres pantallas del flujo.
//
//   1 · Crear   — el brief, los cupos, a quién invitar y qué consume del plan.
//   2 · Activa  — quiénes aceptaron, quiénes faltan, cuánto queda de plazo.
//   3 · Elegir  — confirmar hasta llenar los cupos, y pagar.
//
// La regla que atraviesa las tres: **cada creadora invitada consume una
// propuesta del plan**. Se comunica con un medidor de celdas y una línea de
// resumen, no con un bloque de alarma — la marca ya decidió invitar, y
// asustarla en el momento de confirmar no evita ningún error. Lo enfático se
// reserva para cuando el saldo NO alcanza, que es el único caso donde hay algo
// que evitar de verdad.

const CUPOS = {
  campana: null,      // la campaña abierta
  invitadas: [],      // ids elegidos en la pantalla de crear
  elegidas: [],       // ids marcados en la pantalla de confirmar
  cupos: 3,
  horas: 48,
  entregable: null,
  monto: null,
};

// ── Piezas compartidas ──────────────────────────────────────────────────────

/**
 * La anatomía de fila que se repite en las tres pantallas.
 *
 * Cada columna lleva ancho fijo salvo la de métricas, que es flexible. Es lo
 * que permite que las columnas se alineen verticalmente entre filas — lo único
 * que hace posible comparar de arriba abajo, que es para lo que existe esta
 * lista.
 */
function filaCupoHTML(c, opciones = {}) {
  const { marcada, estado, cuando, control = 'casilla', oscuro } = opciones;
  const clases = ['fila-cupo'];
  if (marcada) clases.push('fila-cupo--on');
  if (estado) clases.push('fila-cupo--' + estado);

  return `
  <div class="${clases.join(' ')}" data-creadora="${c.id}">
    ${control === 'casilla' ? `
      <button class="casilla ${marcada ? 'casilla--on' : ''}" role="checkbox"
              aria-checked="${Boolean(marcada)}" data-marcar="${c.id}"
              aria-label="Invitar a ${esc(c.nombre_publico)}">${marcada ? '✓' : ''}</button>` : ''}

    <div class="fila-cupo__avatar">${avatarDe(c)}</div>

    <div class="fila-cupo__id">
      <div class="alias">${esc(c.nombre_publico)}</div>
      <div class="sub-id">${esc([c.codigo, (c.nicho || [])[0], c.ciudad].filter(Boolean).join(' · '))}</div>
    </div>

    <div class="fila-cupo__metricas">${redesHTML(c.redes, 2)}</div>

    <div class="fila-cupo__tray">${selloHTML(c.cumplimiento, {
      metricas: c.metricas_estado, oscuro: oscuro || marcada,
    })}</div>

    <div class="fila-cupo__tarifa">
      <div class="etiqueta">Su tarifa</div>
      <div class="desde__valor">${c.tarifa_min ? COP(c.tarifa_min) : 'A convenir'}</div>
    </div>

    ${estado ? `
      <div class="fila-cupo__estado">
        <span class="pill pill--${estado}">${PILL[estado] || estado}</span>
        ${cuando ? `<div class="etiqueta" style="margin-top:4px">${esc(cuando)}</div>` : ''}
      </div>` : ''}
  </div>`;
}

const PILL = {
  acepto: 'Aceptó', invitada: 'Sin responder', paso: 'Pasó',
  confirmada: 'Confirmada', cupos_llenos: 'Cupos llenos', vencida: 'No respondió',
};

/** "hace 2 h" — el tiempo relativo es lo que la marca necesita para decidir. */
function haceCuanto(iso) {
  if (!iso) return '';
  const min = Math.floor((Date.now() - new Date(iso)) / 60000);
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}

/** Cuánto falta para el cierre, en el formato grande de la cabecera. */
function faltaPara(iso) {
  const ms = new Date(iso) - Date.now();
  if (ms <= 0) return { texto: 'Cerrado', vencido: true };
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60000);
  return { texto: h >= 1 ? `${h} h ${m} m` : `${m} m`, vencido: false };
}

// ── 1 · Crear campaña ───────────────────────────────────────────────────────

function vistaCrearCampana(c) {
  const entregables = (E.cfg?.entregables || []).map(e => e.clave || e);
  if (!CUPOS.entregable) CUPOS.entregable = entregables[0] || 'reel';

  const disponibles = E.catalogo.filter(x => !esDesc(x.id));

  c.innerHTML = `
    <div class="cab-negra">
      <div>
        <div class="cab-negra__eyebrow">Nueva campaña</div>
        <h1 class="cab-negra__titulo">Arma el brief y elige a quién invitar</h1>
      </div>
      <div class="cab-negra__chips">
        <span class="chip-oscuro">Plan ${esc(E.plan?.nombre || '—')}</span>
        <span class="chip-oscuro">Crear es gratis</span>
      </div>
    </div>

    <div class="cupos-layout">
      <div class="cupos-layout__col">
        <section class="tarjeta-plana">
          <h2 class="mk-h2">El brief</h2>
          <p class="banda__sub">Lo mismo que va a leer cada creadora invitada.</p>

          <div class="campo" style="margin-top:16px">
            <label for="camp-producto">Producto</label>
            <input id="camp-producto" placeholder="Mantequilla Capilar · 250 ml">
          </div>
          <div class="campo">
            <label for="camp-brief">Qué quieres que haga</label>
            <textarea id="camp-brief" rows="4"
              placeholder="Un reel mostrando tu rutina con el producto, más una historia con el link. Tono honesto, sin guion cerrado."></textarea>
          </div>
          <div class="campos-2">
            <div class="campo">
              <label>Entregable</label>
              <div class="chips">
                ${entregables.map(e => `
                  <button class="chip-claro ${CUPOS.entregable === e ? 'chip-claro--on' : ''}"
                          data-entregable="${esc(e)}">${esc(e)}</button>`).join('')}
              </div>
            </div>
            <div class="campo">
              <label for="camp-fecha">Fecha de entrega</label>
              <input id="camp-fecha" type="date">
            </div>
          </div>
        </section>

        <section class="tarjeta-plana" style="padding:0;margin-top:18px">
          <div class="cab-interna">
            <div>
              <h2 class="mk-h2" style="color:#fff">A quién invitas</h2>
              <p class="banda__sub" style="color:var(--chip-dark-text)">
                Entre 1 y 10. Puedes invitar a más que cupos: es normal y es para eso.
              </p>
            </div>
            <span class="contador-magenta" id="cuenta-invitadas">
              ${CUPOS.invitadas.length} invitadas</span>
          </div>
          <div class="filas-cupo" id="lista-invitar">
            ${disponibles.slice(0, 40).map(x =>
              filaCupoHTML(x, { marcada: CUPOS.invitadas.includes(x.id) })).join('')}
          </div>
        </section>
      </div>

      <aside class="cupos-layout__panel">
        <div class="panel-negro">
          <div class="panel-negro__titulo">Los cupos</div>
          <div class="etiqueta" style="margin-top:14px">Cuántas quieres contratar</div>
          <div class="contador-gigante" id="num-cupos">${CUPOS.cupos}</div>
          <input type="range" id="rango-cupos" min="1" max="10" value="${CUPOS.cupos}"
                 aria-label="Cupos" aria-valuetext="${CUPOS.cupos} cupos">
          <div class="rango-extremos"><span>1</span><span>10</span></div>

          <div class="etiqueta" style="margin-top:18px">Plazo para que respondan</div>
          <div class="origen" style="margin-top:8px">
            ${[48, 72].map(h => `
              <button class="btn btn--sm ${CUPOS.horas === h ? '' : 'btn--linea-oscuro'}"
                      data-horas="${h}">${h} horas</button>`).join('')}
          </div>
          <p class="nota-oscura" id="vence-el"></p>
        </div>

        <div class="tarjeta-plana" style="margin-top:14px">
          <div class="plan-cab">
            <span class="etiqueta">Tu plan este mes</span>
            <span id="plan-resumen"></span>
          </div>
          <div class="medidor" id="medidor"></div>
          <div class="plan-linea">
            <span id="plan-frase"></span>
            <strong class="plan-delta" id="plan-delta"></strong>
          </div>
          <p class="nota">Se consumen al enviar, respondan o no.</p>
        </div>

        <div id="aviso-plan"></div>

        <div class="tarjeta-plana" style="margin-top:14px">
          <div class="etiqueta" id="titulo-tope"></div>
          <div class="dinero-fila">
            <span class="dinero-fila__label">Monto por creadora</span>
            <span class="dinero-fila__valor" id="tope-monto">—</span>
          </div>
          <div class="dinero-fila">
            <span class="dinero-fila__label">Comisión plataforma 12%</span>
            <span class="dinero-fila__valor" style="color:var(--magenta)" id="tope-comision">—</span>
          </div>
          <div class="plan-linea" style="border:0;padding-top:12px">
            <span class="etiqueta">Tope total</span>
            <strong class="mk-cifra" style="font-size:22px;border-left:4px solid var(--lima);
                    padding-left:10px" id="tope-total">—</strong>
          </div>
          <p class="nota">Solo se cobra por los cupos que se llenen. Si aceptan 2 de 3, pagas 2.</p>
        </div>

        <button class="btn btn--magenta" id="enviar-campana"
                style="width:100%;margin-top:14px;padding:14px"></button>
        <div class="aria-solo" id="anuncio-plan" aria-live="polite"></div>
      </aside>
    </div>`;

  conectarCrear(c);
  recalcularCrear();
}

function conectarCrear(c) {
  c.querySelectorAll('[data-marcar]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.marcar;
      const i = CUPOS.invitadas.indexOf(id);
      i >= 0 ? CUPOS.invitadas.splice(i, 1) : CUPOS.invitadas.push(id);

      const fila = b.closest('.fila-cupo');
      const marcada = i < 0;
      fila.classList.toggle('fila-cupo--on', marcada);
      b.classList.toggle('casilla--on', marcada);
      b.textContent = marcada ? '✓' : '';
      b.setAttribute('aria-checked', String(marcada));

      // La trayectoria tiene su propia variante para fondo oscuro. Sin esto la
      // fila se invierte a negro y el texto se queda en negro: desaparece.
      fila.querySelector('.trayectoria')?.classList.toggle('trayectoria--oscuro', marcada);
      recalcularCrear();
    });
  });

  c.querySelectorAll('[data-entregable]').forEach(b => {
    b.addEventListener('click', () => {
      CUPOS.entregable = b.dataset.entregable;
      c.querySelectorAll('[data-entregable]').forEach(o =>
        o.classList.toggle('chip-claro--on', o === b));
    });
  });

  c.querySelectorAll('[data-horas]').forEach(b => {
    b.addEventListener('click', () => {
      CUPOS.horas = Number(b.dataset.horas);
      c.querySelectorAll('[data-horas]').forEach(o =>
        o.classList.toggle('btn--linea-oscuro', o !== b));
      recalcularCrear();
    });
  });

  const rango = c.querySelector('#rango-cupos');
  rango.addEventListener('input', () => {
    CUPOS.cupos = Number(rango.value);
    c.querySelector('#num-cupos').textContent = CUPOS.cupos;
    rango.setAttribute('aria-valuetext', `${CUPOS.cupos} cupos`);
    recalcularCrear();
  });

  c.querySelector('#enviar-campana').addEventListener('click', enviarCampana);
}

/**
 * Recalcula el consumo del plan, el tope y el estado del botón.
 *
 * El trabajo pesado lo hace el medidor, no la tipografía: ver ocho celdas
 * magenta llenándose de golpe comunica el costo mejor que un titular grande, y
 * sin dramatizar.
 */
function recalcularCrear() {
  const n = CUPOS.invitadas.length;
  const tope = E.plan?.propuestas_tope ?? null;
  const usadas = E.plan?.propuestas_enviadas || 0;
  const restantes = tope === null ? Infinity : Math.max(0, tope - usadas);

  $('cuenta-invitadas').textContent = `${n} invitada${n === 1 ? '' : 's'}`;

  // El medidor: negras las ya usadas, magenta las de esta campaña, contorno
  // las que quedan.
  const celdas = tope === null ? Math.max(n, 6) : tope;
  $('medidor').innerHTML = Array.from({ length: celdas }, (_, i) => {
    const clase = i < usadas ? 'medidor__celda--usada'
                : i < usadas + n ? 'medidor__celda--esta'
                : '';
    return `<span class="medidor__celda ${clase}"></span>`;
  }).join('');

  $('plan-resumen').textContent = tope === null
    ? 'Sin tope'
    : `${usadas} usadas · ${restantes} disponibles de ${tope}`;
  $('plan-frase').textContent = n > CUPOS.cupos
    ? `Invitas a ${n} para llenar ${CUPOS.cupos} cupos`
    : 'Esta campaña';
  $('plan-delta').textContent = n ? `−${n}` : '';

  // El monto sale de la tarifa más alta entre las invitadas: en una campaña
  // con cupos todas cobran lo mismo, así que ofrecer menos de lo que alguna
  // pide sería invitarla a algo que no puede aceptar.
  const tarifas = CUPOS.invitadas
    .map(id => E.catalogo.find(x => x.id === id)?.tarifa_min)
    .filter(Boolean).map(Number);
  CUPOS.monto = tarifas.length ? Math.max(...tarifas) : null;

  const comision = CUPOS.monto ? Math.round(CUPOS.monto * 0.12) : 0;
  $('titulo-tope').textContent = `Si se llenan los ${CUPOS.cupos} cupos`;
  $('tope-monto').textContent = CUPOS.monto ? COP(CUPOS.monto) : '—';
  $('tope-comision').textContent = CUPOS.monto ? '+' + COP(comision) : '—';
  $('tope-total').textContent = CUPOS.monto
    ? COP((CUPOS.monto + comision) * CUPOS.cupos) : '—';

  // El aviso de saldo SÍ es enfático: acá sí hay un error que evitar.
  const falta = tope !== null && n > restantes;
  $('aviso-plan').innerHTML = falta ? `
    <div class="aviso-fuerte">
      <p class="p" style="color:var(--ink)">Quieres invitar a ${n} y te quedan
      ${restantes} propuestas este mes. Quita ${n - restantes} o sube de plan.</p>
      <button class="btn btn--magenta btn--sm" id="subir-plan" style="margin-top:10px">
        Subir de plan →</button>
    </div>` : '';
  $('subir-plan')?.addEventListener('click', () => { location.hash = '#planes'; });

  const boton = $('enviar-campana');
  boton.disabled = falta || !n;
  boton.textContent = falta ? 'No alcanza el plan'
                    : !n ? 'Elige a quién invitar'
                    : `Enviar ${n} invitacion${n === 1 ? '' : 'es'} →`;

  // Es la información crítica de la pantalla y hasta acá solo se comunicaba
  // por color.
  $('anuncio-plan').textContent = n
    ? `${n} invitadas. Consume ${n} de tus ${restantes === Infinity ? 'propuestas' : restantes + ' propuestas disponibles'}.`
    : '';

  const vence = new Date(Date.now() + CUPOS.horas * 3600_000);
  $('vence-el').textContent = `Vence el ${vence.toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long',
  })} a las ${vence.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}. `
    + 'Después de esa hora nadie más puede aceptar.';
}

async function enviarCampana() {
  const boton = $('enviar-campana');
  boton.disabled = true;
  boton.textContent = 'Enviando…';
  try {
    const r = await apiCupos('', {
      method: 'POST',
      body: JSON.stringify({
        nombre: ($('camp-producto').value || 'Campaña').slice(0, 80),
        brief_base: $('camp-brief').value,
        entregables: [CUPOS.entregable],
        producto: $('camp-producto').value || null,
        cupos: CUPOS.cupos,
        monto_creadora: CUPOS.monto,
        fecha_entrega: $('camp-fecha').value,
        horas_limite: CUPOS.horas,
      }),
    });

    const inv = await apiCupos(`/${r.campana.id}/invitar`, {
      method: 'POST',
      body: JSON.stringify({ creadora_ids: CUPOS.invitadas }),
    });

    CUPOS.invitadas = [];
    E.plan = await api('/plan').catch(() => E.plan);
    pintarPlan();
    alertaCupos(inv.sin_costo
      ? `Listo: ${inv.invitadas} invitaciones. ${inv.sin_costo} no gastaron propuesta porque ya habían esperado un cupo tuyo.`
      : `Listo: ${inv.invitadas} invitaciones enviadas.`);
    irACampana(r.campana.id);
  } catch (e) {
    boton.disabled = false;
    alertaCupos(e.message);
    recalcularCrear();
  }
}

// ── 2 · Campaña activa ──────────────────────────────────────────────────────

/**
 * La convocatoria abierta: publicarla, o cómo va si ya está publicada.
 *
 * Es la alternativa a elegir a ciegas entre 294 perfiles. Se dice lo que cuesta
 * ANTES de publicar —los cupos se cobran por adelantado— porque enterarse
 * después de que se fueron las propuestas del mes es la peor forma de saberlo.
 */
function convocatoriaHTML(campana, conv) {
  if (conv) {
    const cierra = campana.postulaciones_hasta
      ? new Date(campana.postulaciones_hasta).toLocaleDateString('es-CO',
          { day: '2-digit', month: 'short' })
      : '—';
    return `
    <div class="tarjeta-plana" style="margin-bottom:14px;border-left:5px solid var(--azul)">
      <div class="etiqueta">Convocatoria abierta</div>
      <div style="font-family:var(--mono-t);font-weight:800;font-size:19px;
                  letter-spacing:-0.9px;margin:6px 0">
        ${conv.esperando} esperando respuesta
      </div>
      <p class="p" style="font-size:11.5px">${esc(conv.resumen)}.
        Se puede postular hasta el ${esc(cierra)}.</p>
      <p class="p" style="font-size:10.5px;color:var(--text-3);margin-top:8px">
        Los cupos que no llenes se te devuelven al plan cuando cierres la campaña.</p>
    </div>`;
  }

  return `
  <div class="tarjeta-plana" style="margin-bottom:14px">
    <div class="etiqueta">¿Prefieres que se postulen?</div>
    <p class="p" style="font-size:11.5px;margin:8px 0 12px">
      En vez de elegir a ciegas, publicamos la convocatoria y le llega por correo
      a las creadoras que encajan. Eliges entre las que levanten la mano.
    </p>
    <div class="campo" style="margin-bottom:8px">
      <label class="etiqueta" for="conv-nicho">Nicho (separado por comas)</label>
      <input id="conv-nicho" placeholder="rizos, cuidado capilar">
    </div>
    <div class="campo" style="margin-bottom:8px">
      <label class="etiqueta" for="conv-ciudad">Ciudad</label>
      <input id="conv-ciudad" placeholder="Vacío = toda Colombia">
    </div>
    <button class="btn btn--magenta" id="publicar-conv" style="width:100%">
      Abrir a postulaciones →</button>
    <p class="p" style="font-size:10.5px;color:var(--text-3);margin-top:8px">
      Te cuesta ${campana.cupos} propuesta${campana.cupos === 1 ? '' : 's'} del plan
      —una por cupo— y te devolvemos las que no llenes.
    </p>
  </div>`;
}

/**
 * Invitar a una o varias creadoras a una campaña, sin salir del catálogo.
 *
 * Esta función se llamaba desde `panel.html` desde el principio y NUNCA se
 * construyó: el botón "Invitar a campaña" de la barra caía siempre al `else`,
 * que solo cambiaba de pestaña. Así que hasta hoy invitar exigía entrar a la
 * campaña y buscar a la creadora ahí.
 *
 * Se dice lo que cuesta ANTES de mandar: cada creadora invitada consume una
 * propuesta del plan, y enterarse después de que se fueron las del mes es la
 * peor forma de saberlo.
 */
async function abrirCampanaCon(creadoras) {
  const lista = (creadoras || []).filter(Boolean);
  if (!lista.length) return;

  // Solo las que todavía pueden recibir a alguien. Ofrecer una campaña cerrada
  // es ofrecer un callejón sin salida.
  const abiertas = (E.campanas || []).filter(c => c.estado !== 'cerrada');

  const nombres = lista.length === 1
    ? esc(lista[0].nombre_publico)
    : `${lista.length} creadoras`;

  $('modal-hueco').innerHTML = `
  <div class="modal">
    <div class="modal__cab">
      <div>
        <h2 class="h-sec" style="font-size:15px">Invitar a ${nombres}</h2>
        <div class="etiqueta" style="margin-top:6px">
          ${lista.map(c => esc(c.codigo || '')).filter(Boolean).join(' · ')}
        </div>
      </div>
      <button class="cerrar" id="cerrar-modal" aria-label="Cerrar">×</button>
    </div>
    <div class="modal__cuerpo" style="display:block">
      ${abiertas.length ? `
        <p class="p" style="margin-bottom:14px">Escoge a cuál. Le llega un correo
        con las instrucciones y el monto, y tiene ${E.cfg.horas_responder || 72} horas para
        responder.</p>
        <div id="camp-lista">
          ${abiertas.map(c => `
            <button class="tarifa-op" data-camp="${c.id}">
              <div>
                <div class="tarifa-op__nom">${esc(c.nombre)}</div>
                <div class="tarifa-op__det">${c.cupos} cupo${c.cupos === 1 ? '' : 's'}
                  ${c.monto_creadora ? '· ' + COP(c.monto_creadora) + ' por creadora' : ''}</div>
              </div>
              <div class="tarifa-op__monto">→</div>
            </button>`).join('')}
        </div>
        <p class="p" style="font-size:11px;color:var(--text-3);margin-top:12px">
          Invitar a ${lista.length} ${lista.length === 1 ? 'creadora consume 1 propuesta' : 'creadoras consume ' + lista.length + ' propuestas'}
          de tu plan.</p>
      ` : `
        <p class="p">Todavía no tienes ninguna campaña abierta. Una campaña es un
        unas instrucciones y unos cupos: le llega igual a varias creadoras y eliges entre las
        que acepten.</p>
        <button class="btn btn--lima" id="camp-crear" style="margin-top:14px">
          Crear una campaña →</button>`}
    </div>
  </div>`;

  $('telon').classList.add('abierto');
  $('cerrar-modal').addEventListener('click', cerrarModal);
  $('camp-crear')?.addEventListener('click', () => { cerrarModal(); ir('crear-campana'); });

  $('modal-hueco').querySelectorAll('[data-camp]').forEach(b =>
    b.addEventListener('click', async () => {
      b.disabled = true;
      b.style.opacity = '.5';
      try {
        const r = await apiCupos(`/${b.dataset.camp}/invitar`, {
          method: 'POST',
          body: JSON.stringify({ creadora_ids: lista.map(c => c.id) }),
        });
        cerrarModal();
        alert(`Invitadas ${r.invitadas}.`
          + (r.sin_costo ? ` ${r.sin_costo} sin gastar propuesta.` : '')
          + (r.ignoradas ? ` ${r.ignoradas} ya estaban invitadas.` : ''));
        // El consumo del plan cambió: hay que repintarlo en la cabecera.
        E.plan = await api('/plan').catch(() => E.plan);
        pintarPlan();
      } catch (e) {
        b.disabled = false;
        b.style.opacity = '1';
        // El 402 trae el texto exacto de por qué no alcanza el plan. Tragárselo
        // dejaría a la marca sin saber que el problema es el tope y no un fallo.
        alert(e.message);
      }
    }));
}

async function vistaCampanaActiva(c, id) {
  c.innerHTML = '<p class="p">Cargando…</p>';
  let d;
  try {
    d = await apiCupos('/' + id);
  } catch (e) {
    c.innerHTML = `<div class="estado"><div class="estado__cuadro">!</div>
      <div class="estado__titulo">No pudimos cargar la campaña</div>
      <p class="estado__texto">${esc(e.message)}</p></div>`;
    return;
  }
  CUPOS.campana = d;

  const { campana, estado, invitaciones, convocatoria } = d;
  const resto = faltaPara(campana.fecha_limite_respuesta);
  const grupo = (est) => invitaciones.filter(i => i.estado === est);

  c.innerHTML = `
    <div class="cab-negra">
      <div>
        <div class="cab-negra__eyebrow">
          Campaña
          <span class="chip-estado chip-estado--azul">
            ${estado.vencida ? 'Plazo cerrado' : 'Recibiendo respuestas'}</span>
        </div>
        <h1 class="cab-negra__titulo">${esc(campana.nombre)}</h1>
      </div>
      <div style="text-align:right">
        <div class="etiqueta">${resto.vencido ? 'Cerró' : 'Cierra en'}</div>
        <div class="cuenta-regresiva">${resto.texto}</div>
      </div>
    </div>

    <div class="indicadores">
      ${indicadorHTML('Cupos', `${estado.libres} por llenar`, '#C9C9C2',
        `de ${estado.cupos} en total`)}
      ${indicadorHTML('Aceptaron', `${estado.aceptaron} de ${invitaciones.length} invitadas`,
        '#FF2E9A', estado.aceptaron > 0 ? `Ya puedes elegir a las ${estado.libres}` : 'Todavía nadie', true)}
      ${indicadorHTML('Sin responder', `${estado.esperando} a tiempo`, '#2323F0',
        resto.vencido ? 'Se venció el plazo' : `Les queda ${resto.texto}`)}
      ${indicadorHTML('Pasaron', String(estado.pasaron), '#4A4A44',
        'Su propuesta ya se consumió')}
    </div>

    <div class="cupos-layout">
      <div class="cupos-layout__col">
        ${grupoHTML('Aceptaron', `${estado.aceptaron} de ${invitaciones.length} · ya puedes elegir`,
          '#FF2E9A', grupo('acepto'))}
        ${grupoHTML('Sin responder', resto.vencido ? 'se venció el plazo' : `les queda ${resto.texto}`,
          '#2323F0', grupo('invitada'))}
        ${grupoHTML('Confirmadas', 'ya tienen su trato abierto', '#0E0E0E', grupo('confirmada'))}
        ${grupoHTML('Pasaron', 'no les sirvió esta vez', '#C9C9C2', grupo('paso'), true)}
      </div>

      <aside class="cupos-layout__panel">
        ${convocatoriaHTML(campana, convocatoria)}
        <div class="panel-negro">
          <div class="panel-negro__titulo">Te toca a ti</div>
          <h2 class="cab-negra__titulo" style="font-size:19px;margin-top:10px">
            ${estado.aceptaron > estado.libres
              ? 'Ya hay más aceptadas que cupos'
              : estado.aceptaron
                ? `${estado.aceptaron} aceptaron`
                : 'Todavía nadie ha respondido'}</h2>
          <p class="p" style="color:var(--text-dark-2,#D8D8D3);margin-top:10px">
            ${estado.aceptaron
              ? `${estado.aceptaron} aceptaron y tienes ${estado.libres} cupos. Puedes elegir ya o esperar a que cierre el plazo para ver a todas.`
              : 'Les avisamos por correo. Te escribimos apenas alguna responda.'}</p>
          ${estado.aceptaron && estado.libres ? `
            <button class="btn btn--magenta" id="ir-elegir" style="width:100%;margin-top:14px">
              Elegir a las ${estado.libres} →</button>` : ''}
          ${estado.aceptaron ? `
            <button class="btn btn--linea-oscuro" id="cerrar-campana" style="width:100%;margin-top:8px">
              Cerrar la campaña</button>` : ''}
        </div>

        <div class="tarjeta-plana" style="margin-top:14px">
          <div class="etiqueta">El brief que enviaste</div>
          <div class="dinero-fila">
            <span class="dinero-fila__label">Entregable</span>
            <span class="dinero-fila__valor">${esc((campana.entregables || []).join(', '))}</span>
          </div>
          <div class="dinero-fila">
            <span class="dinero-fila__label">Entrega</span>
            <span class="dinero-fila__valor">${campana.fecha_entrega ? fecha(campana.fecha_entrega) : '—'}</span>
          </div>
          <div class="dinero-fila">
            <span class="dinero-fila__label">Monto por creadora</span>
            <span class="dinero-fila__valor mk-plata">${COP(campana.monto_creadora)}</span>
          </div>
          <p class="nota">El brief ya salió. Para cambiarlo hay que cerrar esta campaña y abrir
          otra, y eso consume propuestas nuevas.</p>
        </div>
      </aside>
    </div>`;

  $('ir-elegir')?.addEventListener('click', () => irAElegir(campana.id));
  $('cerrar-campana')?.addEventListener('click', async () => {
    if (!confirm('¿Cerrar la campaña? A quienes aceptaron y no elegiste les llega que los cupos se completaron.')) return;
    const r = await apiCupos(`/${campana.id}/cerrar`, { method: 'POST' });
    if (r?.devueltas) alert(r.mensaje);
    vistaCampanaActiva($('contenido'), campana.id);
  });

  $('publicar-conv')?.addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    const lista = (s) => String(s || '').split(',').map(x => x.trim()).filter(Boolean);
    const nicho = lista($('conv-nicho').value);
    const ciudades = lista($('conv-ciudad').value);

    if (!confirm(`Se va a publicar y le llega por correo a las creadoras que encajen. `
      + `Consume ${campana.cupos} propuestas de tu plan; las que no llenes se te devuelven al cerrar.`)) return;

    b.disabled = true;
    b.textContent = 'Publicando…';
    try {
      const r = await apiCupos(`/${campana.id}/publicar`, {
        method: 'POST',
        body: JSON.stringify({ nicho, ciudades }),
      });
      alert(`Publicada. Encajan ${r.encajan} creadoras y les estamos escribiendo a ${r.se_les_avisa}.`
        + (r.recortadas ? ` Quedaron ${r.recortadas} por fuera de esta tanda.` : ''));
      vistaCampanaActiva($('contenido'), campana.id);
    } catch (e) {
      b.disabled = false;
      b.textContent = 'Abrir a postulaciones →';
      alert('No se pudo publicar: ' + e.message);
    }
  });
}

function indicadorHTML(titulo, cifra, color, nota, destacar) {
  return `
  <div class="indicador" style="border-top:3px solid ${color}">
    <div class="etiqueta">${titulo}</div>
    <div class="indicador__cifra" ${destacar ? 'style="color:var(--magenta)"' : ''}>${esc(cifra)}</div>
    <div class="indicador__nota">${esc(nota || '')}</div>
  </div>`;
}

function grupoHTML(titulo, nota, color, items, apagado) {
  if (!items.length) return '';
  return `
  <section class="tarjeta-plana" style="padding:0;margin-bottom:16px">
    <div class="cab-interna">
      <div style="display:flex;align-items:center;gap:9px">
        <span style="width:11px;height:11px;background:${color};flex:none"></span>
        <strong style="color:#fff;font-family:var(--mono-t);font-size:12.5px">${titulo}</strong>
        <span class="etiqueta" style="color:var(--chip-dark-text)">${esc(nota)}</span>
      </div>
    </div>
    <div class="filas-cupo ${apagado ? 'filas-cupo--apagadas' : ''}">
      ${items.map(i => i.creadora
        ? filaCupoHTML(i.creadora, {
            control: 'ninguno', estado: i.estado,
            cuando: haceCuanto(i.respondida_at || i.invitada_at),
          })
        : '').join('')}
    </div>
  </section>`;
}

// ── 3 · Confirmar elegidas ──────────────────────────────────────────────────

async function vistaElegir(c, id) {
  c.innerHTML = '<p class="p">Cargando…</p>';
  const d = await apiCupos('/' + id);
  CUPOS.campana = d;
  CUPOS.elegidas = [];
  pintarElegir(c);
}

function pintarElegir(c) {
  const { campana, estado, invitaciones } = CUPOS.campana;
  const aceptaron = invitaciones.filter(i => i.estado === 'acepto');
  const libres = estado.libres;
  const n = CUPOS.elegidas.length;

  // El tope real es el menor entre los cupos y quienes aceptaron. Si hay 3
  // cupos y solo 2 dijeron que sí, exigir 3 deja a la marca sin poder
  // confirmar nunca — y con dos creadoras esperando una respuesta que no va a
  // llegar. Se cierra con las que hay, que es lo que el negocio permite.
  const alcanzables = Math.min(libres, aceptaron.length);
  const faltanRespuestas = aceptaron.length < libres;
  const lleno = n >= alcanzables && n > 0;

  const monto = Number(campana.monto_creadora);
  const comision = Math.round(monto * 0.12);
  const total = (monto + comision) * n;

  c.innerHTML = `
    <div class="cab-negra">
      <div>
        <div class="cab-negra__eyebrow">${esc(campana.nombre)} · confirmar elegidas</div>
        <h1 class="cab-negra__titulo">${faltanRespuestas
          ? `Elige entre las ${aceptaron.length} que aceptaron`
          : `Elige a ${libres} entre las ${aceptaron.length} que aceptaron`}</h1>
      </div>
      <div style="text-align:right">
        <div class="etiqueta">Cupos llenos</div>
        <div class="cuenta-regresiva ${lleno ? '' : 'cuenta-regresiva--neutra'}">${n} de ${libres}</div>
        ${faltanRespuestas ? `<div class="etiqueta" style="margin-top:4px">
          Solo ${aceptaron.length} han aceptado</div>` : ''}
      </div>
    </div>

    <div class="cupos-layout">
      <div class="cupos-layout__col">
        <div class="filas-cupo">
          ${aceptaron.map(i => filaCupoHTML(i.creadora, {
            marcada: CUPOS.elegidas.includes(i.id),
            cuando: haceCuanto(i.respondida_at),
            marcarId: i.id,
          }).replace(`data-marcar="${i.creadora.id}"`, `data-marcar="${i.id}"`)).join('')}
        </div>
      </div>

      <aside class="cupos-layout__panel">
        <div class="panel-negro">
          <div class="panel-negro__titulo">Qué vas a pagar</div>
          <div class="dinero-fila dinero-fila--oscura">
            <span class="dinero-fila__label">${n} × ${COP(monto)}</span>
            <span class="dinero-fila__valor" style="color:#fff">${COP(monto * n)}</span>
          </div>
          <div class="dinero-fila dinero-fila--oscura">
            <span class="dinero-fila__label">Comisión 12%</span>
            <span class="dinero-fila__valor" style="color:var(--magenta)">+${COP(comision * n)}</span>
          </div>
          <div class="etiqueta" style="margin-top:14px">Total a retener en escrow</div>
          <div class="mk-cifra total-escrow">${COP(total)}</div>
          <p class="nota-oscura">Se cobra al confirmar. Ahí se revela el contacto de cada elegida.</p>
        </div>

        <div class="panel-azul">
          <div class="panel-negro__titulo">Qué pasa con las otras</div>
          <p class="p" style="color:#EDEDFF;margin-top:10px">
            Ven que los cupos quedaron completos. Nunca ven que las descartaste, ni a quién
            elegiste, ni por qué.</p>
          <p class="p" style="color:#EDEDFF;margin-top:10px">
            Quedan marcadas como disponibles para tu próxima campaña, sin gastar propuesta
            otra vez.</p>
        </div>

        <button class="btn btn--magenta" id="confirmar-elegidas"
                style="width:100%;margin-top:14px;padding:14px" ${lleno ? '' : 'disabled'}>
          ${lleno
            ? `Confirmar ${n === 1 ? 'y pagar' : `las ${n} y pagar`} ${COP(total)} →`
            : n === 0 ? 'Elige a quién contratar' : `Faltan ${alcanzables - n} por elegir`}
        </button>
        ${faltanRespuestas ? `
          <p class="nota">Quedan ${libres - aceptaron.length} cupos sin llenar. Puedes cerrar con
          estas ${aceptaron.length} o volver a la campaña e invitar a más — eso consume propuestas
          nuevas.</p>` : ''}
        <div class="aria-solo" id="anuncio-elegir" aria-live="polite"></div>
      </aside>
    </div>`;

  c.querySelectorAll('[data-marcar]').forEach(b => {
    b.addEventListener('click', () => {
      const id = b.dataset.marcar;
      const i = CUPOS.elegidas.indexOf(id);
      if (i >= 0) {
        CUPOS.elegidas.splice(i, 1);
      } else if (CUPOS.elegidas.length >= alcanzables) {
        // Tope duro. No basta con que el clic no haga nada: quien no ve el
        // contador se queda esperando que pase algo.
        const aviso = `Ya elegiste las ${alcanzables} que caben. Quita una para cambiarla.`;
        $('anuncio-elegir').textContent = aviso;
        alertaCupos(aviso);
        return;
      } else {
        CUPOS.elegidas.push(id);
      }
      // Se redibuja porque el panel de dinero cambia entero, y se devuelve el
      // foco a la casilla que se acaba de tocar: sin esto, quien navega con
      // teclado vuelve al principio de la lista en cada clic.
      pintarElegir(c);
      c.querySelector(`[data-marcar="${id}"]`)?.focus();
    });
  });

  $('confirmar-elegidas').addEventListener('click', confirmarElegidas);
}

async function confirmarElegidas() {
  const boton = $('confirmar-elegidas');
  boton.disabled = true;
  boton.textContent = 'Confirmando…';
  const id = CUPOS.campana.campana.id;
  try {
    for (const invitacionId of CUPOS.elegidas) {
      await apiCupos(`/${id}/confirmar/${invitacionId}`, { method: 'POST' });
    }
    alertaCupos('Confirmadas. Ya puedes pagar cada trato para retener el dinero y ver sus contactos.');
    irACampana(id);
  } catch (e) {
    boton.disabled = false;
    alertaCupos(e.message);
  }
}

// ── Navegación y utilidades ─────────────────────────────────────────────────

const apiCupos = (ruta, op) => api('/cupos' + ruta, op);

function irACrearCampana() { ir('crear-campana'); }
function irACampana(id) { ir('campana', id); }
function irAElegir(id) { ir('elegir', id); }

/** Un aviso simple. El panel no tiene sistema de notificaciones todavía. */
function alertaCupos(texto) { alert(texto); }
