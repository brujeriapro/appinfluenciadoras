// Mis campañas, línea de tiempo del trato, perfil de la marca y modal de
// nueva campaña. Comparte el estado global `E` con panel.html.

// ── Mis campañas ────────────────────────────────────────────────────────────

const ESTADO_TRATO = {
  solicitado:    { texto: 'Esperando respuesta', clase: '' },
  aceptado:      { texto: 'Falta pagar',         clase: 'pastilla--alerta' },
  pago_retenido: { texto: 'En escrow',           clase: '' },
  entregado:     { texto: 'Acción requerida',    clase: 'pastilla--alerta' },
  aprobado:      { texto: 'Aprobado',            clase: 'pastilla--cerrado' },
  pagado:        { texto: 'Pagado',              clase: 'pastilla--cerrado' },
  cerrado:       { texto: 'Cerrado',             clase: 'pastilla--cerrado' },
  rechazado:     { texto: 'Rechazado',           clase: 'pastilla--cerrado' },
  cancelado:     { texto: 'Cancelado',           clase: 'pastilla--cerrado' },
};

async function vistaCampanas(c) {
  c.innerHTML = '<p class="p">Cargando…</p>';
  try {
    [E.tratos, E.campanas] = await Promise.all([api('/tratos'), api('/campanas')]);
  } catch (e) {
    c.innerHTML = `<div class="estado estado--error"><div class="estado__cuadro">!</div>
      <div class="estado__titulo">No pudimos cargar tus campañas</div>
      <p class="estado__texto">${esc(e.message)}</p></div>`;
    return;
  }

  // Comprometido este mes: lo que ya está pagado o retenido, no lo que todavía
  // puede rechazarse.
  const mes = new Date().toISOString().slice(0, 7);
  const comprometido = E.tratos
    .filter(t => ['pago_retenido', 'entregado', 'aprobado', 'pagado', 'cerrado'].includes(t.estado))
    .filter(t => String(t.fecha_pago_marca || t.created_at || '').startsWith(mes))
    .reduce((s, t) => s + Number(t.total_a_pagar_marca || 0), 0);

  c.innerHTML = `
    <div class="vista-cab">
      <div class="vista-cab__texto">
        <h1 class="h1">Mis campañas</h1>
        <p class="p">Cada propuesta que enviaste y en qué punto va.</p>
      </div>
      <div class="vista-cab__acciones">
        <div style="text-align:right">
          <div class="etiqueta">Comprometido este mes</div>
          <div class="dato-num" style="font-size:18px;border-right:4px solid var(--lima);
               padding-right:10px;margin-top:4px">${COP(comprometido)}</div>
        </div>
        <button class="btn" id="nueva-campana">+ Nueva campaña</button>
      </div>
    </div>

    ${E.campanas.length ? `
      <div class="h-sec" style="margin-bottom:10px">Campañas activas</div>
      <div class="grilla" style="margin-bottom:28px">
        ${E.campanas.map(camp => `
          <div class="tarjeta"><div class="tarjeta__cuerpo">
            <div class="alias" style="font-size:12.5px">${esc(camp.nombre)}</div>
            <div class="sub-id">
              ${camp.fecha_fin ? 'Hasta ' + fecha(camp.fecha_fin) : 'Siempre abierta'} ·
              ${camp.propuestas_enviadas || 0} enviadas
            </div>
            <div class="tarjeta__pie">
              <div class="desde">
                <div class="desde__valor">${COP(camp.tope_total)}</div>
                <div class="desde__label">Tope total</div>
              </div>
            </div>
          </div></div>`).join('')}
      </div>` : ''}

    <div id="tabla-tratos"></div>`;

  $('nueva-campana').addEventListener('click', () => abrirCampana());

  if (!E.tratos.length) {
    $('tabla-tratos').innerHTML = `
      <div class="estado">
        <div class="estado__cuadro"><span style="width:12px;height:12px;background:var(--lima);display:block"></span></div>
        <div class="estado__titulo">Aún no tienes campañas</div>
        <p class="estado__texto">Publicar es gratis y solo pagas cuando una creadora acepta.
        Empieza filtrando el catálogo por tu nicho.</p>
        <div class="estado__acciones">
          <button class="btn" id="a-catalogo">Explorar catálogo →</button>
        </div>
      </div>`;
    $('a-catalogo').addEventListener('click', () => ir('catalogo'));
    return;
  }

  $('tabla-tratos').innerHTML = `
    <table class="tabla">
      <thead><tr>
        <th>Creadora / entregable</th><th>Estado</th><th>Entrega</th>
        <th style="text-align:right">Total</th><th></th>
      </tr></thead>
      <tbody>${E.tratos.map(t => {
        const e = ESTADO_TRATO[t.estado] || { texto: t.estado, clase: '' };
        const alerta = e.clase === 'pastilla--alerta';
        return `
        <tr class="${alerta ? 'alerta' : ''}">
          <td>
            <div class="alias" style="font-size:12px">${esc(t.mk_creadoras?.nombre_publico || '—')}</div>
            <div class="sub-id">${esc([t.codigo, t.entregables].filter(Boolean).join(' · '))}</div>
          </td>
          <td><span class="pastilla ${e.clase}">${e.texto}</span></td>
          <td>${t.fecha_entrega_esperada ? fecha(t.fecha_entrega_esperada) : '—'}</td>
          <td class="money">${COP(t.total_a_pagar_marca)}</td>
          <td><button class="btn btn--linea btn--sm" data-trato="${t.id}">Ver trato →</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table>`;

  c.querySelectorAll('[data-trato]').forEach(b =>
    b.addEventListener('click', () => ir('trato', b.dataset.trato)));
}

// ── Línea de tiempo del trato ───────────────────────────────────────────────

const PASOS = [
  { clave: 'solicitado',    nom: 'Solicitado',          desc: 'Enviaste la propuesta. Ella tiene 72 horas para responder.' },
  { clave: 'aceptado',      nom: 'Aceptado',            desc: 'Aceptó el brief y el monto sin contrapropuesta.' },
  { clave: 'pago_retenido', nom: 'Pago retenido',       desc: 'El dinero quedó en escrow. Aquí se revela su identidad.' },
  { clave: 'entregado',     nom: 'Contenido entregado', desc: 'Subió el link de lo publicado. Tienes 48 horas para aprobar.' },
  { clave: 'aprobado',      nom: 'Aprobado',            desc: 'Aprobaste la pieza.' },
  { clave: 'pagado',        nom: 'Pagado',              desc: 'Se liberó el pago a su cuenta.' },
  { clave: 'cerrado',       nom: 'Cerrado',             desc: 'Trato cerrado. Quedan las métricas en tu histórico.' },
];

async function vistaTrato(c) {
  c.innerHTML = '<p class="p">Cargando…</p>';
  let t;
  try {
    t = await api('/tratos/' + E.tratoId);
  } catch (e) {
    c.innerHTML = `<div class="estado estado--error"><div class="estado__cuadro">!</div>
      <div class="estado__titulo">No pudimos abrir el trato</div>
      <p class="estado__texto">${esc(e.message)}</p></div>`;
    return;
  }

  const idx = PASOS.findIndex(p => p.clave === t.estado);
  const revelado = Boolean(t.contacto_revelado_at);
  const eventos = {};
  (t.eventos || []).forEach(ev => { eventos[ev.estado_nuevo] = ev; });

  // El título cambia cuando se revela la identidad: es el clímax del flujo.
  const titulo = revelado && t.contacto?.nombre_real
    ? t.contacto.nombre_real
    : (t.creadora?.nombre_publico || 'Trato');

  const etiquetaMonto = ['pagado', 'cerrado'].includes(t.estado) ? 'Total pagado'
    : revelado ? 'Retenido en escrow' : 'Total a pagar';

  // Qué le toca hacer a ella ahora. Solo aparece cuando hay algo que hacer.
  const TOCA = {
    solicitado: { t: 'Esperando su respuesta', d: 'Te avisamos por correo apenas responda.' },
    aceptado: { t: 'Falta tu pago', d: 'Paga con tarjeta y el dinero queda retenido al instante. Ahí se abren sus datos de contacto.', boton: 'Pagar ahora' },
    entregado: { t: 'Revisa el contenido', d: 'Aprueba la pieza para liberar el pago.', boton: 'Aprobar contenido' },
  }[t.estado];

  c.innerHTML = `
  <div class="migas"><button id="volver-camp">← Mis campañas</button> / ${esc(t.codigo || '')}</div>

  <div class="trato">
    <div class="trato__col">
      <h1 class="alias-grande" style="font-size:clamp(22px,2.6vw,34px);letter-spacing:-1.8px">${esc(titulo)}</h1>
      <div class="sub-id" style="margin-bottom:26px">${esc([t.codigo, t.entregables].filter(Boolean).join(' · '))}</div>

      <ul class="pasos">
        ${PASOS.map((p, i) => {
          const ev = eventos[p.clave];
          const estado = i < idx ? 'hecho' : i === idx ? 'hecho actual' : 'pendiente';
          return `
          <li class="paso ${estado}">
            <span class="paso__caja"></span>
            <div>
              <div class="paso__nom">${p.nom}</div>
              <div class="paso__desc">${p.desc}</div>
              ${ev ? `<div class="paso__fecha">${new Date(ev.created_at).toLocaleString('es-CO')}</div>` : ''}
            </div>
          </li>`;
        }).join('')}
      </ul>
    </div>

    <aside class="trato__lado">
      ${revelado ? `
        <div class="bloque contacto--abierto">
          <div class="bloque__cab"><span class="cuadrito cuadrito--lima"></span> Contacto revelado</div>
          <div class="bloque__cuerpo">
            <div class="dato-fila"><span>Nombre</span><span>${esc(t.contacto?.nombre_real || '—')}</span></div>
            <div class="dato-fila"><span>Instagram</span><span>${t.contacto?.instagram ? '@' + esc(t.contacto.instagram) : '—'}</span></div>
            <div class="dato-fila"><span>Correo</span><span>${esc(t.contacto?.email || '—')}</span></div>
            <div class="dato-fila"><span>WhatsApp</span><span>${esc(t.contacto?.telefono || '—')}</span></div>
            ${t.contacto?.telefono ? `
              <a class="btn" style="display:block;text-align:center;margin-top:12px;text-decoration:none"
                 href="https://wa.me/57${esc(String(t.contacto.telefono).replace(/\\D/g, '').slice(-10))}"
                 target="_blank" rel="noopener">Escribir por WhatsApp</a>` : ''}
          </div>
        </div>` : `
        <div class="bloque contacto--bloqueado">
          <div class="bloque__cab"><span class="cuadrito"></span> Identidad bloqueada</div>
          <div class="bloque__cuerpo">
            <div class="barra-oculta" style="width:70%"></div>
            <div class="barra-oculta" style="width:45%"></div>
            <div class="barra-oculta" style="width:82%"></div>
            <div class="barra-oculta" style="width:58%"></div>
            <p class="p" style="font-size:11.5px;margin-top:12px">
              Sus datos se revelan solos en el momento en que el pago queda retenido en escrow.
              Ni tú ni ella tienen que pedirlo.
            </p>
            <div class="chip-claro" style="margin-top:12px;display:inline-block">
              Falta: ${t.estado === 'solicitado' ? 'que ella acepte la propuesta' : 'retener el pago en escrow'}
            </div>
          </div>
        </div>`}

      <div class="bloque">
        <div class="bloque__cab">El dinero</div>
        <div class="bloque__cuerpo">
          <div class="dato-fila"><span>Monto a la creadora</span><span>${COP(t.monto_creadora)}</span></div>
          <div class="dato-fila"><span>Comisión plataforma ${t.comision_marca_pct}%</span>
            <span>+${COP(t.comision_marca_valor)}</span></div>
          <div style="border-top:1px solid var(--border-3);margin-top:8px;padding-top:12px">
            <div class="etiqueta">${etiquetaMonto}</div>
            <div class="dato-num" style="font-size:28px;border-left:4px solid var(--lima);
                 padding-left:10px;margin-top:6px">${COP(t.total_a_pagar_marca)}</div>
          </div>
        </div>
      </div>

      ${TOCA ? `
        <div class="bloque" style="border:2px solid var(--ink)">
          <div class="bloque__cab" style="background:var(--ink);color:#fff">Te toca a ti</div>
          <div class="bloque__cuerpo">
            <div class="h-sec" style="font-size:12px;margin-bottom:8px">${TOCA.t}</div>
            <p class="p" style="font-size:11.5px">${TOCA.d}</p>
            ${TOCA.boton ? `<button class="btn btn--lima" style="width:100%;margin-top:12px"
                             id="accion-trato">${TOCA.boton}</button>` : ''}
          </div>
        </div>` : ''}
    </aside>
  </div>`;

  $('volver-camp').addEventListener('click', () => ir('campanas'));
  $('accion-trato')?.addEventListener('click', async () => {
    const b = $('accion-trato');
    const original = b.textContent;
    b.disabled = true;

    // En "aceptado" el botón cobra; en "entregado" aprueba.
    if (t.estado === 'aceptado') {
      b.textContent = 'ABRIENDO PAGO…';
      try {
        const r = await apiPagos('/trato/' + t.id, { method: 'POST' });
        location.href = r.url;
      } catch (e) {
        alert(e.message);
        b.disabled = false; b.textContent = original;
      }
      return;
    }

    b.textContent = 'APROBANDO…';
    try {
      await api('/tratos/' + t.id + '/aprobar', { method: 'POST', body: '{}' });
      await cargarTratos();
      vistaTrato(c);
    } catch (e) {
      alert('No se pudo: ' + e.message);
      b.disabled = false; b.textContent = original;
    }
  });
}

// ── Modal de nueva campaña ──────────────────────────────────────────────────

let CAMP = null;

function abrirCampana() {
  const rt = E.cfg.rango_tope_campana || { min: 1000000, max: 30000000, paso: 500000 };
  const rp = E.cfg.rango_presupuesto || { min: 200000, max: 5000000, paso: 50000 };
  CAMP = {
    nombre: '', objetivo: 'lanzamiento', brief_base: '', entregables: [],
    fecha_inicio: '', fecha_fin: '', producto: 'ENVIADO', exclusividad: '',
    tope_total: rt.min * 3, tope_por_creadora: rp.max / 5,
  };
  pintarCampana();
  $('telon').classList.add('abierto');
}

function pintarCampana() {
  const c = CAMP;
  const rt = E.cfg.rango_tope_campana || { min: 1000000, max: 30000000, paso: 500000 };
  const rp = E.cfg.rango_presupuesto || { min: 200000, max: 5000000, paso: 50000 };
  const pct = Number(E.cfg.comision_marca_pct ?? 12);

  const disponible = Math.round(c.tope_total / (1 + pct / 100));
  const comision = c.tope_total - disponible;
  const alcanza = Math.floor(c.tope_total / (c.tope_por_creadora * (1 + pct / 100)));
  const califican = E.catalogo.filter(x => x.tarifa_min && x.tarifa_min <= c.tope_por_creadora).length;

  // El aviso cambia según lo que falte: es más útil que un texto fijo.
  let aviso;
  if (!c.entregables.length) {
    aviso = 'Marca al menos un entregable: sin eso no podemos mostrarte creadoras que sirvan.';
  } else if (!califican) {
    aviso = `Con ese tope por creadora no califica ninguno de los ${E.catalogo.length} perfiles. Súbelo.`;
  } else {
    aviso = 'El tope por creadora es un máximo, no un precio fijo: a quien cobre menos, le pagas menos.';
  }

  $('modal-hueco').innerHTML = `
  <div class="modal modal--campana">
    <div class="modal__cab">
      <h2 class="h-sec" style="font-size:15px">Nueva campaña</h2>
      <button class="cerrar" id="cerrar-camp" aria-label="Cerrar">×</button>
    </div>
    <div class="modal__cuerpo">
      <div class="modal__form">
        <div class="campo">
          <label>Nombre de la campaña</label>
          <input id="c-nombre" value="${esc(c.nombre)}" placeholder="Lanzamiento mantequilla capilar">
        </div>
        <div class="campo">
          <label>Objetivo</label>
          <select id="c-objetivo">
            ${(E.cfg.objetivos_campana || []).map(o =>
              `<option value="${o.clave}" ${c.objetivo === o.clave ? 'selected' : ''}>${esc(o.nombre)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="campo">
          <label>Brief base</label>
          <textarea id="c-brief" rows="4"
            placeholder="Se envía a todas las creadoras de esta campaña">${esc(c.brief_base)}</textarea>
        </div>
        <div class="campo">
          <label>Entregables que buscas</label>
          <div class="chips">
            ${(E.cfg.entregables || []).map(e => `
              <button class="chip-claro" data-ce="${e.clave}" style="cursor:pointer;${
                c.entregables.includes(e.clave) ? 'background:var(--ink);color:#fff;border-color:var(--ink)' : ''
              }">${esc(e.nombre)}</button>`).join('')}
          </div>
          <div class="contador">Solo verás creadoras que ofrezcan al menos uno.</div>
        </div>
        <div class="campos-2">
          <div class="campo"><label>Arranca</label><input type="date" id="c-ini" value="${esc(c.fecha_inicio)}"></div>
          <div class="campo"><label>Cierra</label><input type="date" id="c-fin" value="${esc(c.fecha_fin)}"></div>
        </div>
        <div class="campos-2">
          <div class="campo">
            <label>Producto</label>
            <select id="c-producto">
              <option ${c.producto === 'ENVIADO' ? 'selected' : ''}>ENVIADO</option>
              <option ${c.producto === 'YA LO TIENE' ? 'selected' : ''}>YA LO TIENE</option>
              <option ${c.producto === 'NO APLICA' ? 'selected' : ''}>NO APLICA</option>
            </select>
          </div>
          <div class="campo">
            <label>Exclusividad</label>
            <select id="c-excl">
              <option value="">No pide</option>
              <option value="30 días" ${c.exclusividad === '30 días' ? 'selected' : ''}>30 días</option>
              <option value="90 días" ${c.exclusividad === '90 días' ? 'selected' : ''}>90 días</option>
            </select>
          </div>
        </div>
      </div>

      <div class="modal__dinero">
        <div class="h-sec" style="font-size:11.5px;margin-bottom:14px">El presupuesto</div>

        <div class="campo">
          <label>Tope total de la campaña</label>
          <div class="dato-num" style="font-size:26px">${COP(c.tope_total)}</div>
          <input type="range" id="c-total" min="${rt.min}" max="${rt.max}" step="${rt.paso}"
                 value="${c.tope_total}" style="background:var(--border-2)">
        </div>

        <div class="campo">
          <label>Tope por creadora</label>
          <div class="dato-num" style="font-size:20px">${COP(c.tope_por_creadora)}</div>
          <input type="range" id="c-porc" min="${rp.min}" max="${rp.max}" step="${rp.paso}"
                 value="${c.tope_por_creadora}" style="background:var(--border-2)">
        </div>

        <div class="dinero-fila">
          <span class="dinero-fila__label">Disponible para creadoras</span>
          <span class="dinero-fila__valor">${COP(disponible)}</span>
        </div>
        <div class="dinero-fila">
          <span class="dinero-fila__label">Comisión plataforma ${pct}%</span>
          <span class="dinero-fila__valor">${COP(comision)}</span>
        </div>
        <div class="dinero-fila">
          <span class="dinero-fila__label">Perfiles que califican</span>
          <span class="dinero-fila__valor">${califican} de ${E.catalogo.length}</span>
        </div>

        <div class="dinero-total">
          <div class="etiqueta" style="color:var(--chip-dark-text)">Alcanza para</div>
          <div class="dinero-total__valor">${alcanza}</div>
          <div class="dinero-total__nota">colaboraciones con ese tope</div>
        </div>

        <p class="p" style="font-size:11px;margin-top:14px">${aviso}</p>

        <button class="btn btn--lima" style="width:100%;margin-top:14px" id="crear-camp">
          Crear y buscar creadoras →
        </button>
        <div class="etiqueta" style="margin-top:10px;text-align:center">Crear la campaña es gratis</div>
        <div class="oculto" id="camp-error" style="color:var(--magenta);font-size:11.5px;margin-top:10px"></div>
      </div>
    </div>
  </div>`;

  $('cerrar-camp').addEventListener('click', cerrarModal);
  document.querySelectorAll('[data-ce]').forEach(b => {
    b.addEventListener('click', () => {
      const k = b.dataset.ce;
      CAMP.entregables = CAMP.entregables.includes(k)
        ? CAMP.entregables.filter(x => x !== k)
        : [...CAMP.entregables, k];
      pintarCampana();
    });
  });
  $('c-total').addEventListener('input', () => { CAMP.tope_total = Number($('c-total').value); pintarCampana(); });
  $('c-porc').addEventListener('input', () => { CAMP.tope_por_creadora = Number($('c-porc').value); pintarCampana(); });
  ['nombre', 'objetivo', 'brief', 'ini', 'fin', 'producto', 'excl'].forEach(k => {
    const el = $('c-' + k);
    if (el) el.addEventListener('input', () => {
      const mapa = { nombre: 'nombre', objetivo: 'objetivo', brief: 'brief_base',
                     ini: 'fecha_inicio', fin: 'fecha_fin', producto: 'producto', excl: 'exclusividad' };
      CAMP[mapa[k]] = el.value;
    });
  });
  $('crear-camp').addEventListener('click', crearCampana);
}

async function crearCampana() {
  const btn = $('crear-camp');
  const err = $('camp-error');
  err.classList.add('oculto');
  btn.disabled = true;
  btn.textContent = 'CREANDO…';
  try {
    CAMP.nombre = $('c-nombre').value;
    CAMP.brief_base = $('c-brief').value;
    await api('/campanas', { method: 'POST', body: JSON.stringify(CAMP) });
    E.campanas = await api('/campanas');
    cerrarModal();
    // Se aplica el tope como filtro de presupuesto: la campaña recién creada
    // define con qué plata está trabajando.
    E.filtros.presupuesto = CAMP.tope_por_creadora;
    ir('catalogo');
    cargarCatalogo();
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('oculto');
    btn.disabled = false;
    btn.textContent = 'Crear y buscar creadoras →';
  }
}

// ── Perfil de la marca ──────────────────────────────────────────────────────

async function vistaPerfil(c) {
  c.innerHTML = '<p class="p">Cargando…</p>';
  let rep = {}, productos = [];
  try {
    [E.marca, rep] = await Promise.all([api('/me'), api('/reputacion').catch(() => ({}))]);
  } catch (e) {
    c.innerHTML = `<div class="estado estado--error"><div class="estado__cuadro">!</div>
      <div class="estado__titulo">No pudimos cargar tu perfil</div>
      <p class="estado__texto">${esc(e.message)}</p></div>`;
    return;
  }

  const m = E.marca;
  const bio = m.bio || '';

  // Checklist: qué le falta para que una creadora confíe.
  const items = [
    { ok: Boolean(m.nombre_empresa), t: 'Nombre de la marca' },
    { ok: Boolean(bio.trim()), t: 'Bio escrita' },
    { ok: Boolean(m.categoria), t: 'Categoría' },
    { ok: Boolean(m.instagram || m.tiktok), t: 'Al menos una red' },
    { ok: Boolean(m.que_espera), t: 'Qué esperas de una colaboración' },
  ];
  const completo = Math.round(items.filter(i => i.ok).length / items.length * 100);

  c.innerHTML = `
  <div class="vista-cab">
    <div class="vista-cab__texto">
      <h1 class="h1">Mi perfil</h1>
      <p class="p">Esto es lo que ve una creadora antes de decidir si acepta tu propuesta.
      Un perfil completo se acepta más.</p>
    </div>
    <span class="conteo">${completo}% completo</span>
  </div>

  <div class="perfil">
    <div class="perfil__col">
      <div class="bloque">
        <div class="bloque__cab">Identidad</div>
        <div class="bloque__cuerpo">
          <div class="campo"><label>Nombre de la marca</label>
            <input id="m-nombre" value="${esc(m.nombre_empresa || '')}"></div>
          <div class="campo"><label>Página web</label>
            <input id="m-web" value="${esc(m.sitio_web || '')}" placeholder="https://"></div>
          <div class="campo"><label>Bio</label>
            <textarea id="m-bio" rows="3" maxlength="400"
              placeholder="Qué hace tu marca, en pocas líneas">${esc(bio)}</textarea>
            <div class="contador ${bio.length > 380 ? 'pasado' : ''}" id="cont-bio">${bio.length} / 400</div>
          </div>
          <div class="campos-2">
            <div class="campo"><label>Categoría</label>
              <input id="m-categoria" value="${esc(m.categoria || '')}" placeholder="Cuidado capilar"></div>
            <div class="campo"><label>Ciudad base</label>
              <input id="m-ciudad" value="${esc(m.ciudad || '')}"></div>
          </div>
          <div class="campos-2">
            <div class="campo"><label>¿Con quién hablamos?</label>
              <input id="m-persona" value="${esc(m.nombre_contacto || '')}" placeholder="Nombre y apellido"></div>
            <div class="campo"><label>NIT</label>
              <input id="m-nit" value="${esc(m.nit || '')}" placeholder="900123456-7"></div>
          </div>
        </div>
      </div>

      <div class="bloque">
        <div class="bloque__cab">Cómo trabajas</div>
        <div class="bloque__cuerpo">
          <div class="campos-2">
            <div class="campo"><label>Instagram</label>
              <input id="m-ig" value="${m.instagram ? '@' + esc(m.instagram) : ''}" placeholder="@tumarca"></div>
            <div class="campo"><label>TikTok</label>
              <input id="m-tk" value="${m.tiktok ? '@' + esc(m.tiktok) : ''}" placeholder="@tumarca"></div>
          </div>
          <div class="campo"><label>Qué esperas de una colaboración</label>
            <textarea id="m-espera" rows="3"
              placeholder="Lo que valoras en el contenido que recibes">${esc(m.que_espera || '')}</textarea></div>
          <div class="campo"><label>Libertad creativa</label>
            <select id="m-libertad">
              <option value="">Sin definir</option>
              <option value="alta" ${m.libertad_creativa === 'alta' ? 'selected' : ''}>Alta · ella decide el enfoque</option>
              <option value="media" ${m.libertad_creativa === 'media' ? 'selected' : ''}>Media · con lineamientos</option>
              <option value="guion_cerrado" ${m.libertad_creativa === 'guion_cerrado' ? 'selected' : ''}>Guion cerrado</option>
            </select></div>
          <div class="campo"><label>Contacto para creadoras</label>
            <input id="m-contacto" value="${esc(m.contacto_creadoras || '')}" placeholder="correo o WhatsApp"></div>
        </div>
      </div>

      <button class="btn" id="guardar-perfil">Guardar perfil</button>
      <span class="oculto" id="perfil-msg" style="margin-left:12px;font-size:11.5px"></span>
    </div>

    <aside class="perfil__lado">
      <div class="bloque">
        <div class="bloque__cab">Como te ve la creadora</div>
        <div class="bloque__cuerpo">
          <div class="alias" id="vp-nombre">${esc(m.nombre_empresa || 'Tu marca')}</div>
          <div class="sub-id">${esc([m.ciudad, m.pais].filter(Boolean).join(' · '))}</div>
          <div class="tarjeta__chips" style="margin-top:10px">
            ${m.categoria ? `<span class="chip-claro chip-nicho">${esc(m.categoria)}</span>` : ''}
            <span class="chip-claro">${rep.tratos_cerrados || 0} tratos cerrados</span>
          </div>
          <p class="p" style="font-size:11.5px;margin-top:12px" id="vp-bio">
            ${bio.trim() ? esc(bio) : 'Todavía no has escrito tu bio. Las creadoras ven este espacio vacío.'}
          </p>
        </div>
      </div>

      <div class="bloque">
        <div class="bloque__cab">Tu reputación</div>
        <div class="bloque__cuerpo">
          <div class="dato-fila"><span>Tratos cerrados</span><span>${rep.tratos_cerrados || 0}</span></div>
          <div class="dato-fila"><span>Aprobación promedio</span>
            <span>${rep.horas_aprobacion_promedio != null ? rep.horas_aprobacion_promedio + ' h' : '—'}</span></div>
          <div style="border-top:1px solid var(--border-3);margin-top:8px;padding-top:12px">
            <div class="etiqueta">Pagado en la plataforma</div>
            <div class="dato-num" style="font-size:20px;border-left:4px solid var(--lima);
                 padding-left:10px;margin-top:6px">${COP(rep.pagado_en_plataforma)}</div>
          </div>
          <p class="p" style="font-size:11px;margin-top:12px">
            Estos números los calcula la plataforma. No se pueden editar: es lo que le da confianza a la creadora.
          </p>
        </div>
      </div>

      <div class="bloque">
        <div class="bloque__cab">Para completar el perfil</div>
        <div class="bloque__cuerpo">
          ${items.map(i => `
            <div class="checklist-item">
              <span class="check-c ${i.ok ? 'ok' : ''}">${i.ok ? '✓' : ''}</span>
              <span>${i.t}</span>
            </div>`).join('')}
        </div>
      </div>
    </aside>
  </div>`;

  // La vista previa se actualiza mientras escribe: ve el efecto de lo que hace.
  $('m-bio').addEventListener('input', () => {
    const v = $('m-bio').value;
    $('cont-bio').textContent = `${v.length} / 400`;
    $('cont-bio').classList.toggle('pasado', v.length > 380);
    $('vp-bio').textContent = v.trim() || 'Todavía no has escrito tu bio. Las creadoras ven este espacio vacío.';
  });
  $('m-nombre').addEventListener('input', () => {
    $('vp-nombre').textContent = $('m-nombre').value || 'Tu marca';
  });

  $('guardar-perfil').addEventListener('click', async () => {
    const btn = $('guardar-perfil');
    const msg = $('perfil-msg');
    btn.disabled = true; btn.textContent = 'GUARDANDO…';
    try {
      await api('/me', {
        method: 'PUT',
        body: JSON.stringify({
          nombre_empresa: $('m-nombre').value,
          sitio_web: $('m-web').value,
          bio: $('m-bio').value,
          categoria: $('m-categoria').value,
          ciudad: $('m-ciudad').value,
          nombre_contacto: $('m-persona').value,
          nit: $('m-nit').value,
          instagram: $('m-ig').value,
          tiktok: $('m-tk').value,
          que_espera: $('m-espera').value,
          libertad_creativa: $('m-libertad').value,
          contacto_creadoras: $('m-contacto').value,
        }),
      });
      msg.textContent = 'Guardado.';
      msg.classList.remove('oculto');
      vistaPerfil(c);
    } catch (e) {
      msg.textContent = e.message;
      msg.style.color = 'var(--magenta)';
      msg.classList.remove('oculto');
    } finally {
      btn.disabled = false; btn.textContent = 'Guardar perfil';
    }
  });
}
