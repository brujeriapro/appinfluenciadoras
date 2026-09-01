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

/**
 * Su trabajo: la pieza principal y hasta dos al lado.
 *
 * La rejilla se adapta a cuántas tiene. Antes eran siempre tres huecos, así que
 * una creadora con una sola pieza mostraba su trabajo al lado de dos cajas
 * grises vacías — que no se leen como "tiene una", se leen como si la pantalla
 * se hubiera roto. Es justo el perfil que menos puede permitirse eso.
 */
function obraHTML(ms = []) {
  if (!ms.length) return '<p class="p">Todavía no ha subido piezas.</p>';
  const lado = ms.slice(1, 3);
  if (!lado.length) return `<div class="obra obra--sola">${pieza(ms[0])}</div>`;
  return `
  <div class="obra">
    <div class="obra__princ">${pieza(ms[0])}</div>
    <div class="obra__lado">${lado.map(m => `<div>${pieza(m)}</div>`).join('')}</div>
  </div>`;
}

/**
 * Alcance por red: a cuánta gente llega en cada una, no cuántos la siguen.
 *
 * El nivel va como pastilla pegada al nombre de la red y no suelto, porque
 * separados se leen como dos datos y son uno: es MICRO EN INSTAGRAM, no "micro"
 * a secas. Una creadora puede ser micro en Instagram y media en TikTok, y
 * contratarla para TikTok con el número de Instagram es contratar a ciegas.
 *
 * Sin vistas cargadas va un guion, y se dice por qué. Rellenar con los
 * seguidores cambiaría la pregunta —"a cuántos podría llegar" en vez de "a
 * cuántos llega"— y además el número exacto no viaja al catálogo: la vuelve
 * encontrable con una búsqueda.
 */
function alcanceHTML(redes) {
  const lista = (redes || []).filter(r => r.red);
  if (!lista.length) return '';
  const sinVistas = lista.every(r => !corto(r.vistas));

  return `
  <div class="grupo-num grupo-num--alcance">
    <div class="grupo-num__cab">Alcance por red · vistas promedio</div>
    <div class="grupo-num__cuerpo">
      ${lista.map(r => `
        <div class="red-fila">
          <div class="red-fila__num">${corto(r.vistas) ? esc(corto(r.vistas)) : '—'}</div>
          <div class="red-fila__pie">
            <span class="red-fila__red">${esc(NOMBRE_RED[r.red] || r.red)}</span>
            ${r.tier ? `<span class="tier-pastilla">${esc(NOMBRE_TIER[r.tier] || r.tier)}</span>` : ''}
          </div>
        </div>`).join('')}
    </div>
    ${sinVistas ? `<div class="grupo-num__nota">Todavía no ha cargado sus vistas promedio.
      El nivel de cada red sale de sus seguidores.</div>` : ''}
  </div>`;
}

/**
 * Su audiencia, en barra y no en cifra suelta.
 *
 * "79%" no dice por sí solo si es mucho; la barra sí, y de un vistazo. El
 * aria-label repite la frase completa porque el color solo no comunica.
 */
function audienciaHTML(f) {
  const filas = [
    f.audiencia_mujeres != null
      ? { pct: f.audiencia_mujeres, label: 'Mujeres',
          frase: `${f.audiencia_mujeres}% de su audiencia son mujeres` }
      : null,
    f.audiencia_pais != null
      ? { pct: f.audiencia_pais, label: 'En su país',
          frase: `${f.audiencia_pais}% de su audiencia está en su país` }
      : null,
  ].filter(Boolean);
  if (!filas.length) return '';

  return `
  <div class="grupo-num grupo-num--audiencia">
    <div class="grupo-num__cab">Su audiencia</div>
    <div class="grupo-num__cuerpo">
      ${filas.map(x => `
        <div style="flex:1;min-width:150px">
          <div class="num-medio">${Number(x.pct)}%</div>
          <div class="metrica__label">${esc(x.label)}</div>
          <div class="barra" role="img" aria-label="${esc(x.frase)}">
            <div class="barra__lleno" style="width:${Math.min(100, Math.max(0, Number(x.pct)))}%"></div>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

/**
 * Cómo trabaja: el engagement y lo que tarda en entregar.
 *
 * El engagement va invertido —lima sobre negro— porque es la única cifra del
 * grupo que la marca compara entre creadoras, y por eso tiene que ser la
 * primera que ve.
 */
function comoTrabajaHTML(f) {
  // Si no hay ninguno de los dos, el grupo entero no se pinta. Un recuadro con
  // dos guiones no dice "todavía no lo sabemos", dice "aquí no hay nada" — y
  // queda justo donde la marca está decidiendo si paga.
  //
  // Hoy esto oculta el grupo en TODAS las creadoras: ninguna tiene engagement
  // ni días de entrega cargados.
  if (f.engagement_pct == null && !f.dias_entrega) return '';

  // La celda se invierte solo si hay cifra. Un recuadro negro alrededor de un
  // guion es peso visual para decir "no sabemos": llama la atención hacia el
  // único sitio donde no hay nada que mirar.
  const hayEng = f.engagement_pct != null;
  return `
  <div class="grupo-num grupo-num--trabajo">
    <div class="grupo-num__cab">Cómo trabaja</div>
    <div class="grupo-num__cuerpo">
      <div class="${hayEng ? 'celda-eng' : ''}">
        <div class="num-medio">${hayEng ? Number(f.engagement_pct) + '%' : '—'}</div>
        <div class="metrica__label">Engagement</div>
      </div>
      <div>
        <div class="num-medio">${f.dias_entrega ? Number(f.dias_entrega) + ' días' : '—'}</div>
        <div class="metrica__label">Entrega promedio</div>
      </div>
    </div>
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

  // Los tres grupos juntos. Si ninguno tiene datos, el título "Sus números"
  // tampoco se pinta: un encabezado sin nada debajo se lee como algo roto.
  const numeros = alcanceHTML(FICHA.redes) + audienciaHTML(FICHA) + comoTrabajaHTML(FICHA);

  /**
   * El pie del panel: qué eligió, cuánto cobra ella, cuánto cobramos nosotros
   * y el total.
   *
   * Va aparte porque se repinta solo al cambiar de entregable, sin volver a
   * pedir la ficha. El desglose se muestra completo a propósito: la comisión
   * escondida dentro de un total es la clase de sorpresa que hace que una
   * marca no vuelva.
   */
  function pieHTML(el) {
    const pct = Number(E.cfg.comision_marca_pct ?? 12);
    return `
      <div class="panel-pie__elegiste">Elegiste</div>
      ${el
        ? `<span class="panel-pie__pastilla">${esc(nombreEntregable(el.entregable))}</span>
           <div class="panel-pie__linea">
             <span>Su tarifa</span><span>${COP(el.precio)}</span>
           </div>
           <div class="panel-pie__linea panel-pie__linea--comision">
             <span>Comisión plataforma ${pct}%</span>
             <span>${COP(totalConComision(el.precio) - Number(el.precio))}</span>
           </div>`
        : `<div class="etiqueta" style="color:var(--chip-dark-text)">Escoge un entregable</div>`}

      <div class="panel-pie__caja-total">
        <div class="etiqueta" style="color:var(--chip-dark-text)">Total que tú pagas</div>
        <div class="panel-pie__total" id="total-ficha" aria-live="polite">
          ${el ? COP(totalConComision(el.precio)) : '—'}
        </div>
      </div>

      <button class="btn btn--magenta" style="width:100%;margin-top:14px" id="abrir-propuesta"
              ${el ? '' : 'disabled'}>Enviar propuesta →</button>
      <div class="panel-pie__nota">No se cobra nada hasta que ella acepte.
        Gasta 1 propuesta de tu plan.</div>`;
  }

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
          se revelan solos en el momento en que el pago queda guardado.
          No tienes que pedirlo ni ella tiene que enviarlo.</p>
        </div>
      </div>

      ${paquetesHTML(FICHA.paquetes, E.cfg.entregables)}

      <div class="h-sec" style="margin:26px 0 4px">Su trabajo</div>
      <div class="etiqueta" style="margin-bottom:12px">
        ${ms.length === 1 ? '1 pieza publicada' : `${ms.length} piezas publicadas`}
      </div>
      ${obraHTML(ms)}

      ${numeros ? `
      <div class="h-sec" style="margin:30px 0 4px">Sus números</div>
      <div class="etiqueta" style="margin-bottom:12px">
        ${FICHA.fuente_metricas === 'verificado' ? 'Conectados a sus cuentas' : 'Declarados por ella'}
      </div>
      ${numeros}` : ''}
    </div>

    <aside class="ficha__lado">
      <div class="ficha__panel">
        <div class="bloque__cab" style="border-bottom:2px solid var(--ink);display:flex;
             justify-content:space-between;gap:10px">
          <span>Sus tarifas</span>
          <span style="color:var(--text-3)">${tarifas.length} de ${(E.cfg.entregables || []).length}</span>
        </div>
        <div id="tarifas-lista" role="radiogroup" aria-label="Entregables de ${esc(FICHA.nombre_publico)}">
          ${(E.cfg.entregables || []).map(ent => {
            const t = tarifas.find(x => x.entregable === ent.clave);
            if (!t) return `
              <div class="tarifa-op off" aria-disabled="true">
                <div>
                  <div class="tarifa-op__nom">${esc(ent.nombre)}</div>
                  <div class="tarifa-op__det">No lo ofrece</div>
                </div>
                <div class="tarifa-op__monto">—</div>
              </div>`;
            const on = TARIFA_SEL === ent.clave;
            return `
              <button class="tarifa-op ${on ? 'on' : ''}" data-tarifa="${ent.clave}"
                      role="radio" aria-checked="${on}" tabindex="${on ? '0' : '-1'}">
                <div>
                  <div class="tarifa-op__nom">${esc(ent.nombre)}</div>
                  <div class="tarifa-op__det">${esc(ent.subtitulo || '')}</div>
                </div>
                <div class="tarifa-op__monto">${COP(t.precio)}</div>
              </button>`;
          }).join('')}
        </div>

        <div class="panel-pie" id="panel-pie">${pieHTML(elegida)}</div>
      </div>

      <div class="tambien">
        <button class="tambien__btn" id="ficha-campana">Invitarla a una campaña</button>
        <button class="tambien__btn tambien__btn--suave ${esPre(FICHA.id) ? 'on' : ''}"
                id="ficha-preselec">
          ${esPre(FICHA.id) ? '✓ En preseleccionadas' : 'Guardar en preseleccionadas'}
        </button>
        <p class="tambien__nota">Guardar no gasta propuesta. Invitarla a una campaña sí.</p>
      </div>
    </aside>
  </div>`;

  $('volver-cat').addEventListener('click', () => ir('catalogo'));

  const opciones = [...c.querySelectorAll('[data-tarifa]')];

  /**
   * Repinta la selección sin volver a pedir la ficha.
   *
   * Antes cada clic en una tarifa rehacía `vistaFicha`, que vuelve a llamar al
   * servidor solo para cambiar un número que ya teníamos. Además el aria-live
   * no anunciaba nada: el nodo entero se reemplazaba en vez de cambiar, que es
   * justo lo que un lector de pantalla no reporta.
   */
  const pintarSeleccion = () => {
    const el = tarifas.find(t => t.entregable === TARIFA_SEL);
    opciones.forEach(b => {
      const on = b.dataset.tarifa === TARIFA_SEL;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
    });
    $('panel-pie').innerHTML = pieHTML(el);
    $('abrir-propuesta').addEventListener('click', () => abrirPropuesta(FICHA, el));
  };

  opciones.forEach((b, i) => {
    b.addEventListener('click', () => { TARIFA_SEL = b.dataset.tarifa; pintarSeleccion(); });
    // Un grupo de radio se recorre con las flechas, no con tabulador: el
    // tabulador entra y sale del grupo completo.
    b.addEventListener('keydown', (ev) => {
      const paso = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[ev.key];
      if (!paso) return;
      ev.preventDefault();
      const sig = opciones[(i + paso + opciones.length) % opciones.length];
      TARIFA_SEL = sig.dataset.tarifa;
      pintarSeleccion();
      sig.focus();
    });
  });

  $('abrir-propuesta').addEventListener('click', () => abrirPropuesta(FICHA, elegida));

  // Invitarla a una campaña: no se manda nada desde aquí —eso gasta propuesta y
  // se decide en el flujo de cupos—, pero antes de salir se la deja guardada.
  // Sin eso, salir de la ficha la pierde y hay que volver a buscarla.
  $('ficha-campana').addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    try {
      if (!esPre(FICHA.id)) {
        E.triage = await api('/triage', {
          method: 'POST',
          body: JSON.stringify({ creadora_id: FICHA.id, decision: 'preseleccionada' }),
        });
      }
    } catch (_) {
      // Que no se pueda guardar no puede impedirle llegar a sus campañas.
    }
    b.disabled = false;
    if (typeof abrirCampanaCon === 'function') return abrirCampanaCon([FICHA]);
    ir('campanas');
  });

  // Guardar no gasta nada y es reversible: se marca en el momento, sin
  // confirmación ni salir de la ficha.
  $('ficha-preselec').addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    try {
      E.triage = await api('/triage', {
        method: 'POST',
        body: JSON.stringify({ creadora_id: FICHA.id, decision: 'preseleccionada' }),
      });
      const dentro = esPre(FICHA.id);
      b.classList.toggle('on', dentro);
      b.textContent = dentro ? '✓ En preseleccionadas' : 'Guardar en preseleccionadas';
    } catch (e) {
      alert('No se pudo guardar: ' + e.message);
    } finally {
      b.disabled = false;
    }
  });
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

  // Desde el catálogo se abre sin entregable elegido, porque ahí no hay dónde
  // elegirlo. Se toma el más barato que ella publicó —el mismo "desde" que
  // muestra su tarjeta— para que el modal arranque con SU precio y no con el
  // mínimo del deslizador, que no sale de ningún lado y la deja anclada abajo.
  const suyas = (creadora.tarifas || []).filter(t => Number(t.precio) > 0);
  const barata = suyas.length
    ? suyas.reduce((a, b) => Number(b.precio) < Number(a.precio) ? b : a)
    : null;
  const elegida = tarifaElegida || barata;

  PROP = {
    creadora,
    entregable: elegida ? elegida.entregable : null,
    tarifaPublicada: elegida ? Number(elegida.precio) : null,
    monto: elegida ? Number(elegida.precio) : rp.min,
    // 'dinero' o 'canje'. Arranca siempre en dinero: el canje es la excepción
    // y tiene que elegirse a propósito, no caer por defecto.
    tipo: 'dinero',
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

  const esCanje = p.tipo === 'canje';
  const fijaCanje = Number(E.cfg.canje_comision_fija ?? 4900);

  const comision = esCanje ? fijaCanje : Math.round(p.monto * pctMarca / 100);
  const total = esCanje ? fijaCanje : Math.round(p.monto) + comision;
  const neto = esCanje ? 0 : Math.round(p.monto) - Math.round(p.monto * pctCreadora / 100);
  const bajoTarifa = !esCanje && p.tarifaPublicada && p.monto < p.tarifaPublicada;

  // Un canje con "NO APLICA" en producto no existe: el producto ES el pago.
  if (esCanje && p.producto === 'NO APLICA') p.producto = 'ENVIADO';

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

          <!-- Las dos opciones, dichas. Antes "Su tarifa" era un atajo más
               entre "+50 mil" y "−50 mil", así que quien no se fijaba no sabía
               que el monto de arriba era el precio de ELLA ni que podía
               cambiarlo. Son dos decisiones distintas y se ven como tales. -->
          <div class="eleccion-monto eleccion-monto--tres">
            ${p.tarifaPublicada ? `
              <button type="button" class="opcion-monto ${!esCanje && p.monto === p.tarifaPublicada ? 'on' : ''}"
                      data-monto="${p.tarifaPublicada}">
                Pagar su tarifa
                <span class="opcion-monto__cifra">${COP(p.tarifaPublicada)}</span>
              </button>` : ''}
            <button type="button" class="opcion-monto ${!esCanje && p.monto !== p.tarifaPublicada ? 'on' : ''}"
                    id="otro-monto">
              Proponer otro monto
              <span class="opcion-monto__cifra">Tú lo pones</span>
            </button>

            <!-- El canje es la mitad de los tratos de belleza y hasta ahora se
                 cerraban por fuera de la plataforma. Va acá y no en otro sitio
                 porque es la misma decisión: cuánto le ofreces. -->
            <button type="button" class="opcion-monto opcion-monto--canje ${esCanje ? 'on' : ''}"
                    id="opcion-canje">
              Canje · solo producto
              <span class="opcion-monto__cifra">${COP(fijaCanje)} de comisión</span>
            </button>
          </div>

          ${!p.tarifaPublicada && !esCanje ? `
            <p class="p" style="font-size:11px;color:var(--text-3);margin-bottom:10px">
              Todavía no publicó tarifa, así que el monto lo pones tú.</p>` : ''}

          <!-- El monto se escribe. El deslizador queda de apoyo para tantear,
               pero con 480 posiciones nunca fue una forma de poner una cifra
               exacta, y menos en un teléfono. -->
          <!-- Los controles siguen en el árbol cuando hay canje, solo
               ocultos: sus escuchas se conectan una sola vez y buscarlos sin
               encontrarlos rompería el modal entero. -->
          <div class="${esCanje ? 'oculto' : ''}" id="controles-monto">
          <div class="monto-caja">
            <span class="monto-caja__signo">$</span>
            <input type="text" id="monto-txt" inputmode="numeric" class="monto-caja__campo"
                   value="${Math.round(p.monto).toLocaleString('es-CO')}"
                   aria-label="Monto que le ofreces en pesos">
            <span class="monto-caja__moneda">COP</span>
          </div>

          <div class="monto-atajos">
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

          ${esCanje ? `
            <p class="p" style="font-size:11.5px;margin-bottom:4px">
              Ella no recibe plata: recibe el producto que le mandes. Descríbelo
              abajo con nombre y tamaño — es lo único que tiene para decidir si
              le sirve.</p>` : ''}
        </div>

        <div class="campo">
          <label>Qué quieres que haga</label>
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
          <span class="dinero-fila__label">${esCanje ? 'Le pagas en' : 'Monto acordado'}</span>
          <span class="dinero-fila__valor" id="d-monto">${esCanje ? 'Producto' : COP(p.monto)}</span>
        </div>
        <div class="dinero-fila">
          <span class="dinero-fila__label">Comisión plataforma${esCanje ? ' (fija)' : ' ' + pctMarca + '%'}</span>
          <span class="dinero-fila__valor" id="d-comision">+${COP(comision)}</span>
        </div>
        <div class="dinero-fila">
          <span class="dinero-fila__label">Ella recibe (neto)</span>
          <span class="dinero-fila__valor" id="d-neto" style="color:var(--text-3)">${
            esCanje ? COP(0) + ' + el producto' : COP(neto)}</span>
        </div>

        <div class="dinero-total">
          <div class="etiqueta" style="color:var(--chip-dark-text)">Total que tú pagas</div>
          <div class="dinero-total__valor" id="d-total">${COP(total)}</div>
          <div class="dinero-total__nota">
            ${esCanje
              ? 'Se cobra solo si ella acepta. No hay nada que guardar porque no hay plata de por medio: ella no graba hasta que le llegue el producto.'
              : 'Se cobra solo si ella acepta. Tu dinero queda guardado y protegido hasta que apruebes el contenido.'}
          </div>
        </div>

        <p class="p" style="font-size:11px;margin-top:14px">
          ${esCanje
            ? 'Cuando acepte y pagues la comisión, se revelan su nombre y su dirección para que le mandes el producto.'
            : 'Cuando acepte y el pago quede retenido, se revelan su nombre, su cuenta y su contacto.'}
        </p>

        <button class="btn btn--lima" style="width:100%;margin-top:14px" id="enviar-prop">
          Enviar propuesta · <span id="d-boton">${COP(total)}</span>
        </button>
        ${esCanje ? `
          <div class="etiqueta" style="margin-top:8px;text-align:center">
            El producto lo mandas tú, aparte
          </div>` : ''}
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
    // En canje las cifras están fijas y no cuelgan del monto: dejarlas
    // recalcular escribiría "$0" encima de "Producto". El repintado completo
    // es el que las pone, al cambiar de opción.
    if (PROP.tipo === 'canje') return;
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

    // Cuál de las dos opciones está activa. Se recalcula en vez de recordarse:
    // si escribe justo su tarifa, la elección correcta es "pagar su tarifa",
    // aunque haya llegado ahí escribiendo.
    const suTarifa = document.querySelector('.opcion-monto[data-monto]');
    if (suTarifa) {
      const igual = m === PROP.tarifaPublicada;
      suTarifa.classList.toggle('on', igual);
      $('otro-monto')?.classList.toggle('on', !igual);
    }
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

  // "Pagar su tarifa" pone su cifra. "Proponer otro monto" no cambia nada por
  // su cuenta: lleva el cursor al campo, que es donde se decide.
  document.querySelector('.opcion-monto[data-monto]')
    ?.addEventListener('click', (e) => {
      PROP.tipo = 'dinero';
      fijarMonto(Number(e.currentTarget.dataset.monto));
      pintarPropuesta();
    });
  $('otro-monto')?.addEventListener('click', () => {
    // Volver de canje a dinero cambia media pantalla, así que se repinta; si
    // ya estaba en dinero basta con llevar el cursor al campo, que es donde
    // se decide.
    if (PROP.tipo === 'canje') { PROP.tipo = 'dinero'; pintarPropuesta(); $('monto-txt').focus(); return; }
    campo.focus(); campo.select();
  });
  $('opcion-canje')?.addEventListener('click', () => {
    PROP.tipo = 'canje';
    pintarPropuesta();
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
        tipo_pago: PROP.tipo,
        // Un canje va sin monto. Mandar el que quedó en pantalla antes de
        // elegir canje crearía un trato que dice pagar una plata que nadie
        // acordó.
        monto: PROP.tipo === 'canje' ? 0 : PROP.monto,
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
