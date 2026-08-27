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
const { puntajeDePerfil } = require('./perfil');
const { marcaAuth } = require('./auth');
const { conAhorro } = require('./paquetes');

const router = express.Router();

router.use(marcaAuth);

/**
 * ¿Puede esta marca abrir esta ficha?
 *
 * Devuelve el estado del plan y registra la vista si procede. Una ficha ya
 * abierta este mes no vuelve a contar: la llave de mk_fichas_vistas es
 * (marca, creadora, mes).
 */
/**
 * Registra que esta marca abrió esta ficha.
 *
 * Desde mk_022 el catálogo NO se limita: se abre completo en todos los planes.
 * Limitar la búsqueda no protegía nada —lo que se ve se anota— e impedía que
 * la marca encontrara a la creadora por la que valdría la pena pagar. El tope
 * vive ahora donde está el valor: al enviar la propuesta.
 *
 * El registro se mantiene porque es lo que alimenta el "quién miró tu perfil"
 * del portal de la creadora.
 */
async function anotarVista(marca_id, creadora_id) {
  try {
    await db.registrarFichaVista(marca_id, creadora_id);
  } catch (e) {
    // Que falle el conteo no puede impedir ver una ficha.
    console.error('[catalogo] no se pudo anotar la vista:', e.message);
  }
}

/**
 * Configuración que necesita el panel de la marca.
 *
 * Se llama /filtros por lo que era al principio, pero hoy alimenta el `E.cfg`
 * entero del panel: los filtros del catálogo, el formulario de campaña y el
 * modal de propuesta. Todo lo que el panel lea de `E.cfg` tiene que salir de
 * aquí — si no, el control que dependa de esa clave se dibuja vacío.
 *
 * Así se rompió el selector de objetivo de campaña: la clave existía en
 * mk_config con sus cuatro opciones, pero nunca viajaba al navegador.
 *
 * Las comisiones se mandan porque el modal de propuesta muestra el dinero en
 * vivo. Sin ellas el frontend cae a 12/8 fijos, y el día que se cambie la
 * comisión desde el panel admin la marca vería un total y pagaría otro.
 *
 * Nada de lo que sale por aquí es sensible: son las mismas cifras que la marca
 * ve en pantalla al armar una propuesta.
 */
router.get('/filtros', async (req, res) => {
  try {
    const cfg = await db.getConfig();
    res.json({
      // — Filtros del catálogo —
      // Taxonomía de dos niveles: la marca filtra por categoría (amplio) o
      // afina por subnicho.
      categorias: cfg.nichos || [],
      paises: cfg.paises || [],
      departamentos_co: cfg.departamentos_co || [],
      entregables: cfg.entregables || [],
      // Para filtrar por red. Abrir una red nueva es agregar una fila en
      // mk_config: los chips del filtro salen de aquí.
      redes: cfg.redes || [],
      rangos_alcance: (cfg.rangos_alcance || []).map(r => r.clave),
      niveles_tarifa: Object.entries(cfg.niveles_tarifa || {}).map(([clave, n]) => ({
        clave,
        etiqueta: n.etiqueta || clave,
        min: n.min,
        max: n.max,
      })),

      // — Formulario de campaña —
      objetivos_campana: cfg.objetivos_campana || [],
      rango_tope_campana: cfg.rango_tope_campana || null,

      // — Modal de propuesta —
      rango_presupuesto: cfg.rango_presupuesto || null,
      comision_marca_pct: cfg.comision_marca_pct,
      comision_creadora_pct: cfg.comision_creadora_pct,
      horas_responder: cfg.horas_responder,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * El catálogo con todo lo que cuelga de cada perfil.
 *
 * Vive fuera de la ruta porque lo necesitan dos consumidores muy distintos: la
 * marca que navega, y el motor de selección del panel admin. Una fila pelada de
 * `getCatalogo` no trae redes ni tarifas ni cumplimiento, así que el motor
 * aprendería de la nada — y en silencio, que es lo peor: propondría perfiles
 * sin decir que no tenía con qué decidir.
 */
async function catalogoEnriquecido(filtros = {}) {
  const creadoras = await db.getCatalogo(filtros);
  const ids = creadoras.map(c => c.id);

  // Las muestras se adjuntan como ids: el binario se pide después a /media/:id.
  const [muestras, tarifas, cumplimiento, redes] = await Promise.all([
    db.getMuestrasDeVarias(ids),
    db.getTarifasDeVarias(ids),
    db.getCumplimientoDeVarias(ids),
    db.getRedesDeVarias(ids),
  ]);

  return creadoras.map(c => ({
      ...c,
      muestras: (muestras[c.id] || []).map(m => ({
        id: m.id, tipo: m.tipo, poster: Boolean(m.poster_path),
      })),
      tarifas: (tarifas[c.id] || []).map(t => ({ entregable: t.entregable, precio: t.precio })),
      // Quien no tiene historial lo dice; no se rellena con ceros, que se leen
      // como "cumplió cero veces" cuando en realidad nunca la han contratado.
      cumplimiento: cumplimiento[c.id] || { confianza: 'sin_historial' },
      // Sus redes con el nivel de cada una. Sin seguidores exactos y sin
      // handle: el número exacto la vuelve identificable con una búsqueda, que
      // es justo lo que el catálogo ciego existe para evitar.
      redes: (redes[c.id] || []).map(r => ({
        red: r.red, tier: r.tier, principal: r.es_principal,
        vistas: r.vistas_promedio,
      })),
  }));
}

/**
 * Qué tan completo está un perfil.
 *
 * Un perfil sin una sola pieza de trabajo intercalado entre los buenos hace que
 * el catálogo entero se lea como descuidado. En vez de esconderlos —lo que
 * costaría tamaño de catálogo justo cuando hace falta— se ordenan por esto, así
 * lo primero que ve la marca es lo mejor que hay.
 *
 * ⚠️ Los pesos NO viven acá: salen de `perfil.js`, que es el mismo módulo que
 * dibuja el círculo de completitud en el portal de la creadora. Es lo que hace
 * verdadera la frase "los perfiles completos reciben más solicitudes" — si el
 * círculo y este orden se calcularan aparte, subir el círculo dejaría de subir
 * la posición y sería una promesa falsa.
 *
 * Al historial de cumplimiento se le suma aparte porque no es algo que ella
 * pueda "llenar": se gana entregando, y no tiene sentido pedírselo en un
 * círculo de completitud.
 */
const queTanCompleto = (c) =>
  puntajeDePerfil({
    piezas: (c.muestras || []).length,
    redes: (c.redes || []).length,
    tarifas: (c.tarifas || []).length,
    tarifa_abierta: c.tarifa_abierta,
    foto_perfil_path: c.foto_perfil_path,
    bio_corta: c.bio_corta,
    metricas_estado: c.metricas_estado,
  }) + (c.cumplimiento?.entregas ? 25 : 0);

/** Listado con filtros. */
router.get('/', async (req, res) => {
  try {
    const { categoria, nicho, rango_alcance, nivel_tarifa, pais, departamento,
            ciudad, presupuesto_max, entregable, tier, red } = req.query;

    let resultado = await catalogoEnriquecido({
      categoria, nicho, rango_alcance, nivel_tarifa, pais, departamento, ciudad, presupuesto_max,
    });

    // Se ordena aquí y no en la consulta porque depende de las piezas y las
    // tarifas, que viven en otras tablas.
    resultado.sort((a, b) => {
      const d = queTanCompleto(b) - queTanCompleto(a);
      // Con el mismo nivel de perfil manda el orden que ya traía la consulta
      // (colaboraciones, prioridad, fecha), que es el que decidió el negocio.
      return d !== 0 ? d : 0;
    });

    // "Quiero un reel": se filtra en memoria porque depende de la tabla de
    // tarifas, no de una columna de mk_creadoras.
    if (entregable) {
      resultado = resultado.filter(c => c.tarifas.some(t => t.entregable === entregable));
    }

    // Nivel y red.
    //
    // Con red elegida, las dos condiciones se exigen sobre la MISMA red: "micro
    // en TikTok" no puede devolver a quien es micro en Instagram y además tiene
    // un TikTok cualquiera.
    //
    // Sin red elegida, el nivel se mide sobre su RED PRINCIPAL y no sobre
    // cualquiera que tenga. Si no, pedir "UGC" devolvía a casi todo el catálogo:
    // una macro de Instagram con 500 seguidores en Kwai tiene una red UGC, pero
    // no es una creadora UGC, y ofrecérsela a quien busca UGC es hacerle perder
    // el tiempo a las dos.
    if (red) {
      resultado = resultado.filter(c => (c.redes || []).some(r =>
        r.red === red && (!tier || r.tier === tier)
      ));
    } else if (tier) {
      resultado = resultado.filter(c => {
        const principal = (c.redes || []).find(r => r.principal);
        return principal ? principal.tier === tier : false;
      });
    }

    res.json({ total: resultado.length, creadoras: resultado });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * Detalle de una creadora.
 *
 * Abrir una ficha es lo que consume el plan: el catálogo se ve completo en
 * todos, lo que se limita es entrar a ver las piezas y las tarifas. Así el
 * demo no parece pobre —la marca ve que el banco es grande— y el muro aparece
 * justo cuando ya entendió el valor.
 */
router.get('/:id', async (req, res) => {
  try {
    const creadora = await db.getCreadoraCatalogo(req.params.id);
    if (!creadora) return res.status(404).json({ error: 'Creadora no encontrada' });

    await anotarVista(req.usuarioId, req.params.id);

    const [muestras, tarifas, cumplimiento, contenido, paquetes] = await Promise.all([
      db.getMuestrasDeCreadora(creadora.id),
      db.getTarifasDeCreadora(creadora.id),
      db.getCumplimientoDeUna(creadora.id),
      db.getPerfilContenidoDeUna(creadora.id),
      db.getPaquetesDeCreadora(creadora.id, { soloActivos: true }),
    ]);

    res.json({
      ...creadora,
      cumplimiento: cumplimiento || { confianza: 'sin_historial' },
      // Cómo trabaja: sale del análisis de sus piezas. Va null mientras no se
      // hayan analizado, y la ficha lo omite en vez de inventar un perfil.
      contenido: contenido || null,
      muestras: muestras.map(m => ({ id: m.id, tipo: m.tipo, poster: Boolean(m.poster_path) })),
      // Sus paquetes, con lo que costaría suelto para que la marca vea la
      // diferencia. El ahorro se calcula contra las tarifas de ella misma, así
      // que es real y no un descuento que la plataforma inventó.
      paquetes: paquetes.map(p => conAhorro(p, tarifas)),
      // Solo las que ella tiene publicadas.
      tarifas: tarifas
        .filter(t => t.activo !== false)
        .map(t => ({ entregable: t.entregable, precio: t.precio })),
      // Sin `plan`, `fichas_vistas` ni `fichas_tope`: quedaron de cuando el
      // plan limitaba cuántas fichas se podían abrir. Desde mk_022 el tope está
      // en las propuestas y el catálogo se ve completo, pero las tres líneas se
      // quedaron leyendo una variable que ya no existía — y reventaban CADA
      // apertura de ficha con "limite is not defined".
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
module.exports.catalogoEnriquecido = catalogoEnriquecido;
module.exports.queTanCompleto = queTanCompleto;
