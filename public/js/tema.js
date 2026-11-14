/* FutSal Camisetas - modo claro / oscuro (se carga en el <head> para evitar parpadeos) */
(function () {
  'use strict';
  var CLAVE = 'futsal_tema';
  var raiz = document.documentElement;

  function leer() {
    try { return localStorage.getItem(CLAVE) === 'oscuro' ? 'oscuro' : 'claro'; } catch (e) { return 'claro'; }
  }

  function aplicar(tema) {
    raiz.setAttribute('data-tema', tema);
    var boton = document.getElementById('tema-boton');
    if (boton) {
      var texto = tema === 'oscuro' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
      boton.setAttribute('aria-label', texto);
      boton.title = texto;
    }
  }

  aplicar(leer());

  document.addEventListener('DOMContentLoaded', function () {
    aplicar(leer());
    var boton = document.getElementById('tema-boton');
    if (!boton) return;
    boton.addEventListener('click', function () {
      var nuevo = raiz.getAttribute('data-tema') === 'oscuro' ? 'claro' : 'oscuro';
      try { localStorage.setItem(CLAVE, nuevo); } catch (e) { /* sin almacenamiento: dura hasta recargar */ }
      aplicar(nuevo);
    });
  });

  // Si se cambia en otra pestaña, se actualiza tambien aca
  window.addEventListener('storage', function (e) { if (e.key === CLAVE) aplicar(leer()); });
})();
