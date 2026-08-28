// Píxel de Meta.
//
// Vive en un archivo aparte y no pegado en cada página por una razón práctica:
// el fragmento que da Meta son quince líneas, y copiarlo en cinco archivos
// significa que el día que cambie el identificador —o que haya que apagarlo—
// hay que acordarse de los cinco. Acá es un sitio.
//
// ⚠️ Dónde SÍ y dónde NO:
//
//   Sí  · La landing, /marcas, /precios, el registro y la invitación. Son las
//         páginas a las que llega alguien desde un anuncio o un enlace.
//   NO  · panel.html, creadora.html y admin.html. Son sesiones privadas: el
//         panel de una marca que ya pagó, el portal de una creadora con su
//         trabajo y sus tarifas, y las herramientas internas del equipo.
//         Mandarle a Meta cada pantalla que abre una creadora dentro de su
//         portal no sirve para pautar y sí es información de ella.
//
// El identificador del píxel es público por diseño —viaja en cada petición del
// navegador—, así que no es un secreto y no tiene que estar en el entorno.

const PIXEL_META = '1013770594842371';

/* eslint-disable */
!function (f, b, e, v, n, t, s) {
  if (f.fbq) return; n = f.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
  n.queue = []; t = b.createElement(e); t.async = !0;
  t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
}(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

fbq('init', PIXEL_META);
fbq('track', 'PageView');
/* eslint-enable */

/**
 * Avisa que alguien terminó de registrarse.
 *
 * Es el evento con el que Meta optimiza la entrega de los anuncios: sin él,
 * la campaña aprende a conseguir visitas en vez de registros, que es otra cosa
 * y mucho más barata de conseguir mal.
 *
 * Se expone como función para que la llame quien sabe que el registro salió
 * bien, y no la página entera al cargar.
 */
window.pixelRegistro = function () {
  if (typeof fbq === 'function') fbq('track', 'CompleteRegistration');
};
