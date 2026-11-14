/* FutSal Camisetas - tienda */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var precioFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  var CLAVE_CARRITO = 'futsal_carrito';
  var SIN_IMAGEN = '/img/sin-imagen.svg';

  var estado = {
    productos: [],
    categorias: [],
    config: {},
    categoria: 'Todos',
    busqueda: '',
    orden: 'destacados',
    carrito: leerCarrito(),
    actual: null,      // producto abierto en el dialogo
    foto: 0,           // foto mostrada en el dialogo
    talle: null,
    cantidad: 1
  };

  /* ---------- Utilidades ---------- */

  function crear(tag, attrs, hijos) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'texto') el.textContent = attrs[k];
      else if (k === 'clase') el.className = attrs[k];
      else el.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h) el.appendChild(h); });
    return el;
  }

  function leerCarrito() {
    try {
      var c = JSON.parse(localStorage.getItem(CLAVE_CARRITO) || '[]');
      return Array.isArray(c) ? c : [];
    } catch (e) { return []; }
  }

  function guardarCarrito() {
    try { localStorage.setItem(CLAVE_CARRITO, JSON.stringify(estado.carrito)); } catch (e) { /* sin almacenamiento */ }
  }

  var temporizadorTostada;
  function tostada(texto) {
    var t = $('tostada');
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(temporizadorTostada);
    temporizadorTostada = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function stockTotal(p) {
    if (!p.talles.length) return Infinity; // producto sin talles: siempre disponible
    return p.talles.reduce(function (s, t) { return s + t.stock; }, 0);
  }

  function stockDe(p, talle) {
    if (!p.talles.length) return 99;
    var t = p.talles.find(function (x) { return x.talle === talle; });
    return t ? t.stock : 0;
  }

  function enCarrito(id, talle) {
    var it = estado.carrito.find(function (x) { return x.id === id && x.talle === talle; });
    return it ? it.cantidad : 0;
  }

  function linkWhatsapp(texto) {
    var num = estado.config.whatsapp || '';
    return 'https://wa.me/' + num + (texto ? '?text=' + encodeURIComponent(texto) : '');
  }

  function imagenSegura(img) {
    img.addEventListener('error', function () {
      if (img.getAttribute('src') !== SIN_IMAGEN) img.src = SIN_IMAGEN;
    });
  }

  /* ---------- Catalogo ---------- */

  function productosFiltrados() {
    var q = estado.busqueda.trim().toLowerCase();
    var lista = estado.productos.filter(function (p) {
      if (estado.categoria !== 'Todos' && p.categoria !== estado.categoria) return false;
      if (q && (p.nombre + ' ' + p.categoria).toLowerCase().indexOf(q) === -1) return false;
      return true;
    });
    var orden = estado.orden;
    lista.sort(function (a, b) {
      if (orden === 'menor') return a.precio - b.precio;
      if (orden === 'mayor') return b.precio - a.precio;
      if (orden === 'destacados' && a.destacado !== b.destacado) return a.destacado ? -1 : 1;
      return b.creado - a.creado;
    });
    return lista;
  }

  function pintarCategorias() {
    var cont = $('categorias');
    cont.textContent = '';
    var cats = ['Todos'];
    var conProductos = function (nombre) { return estado.productos.some(function (p) { return p.categoria === nombre; }); };
    estado.categorias.forEach(function (c) { if (conProductos(c.nombre) && cats.indexOf(c.nombre) === -1) cats.push(c.nombre); });
    estado.productos.forEach(function (p) { if (cats.indexOf(p.categoria) === -1) cats.push(p.categoria); });
    if (cats.indexOf(estado.categoria) === -1) estado.categoria = 'Todos';
    if (cats.length <= 2) return; // una sola categoria: no hace falta filtrar
    cats.forEach(function (c) {
      var b = crear('button', { type: 'button', clase: 'chip', texto: c, 'aria-pressed': String(c === estado.categoria) });
      b.addEventListener('click', function () {
        estado.categoria = c;
        pintarCategorias();
        pintarGrilla();
      });
      cont.appendChild(b);
    });
  }

  function pintarGrilla() {
    var grilla = $('grilla');
    grilla.textContent = '';
    var lista = productosFiltrados();
    var vacio = $('sin-resultados');
    vacio.hidden = lista.length > 0;
    vacio.textContent = estado.productos.length
      ? 'No encontramos productos con esa búsqueda.'
      : 'Todavía no hay productos cargados. ¡Volvé pronto!';

    lista.forEach(function (p) {
      var agotado = stockTotal(p) === 0;
      var fotos = fotosDe(p);
      var img = crear('img', { src: fotos[0], alt: '', loading: 'lazy' });
      imagenSegura(img);
      var marco = crear('div', { clase: 'tarjeta-img' }, [img]);
      if (fotos.length > 1) {
        // segunda foto al pasar el mouse
        var alt = crear('img', { src: fotos[1], alt: '', loading: 'lazy', clase: 'img-alt' });
        alt.addEventListener('error', function () { alt.remove(); });
        marco.appendChild(alt);
      }
      if (agotado) marco.appendChild(crear('span', { clase: 'etiqueta-img agotado', texto: 'Sin stock' }));
      else if (p.destacado) marco.appendChild(crear('span', { clase: 'etiqueta-img', texto: 'Destacado' }));

      var disponibles = p.talles.filter(function (t) { return t.stock > 0; }).map(function (t) { return t.talle; });
      var tarjeta = crear('button', { type: 'button', clase: 'tarjeta', 'aria-label': p.nombre + ', ' + precioFmt.format(p.precio) }, [
        marco,
        crear('span', { clase: 'tarjeta-cat', texto: p.categoria }),
        crear('span', { clase: 'tarjeta-nombre', texto: p.nombre }),
        crear('span', { clase: 'tarjeta-precio', texto: precioFmt.format(p.precio) }),
        disponibles.length ? crear('span', { clase: 'tarjeta-talles', texto: 'Talles: ' + disponibles.join(' · ') }) : null
      ]);
      tarjeta.addEventListener('click', function () { abrirProducto(p); });
      grilla.appendChild(tarjeta);
    });
  }

  /* ---------- Detalle de producto ---------- */

  function abrirProducto(p) {
    estado.actual = p;
    estado.cantidad = 1;
    var conStock = p.talles.filter(function (t) { return t.stock > 0; });
    estado.talle = p.talles.length === 0 ? '' : (conStock.length === 1 ? conStock[0].talle : null);

    estado.foto = 0;
    pintarFotos();
    $('p-categoria').textContent = p.categoria;
    $('p-nombre').textContent = p.nombre;
    $('p-precio').textContent = precioFmt.format(p.precio);
    $('p-descripcion').textContent = p.descripcion || '';
    $('p-descripcion').hidden = !p.descripcion;
    $('p-talles-titulo').hidden = p.talles.length === 0;
    pintarDetalle();
    $('dlg-producto').showModal();
  }

  function fotosDe(p) {
    var fotos = (p.imagenes && p.imagenes.length) ? p.imagenes : (p.imagen ? [p.imagen] : []);
    return fotos.length ? fotos : [SIN_IMAGEN];
  }

  function pintarFotos() {
    var p = estado.actual;
    var fotos = fotosDe(p);
    var i = estado.foto;
    var img = $('p-imagen');
    img.src = fotos[i];
    img.alt = p.nombre + (fotos.length > 1 ? ' (foto ' + (i + 1) + ' de ' + fotos.length + ')' : '');
    $('p-anterior').hidden = fotos.length < 2;
    $('p-siguiente').hidden = fotos.length < 2;

    var cont = $('p-miniaturas');
    cont.textContent = '';
    cont.hidden = fotos.length < 2;
    if (fotos.length < 2) return;
    fotos.forEach(function (url, k) {
      var mini = crear('img', { src: url, alt: '' });
      imagenSegura(mini);
      var b = crear('button', { type: 'button', clase: 'miniatura', 'aria-label': 'Ver foto ' + (k + 1), 'aria-current': String(k === i) }, [mini]);
      b.addEventListener('click', function () { estado.foto = k; pintarFotos(); });
      cont.appendChild(b);
    });
  }

  function cambiarFoto(delta) {
    var total = fotosDe(estado.actual).length;
    estado.foto = (estado.foto + delta + total) % total;
    pintarFotos();
  }

  function pintarDetalle() {
    var p = estado.actual;
    var cont = $('p-talles');
    cont.textContent = '';
    p.talles.forEach(function (t) {
      var b = crear('button', { type: 'button', clase: 'talle', texto: t.talle, 'aria-pressed': String(estado.talle === t.talle) });
      if (t.stock === 0) { b.disabled = true; b.setAttribute('aria-label', t.talle + ', sin stock'); }
      b.addEventListener('click', function () {
        estado.talle = t.talle;
        estado.cantidad = 1;
        pintarDetalle();
      });
      cont.appendChild(b);
    });

    var agotado = stockTotal(p) === 0;
    var elegido = estado.talle !== null;
    var disponible = elegido ? Math.max(0, stockDe(p, estado.talle) - enCarrito(p.id, estado.talle)) : 0;
    if (elegido && estado.cantidad > disponible) estado.cantidad = Math.max(1, disponible);

    $('p-cantidad').textContent = estado.cantidad;
    $('p-menos').disabled = estado.cantidad <= 1;
    $('p-mas').disabled = !elegido || estado.cantidad >= disponible;

    var boton = $('p-agregar');
    var nota = $('p-nota');
    if (agotado) {
      boton.disabled = true; boton.textContent = 'Sin stock';
      nota.textContent = 'Este producto está agotado por ahora. Consultanos por WhatsApp para saber cuándo vuelve.';
    } else if (!elegido) {
      boton.disabled = true; boton.textContent = 'Elegí un talle';
      nota.textContent = '';
    } else if (disponible === 0) {
      boton.disabled = true; boton.textContent = 'Ya está en tu carrito';
      nota.textContent = 'Ya agregaste todas las unidades disponibles de este talle.';
    } else {
      boton.disabled = false; boton.textContent = 'Agregar al carrito';
      nota.textContent = p.talles.length && disponible <= 3
        ? (disponible === 1 ? '¡Última unidad en este talle!' : 'Quedan ' + disponible + ' unidades en este talle.')
        : '';
    }
  }

  function agregarAlCarrito() {
    var p = estado.actual;
    if (!p || estado.talle === null) return;
    var it = estado.carrito.find(function (x) { return x.id === p.id && x.talle === estado.talle; });
    if (it) it.cantidad += estado.cantidad;
    else estado.carrito.push({ id: p.id, talle: estado.talle, cantidad: estado.cantidad });
    guardarCarrito();
    pintarCarrito();
    $('dlg-producto').close();
    tostada('Agregado al carrito');
  }

  /* ---------- Carrito ---------- */

  // Ajusta el carrito a los productos y stock actuales
  function normalizarCarrito() {
    var cambio = false;
    estado.carrito = estado.carrito.filter(function (it) {
      var p = estado.productos.find(function (x) { return x.id === it.id; });
      var max = p ? stockDe(p, it.talle) : 0;
      var cant = Math.floor(Number(it.cantidad));
      if (!p || max === 0 || !(cant >= 1)) { cambio = true; return false; }
      if (cant > max) { cant = max; cambio = true; }
      it.cantidad = cant;
      return true;
    });
    if (cambio) guardarCarrito();
  }

  function lineasCarrito() {
    return estado.carrito.map(function (it) {
      var p = estado.productos.find(function (x) { return x.id === it.id; });
      return { item: it, producto: p, subtotal: p.precio * it.cantidad };
    });
  }

  function pintarCarrito() {
    normalizarCarrito();
    var lineas = lineasCarrito();
    var unidades = lineas.reduce(function (s, l) { return s + l.item.cantidad; }, 0);
    var total = lineas.reduce(function (s, l) { return s + l.subtotal; }, 0);

    var contador = $('contador-carrito');
    contador.textContent = unidades;
    contador.hidden = unidades === 0;
    $('abrir-carrito').setAttribute('aria-label', 'Abrir carrito (' + unidades + (unidades === 1 ? ' producto)' : ' productos)'));

    $('carrito-vacio').hidden = lineas.length > 0;
    $('form-pedido').hidden = lineas.length === 0;
    $('carrito-pie').hidden = lineas.length === 0;
    $('carrito-total').textContent = precioFmt.format(total);
    $('pedido-error').hidden = true;

    var cont = $('carrito-items');
    cont.textContent = '';
    lineas.forEach(function (l) {
      var p = l.producto, it = l.item;
      var img = crear('img', { src: p.imagen || SIN_IMAGEN, alt: '' });
      imagenSegura(img);
      var menos = crear('button', { type: 'button', texto: '−', 'aria-label': 'Quitar uno de ' + p.nombre });
      var mas = crear('button', { type: 'button', texto: '+', 'aria-label': 'Agregar uno de ' + p.nombre });
      mas.disabled = it.cantidad >= stockDe(p, it.talle);
      menos.addEventListener('click', function () { cambiarCantidad(it, -1); });
      mas.addEventListener('click', function () { cambiarCantidad(it, 1); });
      var quitar = crear('button', { type: 'button', clase: 'enlace', texto: 'Quitar', 'aria-label': 'Quitar ' + p.nombre + ' del carrito' });
      quitar.addEventListener('click', function () { cambiarCantidad(it, -it.cantidad); });

      cont.appendChild(crear('div', { clase: 'item' }, [
        img,
        crear('div', null, [
          crear('div', { clase: 'item-nombre', texto: p.nombre }),
          crear('div', { clase: 'item-det', texto: (it.talle ? 'Talle ' + it.talle + ' · ' : '') + precioFmt.format(p.precio) + ' c/u' }),
          crear('div', { clase: 'cantidad' }, [menos, crear('span', { texto: String(it.cantidad) }), mas])
        ]),
        crear('div', null, [
          crear('div', { clase: 'item-precio', texto: precioFmt.format(l.subtotal) }),
          quitar
        ])
      ]));
    });
  }

  function cambiarCantidad(it, delta) {
    it.cantidad += delta;
    if (it.cantidad <= 0) estado.carrito = estado.carrito.filter(function (x) { return x !== it; });
    guardarCarrito();
    pintarCarrito();
  }

  // Si el cliente inicio sesion, completa sus datos en el pedido
  function cargarCliente() {
    pedir('/api/cuenta').then(function (r) {
      var c = r.cliente;
      if (!c) return;
      var link = $('link-cuenta');
      link.setAttribute('aria-label', 'Mi cuenta (' + c.nombre + ')');
      link.title = 'Mi cuenta: ' + c.nombre;
      if (!$('ped-nombre').value) $('ped-nombre').value = c.nombre + ' ' + c.apellido;
      if (!$('ped-direccion').value) {
        $('ped-direccion').value = [c.direccion, c.localidad, c.provincia].filter(Boolean).join(', ') + (c.cp ? ' (CP ' + c.cp + ')' : '');
      }
    }).catch(function () {});
  }

  function abrirCarrito() {
    pintarCarrito();
    $('velo').hidden = false;
    var c = $('carrito');
    c.classList.add('abierto');
    c.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    $('cerrar-carrito').focus();
  }

  function cerrarCarrito() {
    var c = $('carrito');
    if (!c.classList.contains('abierto')) return;
    $('velo').hidden = true;
    c.classList.remove('abierto');
    c.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    $('abrir-carrito').focus();
  }

  function enviarPedido() {
    var error = $('pedido-error');
    var nombre = $('ped-nombre').value.trim();
    var entrega = document.querySelector('input[name="entrega"]:checked').value;
    var direccion = $('ped-direccion').value.trim();
    var nota = $('ped-nota').value.trim();
    var falta = '';
    if (!nombre) falta = 'Escribí tu nombre para enviar el pedido.';
    else if (entrega === 'envio' && !direccion) falta = 'Escribí la dirección para el envío.';
    if (falta) {
      error.textContent = falta;
      error.hidden = false;
      (nombre ? $('ped-direccion') : $('ped-nombre')).focus();
      return;
    }
    error.hidden = true;

    var lineas = lineasCarrito();
    if (!lineas.length) return;
    var total = lineas.reduce(function (s, l) { return s + l.subtotal; }, 0);
    var texto = ['¡Hola FutSal Camisetas! Quiero hacer este pedido:', ''];
    lineas.forEach(function (l) {
      texto.push('• ' + l.item.cantidad + ' x ' + l.producto.nombre +
        (l.item.talle ? ' (talle ' + l.item.talle + ')' : '') + ' — ' + precioFmt.format(l.subtotal));
    });
    texto.push('', 'Total: ' + precioFmt.format(total), '', 'Nombre: ' + nombre);
    texto.push('Entrega: ' + (entrega === 'envio' ? 'Envío a ' + direccion : 'Retiro en Salta Capital'));
    if (nota) texto.push('Aclaraciones: ' + nota);

    window.open(linkWhatsapp(texto.join('\n')), '_blank', 'noopener');
    tostada('Abrimos WhatsApp con tu pedido');
  }

  /* ---------- Contacto ---------- */

  function enviarContacto(ev) {
    ev.preventDefault();
    var aviso = $('contacto-aviso');
    var boton = $('c-enviar');
    var datos = {
      nombre: $('c-nombre').value.trim(),
      contacto: $('c-contacto').value.trim(),
      mensaje: $('c-mensaje').value.trim(),
      sitio: $('c-sitio').value
    };
    function mostrar(texto, ok) {
      aviso.textContent = texto;
      aviso.className = 'aviso ' + (ok ? 'aviso-ok' : 'aviso-error');
      aviso.hidden = false;
    }
    if (!datos.nombre || !datos.contacto || !datos.mensaje) {
      mostrar('Completá tu nombre, un teléfono o email y el mensaje.', false);
      return;
    }
    boton.disabled = true;
    boton.textContent = 'Enviando...';
    fetch('/api/mensajes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || 'No se pudo enviar el mensaje.');
      });
    }).then(function () {
      $('form-contacto').reset();
      mostrar('¡Mensaje enviado! Te vamos a responder a la brevedad.', true);
    }).catch(function (e) {
      mostrar(e.message === 'Failed to fetch' ? 'No hay conexión. Probá de nuevo.' : e.message, false);
    }).then(function () {
      boton.disabled = false;
      boton.textContent = 'Enviar mensaje';
    });
  }

  /* ---------- Configuracion del negocio ---------- */

  /* ---------- Carrusel de la portada ---------- */

  var carrusel = { total: 1, actual: 0, reloj: null, pausado: false };

  function diapos() { return document.querySelectorAll('#portada .diapo'); }

  function mostrarDiapo(i) {
    var lista = diapos();
    carrusel.actual = (i + lista.length) % lista.length;
    Array.prototype.forEach.call(lista, function (d, k) {
      var activa = k === carrusel.actual;
      d.classList.toggle('activa', activa);
      d.setAttribute('aria-hidden', String(!activa));
      // los enlaces de una diapositiva oculta no deben recibir el foco
      Array.prototype.forEach.call(d.querySelectorAll('a, button'), function (el) { el.tabIndex = activa ? 0 : -1; });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.carrusel-punto'), function (p, k) {
      p.setAttribute('aria-current', String(k === carrusel.actual));
    });
  }

  function programarCarrusel() {
    clearInterval(carrusel.reloj);
    carrusel.reloj = null;
    var sinMovimiento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (carrusel.total < 2 || carrusel.pausado || document.hidden || sinMovimiento) return;
    carrusel.reloj = setInterval(function () { mostrarDiapo(carrusel.actual + 1); }, 5000);
  }

  function irADiapo(i) { mostrarDiapo(i); programarCarrusel(); } // reinicia los 5 segundos

  function armarCarrusel(imagenes) {
    var cont = $('diapos-extra');
    var puntos = $('carrusel-puntos');
    cont.textContent = '';
    puntos.textContent = '';
    (imagenes || []).forEach(function (url, i) {
      var img = crear('img', { src: url, alt: '', loading: i === 0 ? 'eager' : 'lazy' });
      var d = crear('div', { clase: 'diapo diapo-img', role: 'group', 'aria-label': 'Imagen ' + (i + 1) + ' de la portada' }, [img]);
      // si una imagen no carga, se quita del carrusel
      img.addEventListener('error', function () { d.remove(); prepararControles(); });
      cont.appendChild(d);
    });
    prepararControles();
  }

  function prepararControles() {
    var lista = diapos();
    var puntos = $('carrusel-puntos');
    puntos.textContent = '';
    carrusel.total = lista.length;
    $('carrusel-controles').hidden = carrusel.total < 2;
    Array.prototype.forEach.call(lista, function (d, k) {
      var b = crear('button', { type: 'button', clase: 'carrusel-punto', 'aria-label': 'Ir a la imagen ' + (k + 1) + ' de ' + lista.length });
      b.addEventListener('click', function () { irADiapo(k); });
      puntos.appendChild(b);
    });
    mostrarDiapo(Math.min(carrusel.actual, carrusel.total - 1));
    programarCarrusel();
  }

  function iniciarCarrusel() {
    var portada = $('portada');
    $('carrusel-anterior').addEventListener('click', function () { irADiapo(carrusel.actual - 1); });
    $('carrusel-siguiente').addEventListener('click', function () { irADiapo(carrusel.actual + 1); });
    // se detiene mientras el mouse o el teclado estan sobre la portada, o la pestaña no se ve
    function pausar(v) { carrusel.pausado = v; programarCarrusel(); }
    portada.addEventListener('mouseenter', function () { pausar(true); });
    portada.addEventListener('mouseleave', function () { pausar(false); });
    portada.addEventListener('focusin', function () { pausar(true); });
    portada.addEventListener('focusout', function () { pausar(false); });
    document.addEventListener('visibilitychange', programarCarrusel);
    // al girar el celular o cambiar el tamaño de la ventana se cambia de lista
    if (consultaMovil) {
      if (consultaMovil.addEventListener) consultaMovil.addEventListener('change', elegirCarrusel);
      else if (consultaMovil.addListener) consultaMovil.addListener(elegirCarrusel);
    }
    var inicioX = null;
    portada.addEventListener('touchstart', function (e) { inicioX = e.touches[0].clientX; }, { passive: true });
    portada.addEventListener('touchend', function (e) {
      if (inicioX === null) return;
      var dx = e.changedTouches[0].clientX - inicioX;
      inicioX = null;
      if (Math.abs(dx) > 40 && carrusel.total > 1) irADiapo(carrusel.actual + (dx < 0 ? 1 : -1));
    });
  }

  // Celulares en vertical usan su propia lista; si esta vacia, la de computadoras
  var consultaMovil = window.matchMedia ? window.matchMedia('(orientation: portrait) and (max-width: 900px)') : null;

  function elegirCarrusel() {
    var c = estado.config;
    var pc = Array.isArray(c.carrusel) ? c.carrusel : [];
    var movil = Array.isArray(c.carruselMovil) ? c.carruselMovil : [];
    var esMovil = !!(consultaMovil && consultaMovil.matches);
    var usaMovil = esMovil && movil.length > 0;
    $('portada').classList.toggle('vertical', usaMovil);
    carrusel.actual = 0;
    armarCarrusel(usaMovil ? movil : pc);
  }

  function aplicarConfig() {
    var c = estado.config;
    elegirCarrusel();
    if (c.heroTitulo) $('hero-titulo').textContent = c.heroTitulo;
    if (c.heroTexto) $('hero-texto').textContent = c.heroTexto;
    $('texto-envios').textContent = c.envios || '';

    var saludo = '¡Hola FutSal Camisetas! Quería hacer una consulta.';
    $('wa-flotante').href = linkWhatsapp(saludo);
    $('link-whatsapp').href = linkWhatsapp(saludo);
    $('dato-whatsapp').hidden = false;

    if (c.instagram) {
      $('link-instagram').href = 'https://instagram.com/' + encodeURIComponent(c.instagram);
      $('link-instagram').textContent = '@' + c.instagram;
      $('dato-instagram').hidden = false;
    }
    if (c.direccion) { $('txt-direccion').textContent = c.direccion; $('dato-direccion').hidden = false; }
    if (c.horario) { $('txt-horario').textContent = c.horario; $('dato-horario').hidden = false; }
  }

  /* ---------- Inicio ---------- */

  function pedir(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('Error ' + r.status);
      return r.json();
    });
  }

  function iniciar() {
    $('anio').textContent = new Date().getFullYear();
    imagenSegura($('p-imagen'));

    $('buscar').addEventListener('input', function (e) { estado.busqueda = e.target.value; pintarGrilla(); });
    $('orden').addEventListener('change', function (e) { estado.orden = e.target.value; pintarGrilla(); });

    var dlg = $('dlg-producto');
    dlg.querySelector('[data-cerrar]').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    $('p-anterior').addEventListener('click', function () { cambiarFoto(-1); });
    $('p-siguiente').addEventListener('click', function () { cambiarFoto(1); });
    dlg.addEventListener('keydown', function (e) {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft' && fotosDe(estado.actual).length > 1) cambiarFoto(-1);
      if (e.key === 'ArrowRight' && fotosDe(estado.actual).length > 1) cambiarFoto(1);
    });
    // deslizar con el dedo en el celular
    var inicioX = null;
    $('p-imagen').parentNode.addEventListener('touchstart', function (e) { inicioX = e.touches[0].clientX; }, { passive: true });
    $('p-imagen').parentNode.addEventListener('touchend', function (e) {
      if (inicioX === null) return;
      var dx = e.changedTouches[0].clientX - inicioX;
      inicioX = null;
      if (Math.abs(dx) > 40 && fotosDe(estado.actual).length > 1) cambiarFoto(dx < 0 ? 1 : -1);
    });
    $('p-menos').addEventListener('click', function () { estado.cantidad--; pintarDetalle(); });
    $('p-mas').addEventListener('click', function () { estado.cantidad++; pintarDetalle(); });
    $('p-agregar').addEventListener('click', agregarAlCarrito);

    iniciarCarrusel();
    $('abrir-carrito').addEventListener('click', abrirCarrito);
    $('cerrar-carrito').addEventListener('click', cerrarCarrito);
    $('velo').addEventListener('click', cerrarCarrito);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') cerrarCarrito(); });
    $('enviar-pedido').addEventListener('click', enviarPedido);
    $('form-pedido').addEventListener('submit', function (e) { e.preventDefault(); enviarPedido(); });
    Array.prototype.forEach.call(document.querySelectorAll('input[name="entrega"]'), function (r) {
      r.addEventListener('change', function () {
        $('campo-direccion').hidden = document.querySelector('input[name="entrega"]:checked').value !== 'envio';
      });
    });
    $('form-contacto').addEventListener('submit', enviarContacto);

    Promise.all([
      pedir('/api/productos'),
      pedir('/api/config'),
      pedir('/api/categorias').catch(function () { return []; })
    ]).then(function (r) {
      estado.productos = r[0];
      estado.config = r[1] || {};
      cargarCliente();
      estado.categorias = r[2] || [];
      aplicarConfig();
      pintarCategorias();
      pintarGrilla();
      pintarCarrito();
    }).catch(function () {
      var v = $('sin-resultados');
      v.textContent = 'No pudimos cargar el catálogo. Actualizá la página para probar de nuevo.';
      v.hidden = false;
    });
  }

  iniciar();
})();
