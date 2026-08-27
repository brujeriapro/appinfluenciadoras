// Ficha ampliada de la creadora y modal de propuesta.
//
// Está en un archivo aparte por tamaño; comparte el estado global `E` y las
// utilidades declaradas en panel.html.

// ── Ficha ───────────────────────────────────────────────────────────────────

let FICHA = null;      // datos de la creadora abierta
let TARIFA_SEL = null; // entregable elegido en el panel de la derecha

/**
 * Historial de entregas, con el detalle que no cabe en el sello del catálogo.
 *
 * Es lo que sostiene la mitad "si cumple" de lo que le prometemos a la marca,
 * así que cada número aquí sale de una fecha real: el día que se despachó su
 * kit y el día que publicó, o el plazo pactado en un trato y el día que
 * entregó. Nada es estimado.
 *
 * Cuando no hay historial se dice sin rodeos y se explica por qué, en vez de
 * mostrar un cuadro de ceros que se lee como un mal antecedente.
 */
/**
 * Cómo trabaja: el retrato de su estilo, sacado de analizar sus piezas.
 *
 * Es la respuesta a "¿su contenido le va a servir a mi producto?", que hoy una
 * marca solo puede contestar abriendo video por video.
 *
 * Solo se afirma lo que se repite: un formato entra aquí si aparece en un
 * tercio o más de sus piezas, y hacen falta al menos dos piezas analizadas
 * para hablar de estilo. Con una sola no hay patrón, hay una casualidad.
 */
const NOMBRE_FORMATO = {
  habla_camara: 'Habla a cámara', voz_en_off: 'Voz en off', sin_voz: 'Sin voz',
  tutorial: 'Tutorial', antes_despues: 'Antes y después', unboxing: 'Unboxing',
  rutina: 'Rutina', resena: 'Reseña', grwm: 'Arréglate conmigo', trend: 'Trends',
  otro: 'Otros formatos',
};
const NOMBRE_ESCENARIO = {
  'baño': 'Baño', cocina: 'Cocina', dormitorio: 'Dormitorio', sala: 'Sala',
  exterior: 'Exterior', estudio: 'Estudio', calle: 'Calle', gimnasio: 'Gimnasio',
  carro: 'Carro', otro: 'Otros',
};
const NOMBRE_PRODUCCION = {
  casera: 'Casera y natural', cuidada: 'Cuidada', profesional: 'Profesional',
};
const NOMBRE_LUZ = {
  natural: 'Luz natural', artificial_calida: 'Luz cálida',
  artificial_fria: 'Luz fría', anillo: 'Aro de luz', mixta: 'Luz mixta',
};

/**
 * Los paquetes que ella misma armó.
 *
 * Se muestran antes que su trabajo y que las tarifas sueltas porque es la
 * oferta que le conviene a las dos partes: a la marca le sale más barato que
 * comprar pieza por pieza, y cierra un trato más grande de una sola vez.
 *
 * El ahorro que se anuncia sale de comparar contra las tarifas de ELLA, no de
 * un descuento inventado por la plataforma. Cuando no hay ahorro real, no se
 * dice nada — un "ahorra $0" sería peor que el silencio.
 */
function paquetesHTML(paquetes, entregables = []) {
  const lista = (paquetes || []).filter(p => p.activo !== false);
  if (!lista.length) return '';

  const nombreDe = (c) => (entregables.find(e => e.clave === c) || {}).nombre || c;

  return `
  <div class="h-sec" style="margin:26px 0 4px">Sus paquetes</div>
  <div class="etiqueta" style="margin-bottom:12px">
    Varias piezas por un precio cerrado, armadas por ella
  </div>
  <div class="paquetes-ficha">
    ${lista.map(p => `
      <div class="paq-card">
        <div class="paq-card__cab">
          <div>
            <div class="paq-card__nombre">${esc(p.nombre)}</div>
            ${p.descripcion ? `<div class="paq-card__desc">${esc(p.descripcion)}</div>` : ''}
          </div>
          <div class="paq-card__precio">${COP(p.precio)}</div>
        </div>
        <div class="paq-card__incluye">
          ${(p.incluye || []).map(l =>
            `<span class="chip-claro">${l.cantidad}× ${esc(nombreDe(l.entregable))}</span>`).join('')}
        </div>
        ${p.ahorro ? `
          <div class="paq-card__ahorro">
            Suelto: ${COP(p.precio_suelto)} · <strong>ahorras ${COP(p.ahorro)}</strong>
          </div>` : ''}
      </div>`).join('')}
  </div>`;
}

function contenidoHTML(perfil) {
  if (!perfil || !perfil.piezas_analizadas) return '';

  const chips = (lista, dic) => (lista || [])
    .map(v => `<span class="chip-claro">${esc(dic[v] || v)}</span>`).join('');

  const formatos   = chips(perfil.formatos, NOMBRE_FORMATO);
  const escenarios = chips(perfil.escenarios, NOMBRE_ESCENARIO);
  const estilo     = [NOMBRE_PRODUCCION[perfil.produccion], NOMBRE_LUZ[perfil.luz]]
    .filter(Boolean)
    .map(t => `<span class="chip-claro">${esc(t)}</span>`).join('');

  if (!formatos && !escenarios && !estilo) return '';

  return `
  <div class="historial">
    <div class="h-sec" style="font-size:11.5px;margin-bottom:10px">Cómo trabaja</div>
    ${formatos ? `
      <div class="etiqueta" style="margin-bottom:5px">Formatos que domina</div>
      <div class="tarjeta__chips" style="margin-bottom:12px">${formatos}</div>` : ''}
    ${escenarios ? `
      <div class="etiqueta" style="margin-bottom:5px">Dónde graba</div>
      <div class="tarjeta__chips" style="margin-bottom:12px">${escenarios}</div>` : ''}
    ${estilo ? `
      <div class="etiqueta" style="margin-bottom:5px">Estilo</div>
      <div class="tarjeta__chips">${estilo}</div>` : ''}
    <p class="p" style="font-size:11px;color:var(--text-3);margin-top:12px">
      Leído de sus ${perfil.piezas_analizadas} pieza${perfil.piezas_analizadas === 1 ? '' : 's'}
      publicadas${perfil.calidad_tecnica ? ` · calidad técnica ${perfil.calidad_tecnica}/5` : ''}.
      Solo se listan los formatos que repite, no los que hizo una vez.
    </p>
  </div>`;
}

function historialHTML(cump) {
  const c = cump || {};
  const entregas = Number(c.entregas || 0);

  if (!entregas) {
    return `
    <div class="historial historial--vacio">
      <div class="h-sec" style="font-size:11.5px;margin-bottom:6px">Sin historial todavía</div>
      <p class="p" style="font-size:11.5px">Todavía no ha completado colaboraciones en la
      plataforma, así que no tenemos con qué responderte si entrega a tiempo. No es una
      señal en contra: la mayoría de perfiles nuevos empieza aquí.</p>
    </div>`;
  }

  const aTiempo = Number(c.entregas_a_tiempo || 0);
  const dias    = c.dias_primera_entrega;
  const piezas  = Number(c.piezas_publicadas || 0);

  const celda = (valor, label) => `
    <div class="historial__dato">
      <div class="historial__valor">${esc(String(valor))}</div>
      <div class="metrica__label">${esc(label)}</div>
    </div>`;

  return `
  <div class="historial">
    <div class="h-sec" style="font-size:11.5px;margin-bottom:10px">Historial verificado</div>
    <div class="historial__grid">
      ${celda(entregas, entregas === 1 ? 'Colaboración' : 'Colaboraciones')}
      ${celda(`${aTiempo} de ${entregas}`, 'A tiempo')}
      ${dias != null ? celda(dias + ' días', 'Tardó en publicar') : ''}
      ${piezas ? celda(piezas, piezas === 1 ? 'Pieza publicada' : 'Piezas publicadas') : ''}
    </div>
    <p class="p" style="font-size:11px;color:var(--text-3);margin-top:10px">
      Calculado sobre entregas reales registradas en la plataforma, no sobre lo que ella declara.
    </p>
  </div>`;
}

async function vistaFicha(c) {
  c.innerHTML = '<p class="p">Cargando…</p>';
  try {
    const res = await fetch('/api/catalogo/' + E.fichaId, {
      headers: { 'Authorization': 'Bearer ' + TOKEN },
    });
    if (res.status === 402) {
      const d = await res.json();
      const err = new Error(d.error);
      err.muro = d;
      throw err;
    }
    if (!res.ok) throw new Error('No pudimos cargar esa ficha');
    FICHA = await res.json();
    // El consumo pudo cambiar al abrir esta ficha.
    if (FICHA.fichas_tope != null && E.plan) {
      E.plan.fichas_vistas = FICHA.fichas_vistas;
      pintarPlan();
    }
  } catch (e) {
    // El muro no es un error: la marca llegó al tope de su plan.
    if (e.muro) {
      ir('catalogo');
      mostrarMuro(e.muro);
      return;
    }
    c.innerHTML = `<div class="estado estado--error">
      <div class="estado__cuadro">!</div>
      <div class="estado__titulo">No pudimos abrir la ficha</div>
      <p class="estado__texto">${esc(e.message)}</p></div>`;
    return;
  }

  const tarifas = FICHA.tarifas || [];
  if (!TARIFA_SEL && tarifas.length) TARIFA_SEL = tarifas[0].entregable;

  const nombreEntregable = (clave) => {
    const e = (E.cfg.entregables || []).find(x => x.clave === clave);
    return e ? e.nombre : clave;
  };
  const detalleEntregable = (clave) => {
    const e = (E.cfg.entregables || []).find(x => x.clave === clave);
    return e && e.subtitulo ? e.subtitulo : '';
  };

  const ms = FICHA.muestras || [];
  const elegida = tarifas.find(t => t.entregable === TARIFA_SEL);

  c.innerHTML = `
  <div class="ficha">
    <div class="ficha__col">
      <div class="migas">
        <button id="volver-cat">← Catálogo</button> / ${esc(FICHA.codigo || '')}
      </div>
      <h1 class="alias-grande">${esc(FICHA.nombre_publico)}</h1>

      <div class="tarjeta__chips" style="margin-top:14px">
        ${(FICHA.nicho || []).map(n => `<span class="chip-claro chip-nicho">${esc(n)}</span>`).join('')}
        ${FICHA.ciudad ? `<span class="chip-claro">${esc(FICHA.ciudad)}</span>` : ''}
        ${selloHTML(FICHA.cumplimiento, { metricas: FICHA.metricas_estado })}
        ${metricasHTML(FICHA.metricas_estado)}
      </div>

      ${contenidoHTML(FICHA.contenido)}
      ${historialHTML(FICHA.cumplimiento)}

      <div class="aviso-anon">
        <div class="aviso-anon__cuadro">!</div>
        <div>
          <div class="h-sec" style="font-size:11.5px;margin-bottom:6px">Contratas por trabajo, no por nombre</div>
          <p class="p" style="font-size:11.5px">Su nombre real, su cuenta de redes y su contacto
          se revelan solos en el momento en que el pago queda retenido en escrow.
          No tienes que pedirlo ni ella tiene que enviarlo.</p>
        </div>
      </div>

      ${paquetesHTML(FICHA.paquetes, E.cfg.entregables)}

      <div class="h-sec" style="margin:26px 0 4px">Su trabajo</div>
      <div class="etiqueta" style="margin-bottom:12px">${ms.length} pieza${ms.length === 1 ? '' : 's'} publicadas</div>
      ${ms.length ? `
        <div class="obra">
          <div class="obra__princ">${pieza(ms[0])}</div>
          <div class="obra__lado">
            <div>${pieza(ms[1])}</div>
            <div>${pieza(ms[2])}</div>
          </div>
        </div>` : '<p class="p">Todavía no ha subido piezas.</p>'}

      <div class="h-sec" style="margin:30px 0 4px">Sus números</div>
      <div class="etiqueta" style="margin-bottom:12px">
        ${FICHA.fuente_metricas === 'verificado' ? 'Conectados a sus cuentas' : 'Declarados por ella'}
      </div>

      <div class="grupo-num">
        <div class="grupo-num__cab">Alcance por red</div>
        <div class="grupo-num__cuerpo">
          <div>
            <div class="num-grande">${esc(FICHA.rango_instagram || '—')}</div>
            <div class="metrica__label">Instagram</div>
          </div>
          <div>
            <div class="num-grande">${esc(FICHA.rango_tiktok || '—')}</div>
            <div class="metrica__label">TikTok</div>
          </div>
        </div>
      </div>

      ${(FICHA.audiencia_mujeres || FICHA.audiencia_pais) ? `
      <div class="grupo-num">
        <div class="grupo-num__cab">Su audiencia</div>
        <div class="grupo-num__cuerpo">
          ${FICHA.audiencia_mujeres ? `<div><div class="num-medio">${FICHA.audiencia_mujeres}%</div>
            <div class="metrica__label">Mujeres</div></div>` : ''}
          ${FICHA.audiencia_pais ? `<div><div class="num-medio">${FICHA.audiencia_pais}%</div>
            <div class="metrica__label">En su país</div></div>` : ''}
        </div>
      </div>` : ''}

      <div class="grupo-num">
        <div class="grupo-num__cab">Cómo trabaja</div>
        <div class="grupo-num__cuerpo">
          <div><div class="num-medio">${FICHA.engagement_pct != null ? FICHA.engagement_pct + '%' : '—'}</div>
               <div class="metrica__label">Engagement</div></div>
          <div><div class="num-medio">${FICHA.dias_entrega ? FICHA.dias_entrega + ' días' : '—'}</div>
               <div class="metrica__label">Entrega promedio</div></div>
        </div>
      </div>
    </div>

    <aside class="ficha__panel">
      <div class="bloque__cab" style="border-bottom:2px solid var(--ink)">Sus tarifas</div>
      <div id="tarifas-lista">
        ${(E.cfg.entregables || []).map(ent => {
          const t = tarifas.find(x => x.entregable === ent.clave);
          if (!t) return `
            <div class="tarifa-op off">
              <div>
                <div class="tarifa-op__nom">${esc(ent.nombre)}</div>
                <div class="tarifa-op__det">No lo ofrece</div>
              </div>
              <div class="tarifa-op__monto">—</div>
            </div>`;
          return `
            <button class="tarifa-op ${TARIFA_SEL === ent.clave ? 'on' : ''}" data-tarifa="${ent.clave}">
              <div>
                <div class="tarifa-op__nom">${esc(ent.nombre)}</div>
                <div class="tarifa-op__det">${esc(ent.subtitulo || '')}</div>
              </div>
              <div class="tarifa-op__monto">${COP(t.precio)}</div>
            </button>`;
        }).join('')}
      </div>

      <div class="panel-pie">
        <div class="etiqueta" style="color:var(--chip-dark-text)">
          ${elegida ? esc(nombreEntregable(elegida.entregable)) : 'Escoge un entregable'}
        </div>
        <div class="panel-pie__total" id="total-ficha">
          ${elegida ? COP(totalConComision(elegida.precio)) : '—'}
        </div>
        <div class="etiqueta" style="color:var(--chip-dark-text)">Total a pagar, comisión incluida</div>
        <button class="btn btn--lima" style="width:100%;margin-top:14px" id="abrir-propuesta"
                ${elegida ? '' : 'disabled'}>Enviar propuesta</button>
        <div class="panel-pie__nota">No se cobra nada hasta que ella acepte</div>
      </div>
    </aside>
  </div>`;

  $('volver-cat').addEventListener('click', () => ir('catalogo'));
  c.querySelectorAll('[data-tarifa]').forEach(b => {
    b.addEventListener('click', () => { TARIFA_SEL = b.dataset.tarifa; vistaFicha(c); });
  });
  $('abrir-propuesta').addEventListener('click', () => abrirPropuesta(FICHA, elegida));
}

/** La comisión de la marca se suma al monto: es lo que de verdad va a pagar. */
function totalConComision(monto) {
  const pct = Number(E.cfg.comision_marca_pct ?? 12);
  return Math.round(monto) + Math.round(monto * pct / 100);
}

// ── Modal de propuesta ──────────────────────────────────────────────────────

let PROP = null;

function abrirPropuesta(creadora, tarifaElegida) {
  const rp = E.cfg.rango_presupuesto || { min: 200000, max: 5000000, paso: 10000 };
  PROP = {
    creadora,
    entregable: tarifaElegida ? tarifaElegida.entregable : null,
    tarifaPublicada: tarifaElegida ? Number(tarifaElegida.precio) : null,
    monto: tarifaElegida ? Number(tarifaElegida.precio) : rp.min,
    origen: E.campanas.length ? 'campana' : 'perso',
    campana_id: E.campanas.length ? E.campanas[0].id : null,
    brief: '',
    fecha: '',
    producto: 'ENVIADO',
    exclusividad: '',
  };
  if (PROP.origen === 'campana') heredarDeCampana();
  pintarPropuesta();
  $('telon').classList.add('abierto');
}

function heredarDeCampana() {
  const c = E.campanas.find(x => x.id === PROP.campana_id);
  if (!c) return;
  PROP.brief = c.brief_base || '';
  PROP.fecha = c.fecha_fin || '';
  PROP.producto = c.producto || 'ENVIADO';
  PROP.exclusividad = c.exclusividad || '';
}

function cerrarModal() {
  $('telon').classList.remove('abierto');
  $('modal-hueco').innerHTML = '';
}
$('telon').addEventListener('click', (e) => { if (e.target === $('telon')) cerrarModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') cerrarModal(); });

function pintarPropuesta() {
  const p = PROP;
  const rp = E.cfg.rango_presupuesto || { min: 200000, max: 5000000, paso: 10000 };
  const tarifas = (p.creadora.tarifas || []);
  const pctMarca = Number(E.cfg.comision_marca_pct ?? 12);
  const pctCreadora = Number(E.cfg.comision_creadora_pct ?? 8);

  const comision = Math.round(p.monto * pctMarca / 100);
  const total = Math.round(p.monto) + comision;
  const neto = Math.round(p.monto) - Math.round(p.monto * pctCreadora / 100);
  const bajoTarifa = p.tarifaPublicada && p.monto < p.tarifaPublicada;

  const campanaActual = E.campanas.find(c => c.id === p.campana_id);

  $('modal-hueco').innerHTML = `
  <div class="modal">
    <div class="modal__cab">
      <div>
        <h2 class="h-sec" style="font-size:15px">Proponer a ${esc(p.creadora.nombre_publico)}</h2>
        <div class="etiqueta" style="margin-top:6px">
          ${esc(p.creadora.codigo || '')}${campanaActual && p.origen === 'campana'
            ? ' · desde ' + esc(campanaActual.nombre) : ''}
        </div>
      </div>
      <button class="cerrar" id="cerrar-modal" aria-label="Cerrar">×</button>
    </div>

    <div class="modal__cuerpo">
      <div class="modal__form">
        <div class="origen">
          <button class="btn btn--sm ${p.origen === 'campana' ? '' : 'btn--linea'}"
                  data-origen="campana" ${E.campanas.length ? '' : 'disabled'}>De una campaña</button>
          <button class="btn btn--sm ${p.origen === 'perso' ? '' : 'btn--linea'}"
                  data-origen="perso">Personalizada</button>
        </div>

        ${p.origen === 'campana' ? `
          <div class="campo">
            <label>¿De cuál campaña?</label>
            ${E.campanas.length ? E.campanas.map(c => `
              <button class="plantilla ${p.campana_id === c.id ? 'on' : ''}" data-campana="${c.id}">
                <div class="plantilla__nom">${esc(c.nombre)}</div>
                <div class="plantilla__meta">
                  ${c.fecha_fin ? 'Hasta ' + fecha(c.fecha_fin) : 'Siempre abierta'} ·
                  ${COP(c.tope_total)} · ${c.propuestas_enviadas || 0} enviadas
                </div>
              </button>`).join('') : '<p class="p">Todavía no tienes campañas.</p>'}
            <button class="btn btn--linea btn--sm" id="nueva-campana-modal" style="margin-top:6px">
              + Crear campaña nueva
            </button>
          </div>` : ''}

        <div class="campo">
          <label>Entregable</label>
          <div class="chips">
            ${tarifas.map(t => `
              <button class="chip-claro" data-ent="${t.entregable}"
                      style="cursor:pointer;${p.entregable === t.entregable
                        ? 'background:var(--ink);color:#fff;border-color:var(--ink)' : ''}">
                ${esc((E.cfg.entregables || []).find(e => e.clave === t.entregable)?.nombre || t.entregable)}
              </button>`).join('')}
          </div>
        </div>

        <div class="campo">
          <label>Cuánto le ofreces</label>

          <!-- El monto se escribe. El deslizador queda de apoyo para tantear,
               pero con 480 posiciones nunca fue una forma de poner una cifra
               exacta, y menos en un teléfono. -->
          <div class="monto-caja">
            <span class="monto-caja__signo">$</span>
            <input type="text" id="monto-txt" inputmode="numeric" class="monto-caja__campo"
                   value="${Math.round(p.monto).toLocaleString('es-CO')}"
                   aria-label="Monto que le ofreces en pesos">
            <span class="monto-caja__moneda">COP</span>
          </div>

          <div class="monto-atajos">
            ${p.tarifaPublicada ? `<button type="button" class="atajo atajo--tarifa" data-monto="${p.tarifaPublicada}">Su tarifa · ${COP(p.tarifaPublicada)}</button>` : ''}
            <button type="button" class="atajo" data-suma="-50000">−50 mil</button>
            <button type="button" class="atajo" data-suma="50000">+50 mil</button>
            <button type="button" class="atajo" data-suma="100000">+100 mil</button>
          </div>

          <input type="range" id="monto" min="${rp.min}" max="${rp.max}" step="10000"
                 value="${p.monto}" aria-hidden="true" tabindex="-1"
                 style="background:var(--border-2)">
          <div class="rango-extremos">
            <span>${COP(rp.min)}</span>
            <span>${COP(rp.max)}</span>
          </div>
          <span class="alerta-tarifa ${bajoTarifa ? '' : 'oculto'}" id="aviso-bajo">Por debajo de su tarifa</span>
        </div>

        <div class="campo">
          <label>El brief</label>
          <textarea id="brief" rows="5" placeholder="Qué quieres que muestre, cómo y con qué producto">${esc(p.brief)}</textarea>
        </div>

        <div class="campos-2">
          <div class="campo">
            <label>Fecha esperada</label>
            <input type="date" id="fecha" value="${esc(p.fecha || '')}">
          </div>
          <div class="campo">
            <label>Producto</label>
            <select id="producto">
              <option ${p.producto === 'ENVIADO' ? 'selected' : ''}>ENVIADO</option>
              <option ${p.producto === 'YA LO TIENE' ? 'selected' : ''}>YA LO TIENE</option>
              <option ${p.producto === 'NO APLICA' ? 'selected' : ''}>NO APLICA</option>
            </select>
          </div>
        </div>

        <!-- "ENVIADO" no le dice a la creadora qué le va a llegar. Opcional,
             pero quien lo llena manda una propuesta que se entiende sola. -->
        <div class="campo ${p.producto === 'NO APLICA' ? 'oculto' : ''}" id="campo-prod-det">
          <label>Qué producto le mandas <span class="opcional">opcional</span></label>
          <input id="producto_detalle" maxlength="160"
                 value="${esc(p.producto_detalle || '')}"
                 placeholder="Crema para peinar Rizos 300ml + termoprotector">
        </div>

        <div class="campo">
          <label>Exclusividad</label>
          <select id="exclusividad">
            <option value="">No pide</option>
            <option value="30 días" ${p.exclusividad === '30 días' ? 'selected' : ''}>30 días</option>
            <option value="90 días" ${p.exclusividad === '90 días' ? 'selected' : ''}>90 días</option>
          </select>
          <div class="contador">Pedir exclusividad sube el costo: ella no puede trabajar con marcas del mismo rubro.</div>
        </div>

        <!-- Sin decir con quién no puede trabajar, la creadora no sabe a qué
             está renunciando y es lo que más hace rechazar una propuesta. -->
        <div class="campo ${p.exclusividad ? '' : 'oculto'}" id="campo-excl-det">
          <label>Con qué no puede trabajar <span class="opcional">opcional</span></label>
          <input id="exclusividad_detalle" maxlength="160"
                 value="${esc(p.exclusividad_detalle || '')}"
                 placeholder="Otras marcas de cuidado capilar">
        </div>
      </div>

      <div class="modal__dinero">
        <div class="h-sec" style="font-size:11.5px;margin-bottom:12px">El dinero, en vivo</div>

        <div class="dinero-fila">
          <span class="dinero-fila__label">Monto acordado</span>
          <span class="dinero-fila__valor" id="d-monto">${COP(p.monto)}</span>
        </div>
        <div class="dinero-fila">
          <span class="dinero-fila__label">Comisión plataforma ${pctMarca}%</span>
          <span class="dinero-fila__valor" id="d-comision">+${COP(comision)}</span>
        </div>
        <div class="dinero-fila">
          <span class="dinero-fila__label">Ella recibe (neto)</span>
          <span class="dinero-fila__valor" id="d-neto" style="color:var(--text-3)">${COP(neto)}</span>
        </div>

        <div class="dinero-total">
          <div class="etiqueta" style="color:var(--chip-dark-text)">Total que tú pagas</div>
          <div class="dinero-total__valor" id="d-total">${COP(total)}</div>
          <div class="dinero-total__nota">
            Se cobra solo si ella acepta. Queda retenido en escrow hasta que apruebes el contenido.
          </div>
        </div>

        <p class="p" style="font-size:11px;margin-top:14px">
          Cuando acepte y el pago quede retenido, se revelan su nombre, su cuenta y su contacto.
        </p>

        <button class="btn btn--lima" style="width:100%;margin-top:14px" id="enviar-prop">
          Enviar propuesta · <span id="d-boton">${COP(total)}</span>
        </button>
        <button class="btn btn--linea" style="width:100%;margin-top:8px" id="cancelar-prop">Cancelar</button>
        <div class="etiqueta" style="margin-top:10px;text-align:center">
          Ella tiene ${E.cfg.horas_responder || 72} horas para responder
        </div>
        <div class="error oculto" id="prop-error" style="color:var(--magenta);font-size:11.5px;margin-top:10px"></div>
      </div>
    </div>
  </div>`;

  // Conexiones
  $('cerrar-modal').addEventListener('click', cerrarModal);
  $('cancelar-prop').addEventListener('click', cerrarModal);

  document.querySelectorAll('[data-origen]').forEach(b => {
    b.addEventListener('click', () => {
      PROP.origen = b.dataset.origen;
      if (PROP.origen === 'campana') heredarDeCampana();
      pintarPropuesta();
    });
  });

  document.querySelectorAll('[data-campana]').forEach(b => {
    b.addEventListener('click', () => {
      PROP.campana_id = b.dataset.campana;
      heredarDeCampana();
      pintarPropuesta();
    });
  });

  document.querySelectorAll('[data-ent]').forEach(b => {
    b.addEventListener('click', () => {
      PROP.entregable = b.dataset.ent;
      const t = tarifas.find(x => x.entregable === b.dataset.ent);
      // Al cambiar de entregable el monto salta a la tarifa de ese entregable:
      // dejar el anterior sería proponerle un precio que no corresponde.
      PROP.tarifaPublicada = t ? Number(t.precio) : null;
      PROP.monto = PROP.tarifaPublicada || PROP.monto;
      pintarPropuesta();
    });
  });

  // ── El monto ──────────────────────────────────────────────────────────
  //
  // Antes cada movimiento del deslizador repintaba el modal entero, y eso
  // hacía que arrastrar se sintiera trabado: el elemento se destruía y se
  // volvía a crear a mitad del gesto. Ahora solo se reescriben las cifras que
  // cambian, que son cinco.
  const slider = $('monto');
  const campo = $('monto-txt');
  const rango = E.cfg.rango_presupuesto || { min: 200000, max: 5000000, paso: 10000 };

  function refrescarDinero() {
    const m = Math.round(PROP.monto);
    const pctM = Number(E.cfg.comision_marca_pct ?? 12);
    const pctC = Number(E.cfg.comision_creadora_pct ?? 8);
    const comision = Math.round(m * pctM / 100);
    const total = m + comision;

    $('d-monto').textContent = COP(m);
    $('d-comision').textContent = '+' + COP(comision);
    $('d-neto').textContent = COP(m - Math.round(m * pctC / 100));
    $('d-total').textContent = COP(total);
    $('d-boton').textContent = COP(total);

    const bajo = PROP.tarifaPublicada && m < PROP.tarifaPublicada;
    $('aviso-bajo').classList.toggle('oculto', !bajo);
  }

  /** Fija el monto y deja de acuerdo los tres controles. */
  function fijarMonto(valor, { escribiendo = false } = {}) {
    let m = Math.max(0, Math.round(Number(valor) || 0));
    PROP.monto = m;
    // El deslizador solo llega hasta su tope; el campo escrito no tiene por
    // qué quedar limitado por eso.
    slider.value = Math.min(Math.max(m, rango.min), rango.max);
    if (!escribiendo) campo.value = m.toLocaleString('es-CO');
    refrescarDinero();
  }

  slider.addEventListener('input', () => fijarMonto(slider.value));

  // Mientras escribe se deja el texto como está —reformatearlo en cada tecla
  // mueve el cursor y vuelve loco a cualquiera— y se ordena al salir.
  campo.addEventListener('input', () => {
    fijarMonto(campo.value.replace(/[^\d]/g, ''), { escribiendo: true });
  });
  campo.addEventListener('blur', () => fijarMonto(PROP.monto));
  campo.addEventListener('focus', () => campo.select());

  document.querySelectorAll('.atajo').forEach(b => {
    b.addEventListener('click', () => {
      fijarMonto(b.dataset.monto !== undefined
        ? Number(b.dataset.monto)
        : PROP.monto + Number(b.dataset.suma));
    });
  });
  ['brief', 'fecha', 'producto', 'exclusividad'].forEach(id => {
    $(id).addEventListener('change', () => {
      PROP[id] = $(id).value;
      // El detalle solo tiene sentido si hay algo que detallar.
      if (id === 'producto') {
        $('campo-prod-det').classList.toggle('oculto', $(id).value === 'NO APLICA');
      }
      if (id === 'exclusividad') {
        $('campo-excl-det').classList.toggle('oculto', !$(id).value);
      }
    });
  });

  ['producto_detalle', 'exclusividad_detalle'].forEach(id => {
    $(id).addEventListener('input', () => { PROP[id] = $(id).value; });
  });
  $('brief').addEventListener('input', () => { PROP.brief = $('brief').value; });

  $('nueva-campana-modal')?.addEventListener('click', () => abrirCampana());
  $('enviar-prop').addEventListener('click', enviarPropuesta);
}

async function enviarPropuesta() {
  const btn = $('enviar-prop');
  const err = $('prop-error');
  err.classList.add('oculto');
  btn.disabled = true;
  btn.textContent = 'ENVIANDO…';
  try {
    PROP.brief = $('brief').value;
    if (!PROP.brief.trim()) throw new Error('Escribe el brief: es lo que ella lee para decidir.');

    await api('/tratos', {
      method: 'POST',
      body: JSON.stringify({
        creadora_id: PROP.creadora.id,
        campana_id: PROP.origen === 'campana' ? PROP.campana_id : null,
        entregables: (E.cfg.entregables || []).find(e => e.clave === PROP.entregable)?.nombre || PROP.entregable,
        monto: PROP.monto,
        brief: PROP.brief,
        fecha_entrega_esperada: $('fecha').value || null,
        producto: $('producto').value,
        producto_detalle: $('producto_detalle').value.trim() || null,
        exclusividad: $('exclusividad').value || null,
        exclusividad_detalle: $('exclusividad_detalle').value.trim() || null,
      }),
    });
    cerrarModal();
    await cargarTratos();
    ir('campanas');
  } catch (e) {
    err.textContent = e.message;
    err.classList.remove('oculto');
    btn.disabled = false;
    btn.textContent = 'Enviar propuesta';
  }
}
