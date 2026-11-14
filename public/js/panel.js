/* FutSal Camisetas - panel del dueño / administrador */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var precioFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  var fechaFmt = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });
  var SIN_IMAGEN = '/img/sin-imagen.svg';
  var TALLES_RAPIDOS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '4', '6', '8', '10', '12', '14', '16'];

  var estado = {
    yo: null,
    productos: [],
    mensajes: [],
    usuarios: [],
    categorias: [],
    editando: null,       // producto en edicion (null = nuevo)
    fotos: []             // [{ url }] ya guardadas o [{ datos }] pendientes de subir (dataURL)
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

  function api(metodo, url, datos) {
    var opciones = { method: metodo, headers: {}, credentials: 'same-origin' };
    if (datos !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(datos);
    }
    return fetch(url, opciones).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401 && url !== '/api/login' && url !== '/api/yo') {
          mostrarLogin('Tu sesión venció. Ingresá de nuevo.');
        }
        if (!r.ok) throw new Error(j.error || 'Ocurrió un error (' + r.status + ').');
        return j;
      });
    }, function () {
      throw new Error('No hay conexión con el servidor. Revisá que esté encendido.');
    });
  }

  var temporizadorTostada;
  function tostada(texto) {
    var t = $('tostada');
    t.textContent = texto;
    t.hidden = false;
    clearTimeout(temporizadorTostada);
    temporizadorTostada = setTimeout(function () { t.hidden = true; }, 2600);
  }

  function aviso(id, texto, ok) {
    var el = $(id);
    if (!texto) { el.hidden = true; return; }
    el.textContent = texto;
    el.className = 'aviso ' + (ok ? 'aviso-ok' : 'aviso-error');
    el.hidden = false;
  }

  // Dialogo de confirmacion. Con opciones.campo pide un texto (contraseña nueva).
  function confirmar(opciones) {
    return new Promise(function (resolve) {
      var dlg = $('dlg-confirmar');
      $('confirmar-titulo').textContent = opciones.titulo;
      $('confirmar-texto').textContent = opciones.texto || '';
      var si = $('confirmar-si');
      si.textContent = opciones.boton || 'Aceptar';
      si.className = 'btn' + (opciones.peligro ? ' btn-peligro' : '');
      var input = $('confirmar-input');
      $('confirmar-campo').hidden = !opciones.campo;
      $('confirmar-label').textContent = opciones.campo || '';
      $('confirmar-error').hidden = true;
      input.type = opciones.tipoCampo || 'password';
      input.autocomplete = opciones.tipoCampo === 'text' ? 'off' : 'new-password';
      input.value = opciones.valor || '';

      function cerrar(valor) {
        si.removeEventListener('click', aceptar);
        $('confirmar-no').removeEventListener('click', cancelar);
        dlg.removeEventListener('cancel', cancelar);
        dlg.close();
        resolve(valor);
      }
      function aceptar() {
        if (opciones.campo) {
          var problema = opciones.validar ? opciones.validar(input.value) : (input.value.length < 8 ? 'Debe tener al menos 8 caracteres.' : '');
          if (problema) {
            $('confirmar-error').textContent = problema;
            $('confirmar-error').hidden = false;
            return;
          }
          cerrar(input.value);
        } else cerrar(true);
      }
      function cancelar(e) { if (e) e.preventDefault(); cerrar(null); }
      input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); aceptar(); } };
      si.addEventListener('click', aceptar);
      $('confirmar-no').addEventListener('click', cancelar);
      dlg.addEventListener('cancel', cancelar);
      dlg.showModal();
      if (opciones.campo) { input.focus(); input.select(); } else $('confirmar-no').focus();
    });
  }

  /* ---------- Sesion ---------- */

  function mostrarLogin(mensaje) {
    estado.yo = null;
    ['dlg-producto', 'dlg-confirmar'].forEach(function (id) { if ($(id).open) $(id).close(); });
    $('vista-panel').hidden = true;
    $('vista-login').hidden = false;
    $('l-password').value = '';
    aviso('login-error', mensaje || '');
    $('l-usuario').focus();
  }

  function mostrarPanel(usuario) {
    estado.yo = usuario;
    $('vista-login').hidden = true;
    $('vista-panel').hidden = false;
    $('quien').textContent = usuario.nombre + (usuario.rol === 'admin' ? ' (administrador)' : '');
    $('pestana-usuarios').hidden = usuario.rol !== 'admin';
    irA('productos');
    cargarTodo();
  }

  function entrar(ev) {
    ev.preventDefault();
    var boton = $('l-entrar');
    var usuario = $('l-usuario').value.trim();
    var password = $('l-password').value;
    if (!usuario || !password) { aviso('login-error', 'Escribí tu usuario y contraseña.'); return; }
    boton.disabled = true;
    boton.textContent = 'Ingresando...';
    api('POST', '/api/login', { usuario: usuario, password: password }).then(function (u) {
      $('form-login').reset();
      aviso('login-error', '');
      mostrarPanel(u);
    }).catch(function (e) {
      aviso('login-error', e.message);
    }).then(function () {
      boton.disabled = false;
      boton.textContent = 'Ingresar';
    });
  }

  function salir() {
    api('POST', '/api/logout').catch(function () {}).then(function () { mostrarLogin(''); });
  }

  /* ---------- Pestañas ---------- */

  function irA(nombre) {
    Array.prototype.forEach.call(document.querySelectorAll('.pestana'), function (b) {
      var activa = b.getAttribute('data-pestana') === nombre;
      b.setAttribute('aria-selected', String(activa));
      $('sec-' + b.getAttribute('data-pestana')).hidden = !activa;
    });
  }

  function cargarTodo() {
    cargarCategorias();
    cargarProductos();
    cargarMensajes();
    cargarConfig();
    if (estado.yo && estado.yo.rol === 'admin') cargarUsuarios();
  }

  /* ---------- Productos ---------- */

  function cargarProductos() {
    return api('GET', '/api/productos').then(function (lista) {
      estado.productos = lista;
      pintarProductos();
    }).catch(function (e) { tostada(e.message); });
  }

  function pintarProductos() {
    var cuerpo = $('tabla-productos');
    cuerpo.textContent = '';
    var lista = estado.productos;
    $('cuenta-productos').textContent = lista.length ? '(' + lista.length + ')' : '';
    $('sin-productos').hidden = lista.length > 0;
    cuerpo.closest('.tabla-envoltura').hidden = lista.length === 0;

    lista.forEach(function (p) {
      var img = crear('img', { src: p.imagen || SIN_IMAGEN, alt: '' });
      img.addEventListener('error', function () { if (img.getAttribute('src') !== SIN_IMAGEN) img.src = SIN_IMAGEN; });
      var talles = p.talles.length
        ? p.talles.map(function (t) { return t.talle + ': ' + t.stock; }).join(' · ')
        : 'Sin talles';
      var total = p.talles.reduce(function (s, t) { return s + t.stock; }, 0);
      var estadoTxt, estadoClase;
      if (!p.activo) { estadoTxt = 'Oculto'; estadoClase = 'pastilla'; }
      else if (p.talles.length && total === 0) { estadoTxt = 'Sin stock'; estadoClase = 'pastilla no'; }
      else { estadoTxt = 'Visible'; estadoClase = 'pastilla ok'; }

      var editar = crear('button', { type: 'button', clase: 'btn btn-linea btn-chico', texto: 'Editar', 'aria-label': 'Editar ' + p.nombre });
      editar.addEventListener('click', function () { abrirProducto(p); });
      var borrar = crear('button', { type: 'button', clase: 'btn btn-peligro btn-chico', texto: 'Borrar', 'aria-label': 'Borrar ' + p.nombre });
      borrar.addEventListener('click', function () { borrarProducto(p); });

      var nombre = crear('td', null, [crear('strong', { texto: p.nombre })]);
      if (p.destacado) nombre.appendChild(crear('div', { clase: 'tenue', texto: '★ Destacado' }));

      cuerpo.appendChild(crear('tr', null, [
        crear('td', { clase: 'mini' }, [img]),
        nombre,
        crear('td', { clase: 'ocultar-movil', texto: p.categoria }),
        crear('td', { texto: precioFmt.format(p.precio) }),
        crear('td', { clase: 'ocultar-movil tenue', texto: talles }),
        crear('td', { clase: 'ocultar-movil' }, [crear('span', { clase: estadoClase, texto: estadoTxt })]),
        crear('td', { clase: 'acciones' }, [editar, borrar])
      ]));
    });

    pintarCategorias(); // actualiza la cantidad de productos por categoria
  }

  function filaTalle(talle, stock) {
    var inTalle = crear('input', { type: 'text', maxlength: '12', placeholder: 'Talle', 'aria-label': 'Talle', value: talle || '' });
    var inStock = crear('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', placeholder: 'Stock', 'aria-label': 'Stock del talle', value: stock === undefined ? '' : String(stock) });
    var quitar = crear('button', { type: 'button', clase: 'btn-icono', 'aria-label': 'Quitar talle', texto: '✕' });
    var fila = crear('div', { clase: 'fila-talle' }, [inTalle, inStock, quitar]);
    quitar.addEventListener('click', function () { fila.remove(); pintarRapidos(); });
    inTalle.addEventListener('input', pintarRapidos);
    return fila;
  }

  function tallesDelFormulario() {
    return Array.prototype.map.call($('pr-talles').children, function (fila) {
      var inputs = fila.querySelectorAll('input');
      return { talle: inputs[0].value.trim().toUpperCase(), stock: inputs[1].value.trim() };
    });
  }

  function pintarRapidos() {
    var usados = tallesDelFormulario().map(function (t) { return t.talle; });
    var cont = $('pr-rapidos');
    cont.textContent = '';
    TALLES_RAPIDOS.forEach(function (t) {
      if (usados.indexOf(t) !== -1) return;
      var b = crear('button', { type: 'button', clase: 'chip', texto: '+ ' + t, 'aria-label': 'Agregar talle ' + t });
      b.addEventListener('click', function () {
        var fila = filaTalle(t, '');
        $('pr-talles').appendChild(fila);
        pintarRapidos();
        fila.querySelectorAll('input')[1].focus();
      });
      cont.appendChild(b);
    });
  }

  var MAX_FOTOS = 5;

  function pintarFotos() {
    var cont = $('pr-fotos');
    cont.textContent = '';
    var fotos = estado.fotos;
    $('pr-fotos-cuenta').textContent = '(' + fotos.length + ' de ' + MAX_FOTOS + ')';

    fotos.forEach(function (f, i) {
      var img = crear('img', { src: f.datos || f.url, alt: 'Foto ' + (i + 1) });
      img.addEventListener('error', function () { if (img.getAttribute('src') !== SIN_IMAGEN) img.src = SIN_IMAGEN; });
      var izq = crear('button', { type: 'button', texto: '←', 'aria-label': 'Mover la foto ' + (i + 1) + ' a la izquierda' });
      var der = crear('button', { type: 'button', texto: '→', 'aria-label': 'Mover la foto ' + (i + 1) + ' a la derecha' });
      var quitar = crear('button', { type: 'button', texto: '✕', 'aria-label': 'Quitar la foto ' + (i + 1) });
      izq.disabled = i === 0;
      der.disabled = i === fotos.length - 1;
      izq.addEventListener('click', function () { moverFoto(i, -1); });
      der.addEventListener('click', function () { moverFoto(i, 1); });
      quitar.addEventListener('click', function () { estado.fotos.splice(i, 1); pintarFotos(); });
      cont.appendChild(crear('div', { clase: 'foto-item' }, [
        img,
        i === 0 ? crear('span', { clase: 'portada-tag', texto: 'Portada' }) : null,
        crear('div', { clase: 'foto-acc' }, [izq, quitar, der])
      ]));
    });

    if (fotos.length < MAX_FOTOS) {
      var agregar = crear('label', { 'for': 'pr-archivo', clase: 'foto-agregar' }, [
        crear('span', { texto: '+', 'aria-hidden': 'true' }),
        document.createTextNode(fotos.length ? 'Agregar' : 'Agregar fotos')
      ]);
      agregar.tabIndex = 0;
      agregar.setAttribute('role', 'button');
      agregar.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('pr-archivo').click(); }
      });
      cont.appendChild(agregar);
    }
  }

  function moverFoto(i, delta) {
    var j = i + delta;
    if (j < 0 || j >= estado.fotos.length) return;
    var f = estado.fotos.splice(i, 1)[0];
    estado.fotos.splice(j, 0, f);
    pintarFotos();
  }

  function agregarArchivos(archivos) {
    var lugar = MAX_FOTOS - estado.fotos.length;
    var lista = Array.prototype.slice.call(archivos);
    if (!lista.length) return;
    if (lista.length > lugar) {
      aviso('producto-error', 'Máximo ' + MAX_FOTOS + ' fotos por producto. Se agregaron solo ' + Math.max(lugar, 0) + '.');
      lista = lista.slice(0, Math.max(lugar, 0));
    } else {
      aviso('producto-error', '');
    }
    // se procesan en orden para respetar el orden elegido
    lista.reduce(function (cadena, archivo) {
      return cadena.then(function () {
        return prepararImagen(archivo).then(function (dataUrl) {
          if (estado.fotos.length < MAX_FOTOS) estado.fotos.push({ datos: dataUrl });
          pintarFotos();
        }).catch(function (err) { aviso('producto-error', err.message); });
      });
    }, Promise.resolve());
  }

  function abrirProducto(p) {
    estado.editando = p || null;
    estado.fotos = (p ? (p.imagenes && p.imagenes.length ? p.imagenes : (p.imagen ? [p.imagen] : [])) : [])
      .map(function (url) { return { url: url }; });
    $('dlg-producto-titulo').textContent = p ? 'Editar producto' : 'Agregar producto';
    $('pr-nombre').value = p ? p.nombre : '';
    llenarSelectCategorias(p ? p.categoria : null);
    mostrarCrearCategoria(estado.categorias.length === 0);
    $('pr-precio').value = p ? p.precio : '';
    $('pr-descripcion').value = p ? p.descripcion : '';
    $('pr-destacado').checked = p ? p.destacado : false;
    $('pr-activo').checked = p ? p.activo : true;
    $('pr-archivo').value = '';
    var cont = $('pr-talles');
    cont.textContent = '';
    (p ? p.talles : []).forEach(function (t) { cont.appendChild(filaTalle(t.talle, t.stock)); });
    pintarRapidos();
    pintarFotos();
    aviso('producto-error', '');
    $('dlg-producto').showModal();
    $('pr-nombre').focus();
  }

  // Achica la foto en el navegador antes de subirla (max 1200 px, JPG)
  function prepararImagen(archivo, maximo) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) {
        return reject(new Error('Elegí una imagen JPG, PNG o WEBP.'));
      }
      var url = URL.createObjectURL(archivo);
      var img = new Image();
      img.onload = function () {
        var max = maximo || 1200;
        var escala = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.max(1, Math.round(img.naturalWidth * escala));
        var h = Math.max(1, Math.round(img.naturalHeight * escala));
        var canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen. Probá con otra.'));
      };
      img.src = url;
    });
  }

  function guardarProducto(ev) {
    ev.preventDefault();
    var nombre = $('pr-nombre').value.trim();
    var creando = !$('pr-cat-crear').hidden;
    var categoria = creando ? $('pr-cat-nombre').value.trim() : $('pr-categoria').value;
    var precioTxt = $('pr-precio').value.trim();
    var precio = Number(precioTxt);
    var talles = tallesDelFormulario();

    var error = '';
    var vistos = {};
    if (!nombre) error = 'Escribí el nombre del producto.';
    else if (!categoria) error = creando ? 'Escribí el nombre de la nueva categoría o tocá ✕ para elegir una existente.' : 'Elegí una categoría.';
    else if (precioTxt === '' || !isFinite(precio) || precio < 0) error = 'Escribí un precio válido (solo números).';
    else talles.some(function (t) {
      var stock = Number(t.stock);
      if (!t.talle) error = 'Hay un talle sin nombre. Completalo o quitalo.';
      else if (vistos[t.talle]) error = 'El talle ' + t.talle + ' está repetido.';
      else if (t.stock === '' || !isFinite(stock) || stock < 0 || Math.floor(stock) !== stock) error = 'Escribí el stock del talle ' + t.talle + ' (0 si no hay).';
      vistos[t.talle] = true;
      return !!error;
    });
    if (error) { aviso('producto-error', error); return; }
    aviso('producto-error', '');

    var boton = $('guardar-producto');
    boton.disabled = true;
    boton.textContent = 'Guardando...';

    // Sube una por una las fotos nuevas; las ya subidas no se vuelven a subir si algo falla despues
    var pendientes = estado.fotos.filter(function (f) { return f.datos; }).length;
    var hechas = 0;
    var subida = estado.fotos.reduce(function (cadena, f) {
      return cadena.then(function () {
        if (!f.datos) return;
        hechas++;
        boton.textContent = 'Subiendo foto ' + hechas + ' de ' + pendientes + '...';
        return api('POST', '/api/imagenes', { datos: f.datos }).then(function (r) {
          f.url = r.url;
          delete f.datos;
        });
      });
    }, Promise.resolve());

    subida.then(function () {
      boton.textContent = 'Guardando...';
      var imagenes = estado.fotos.map(function (f) { return f.url; });
      var datos = {
        nombre: nombre,
        categoria: categoria,
        precio: Math.round(precio),
        descripcion: $('pr-descripcion').value.trim(),
        imagenes: imagenes,
        talles: talles.map(function (t) { return { talle: t.talle, stock: Number(t.stock) }; }),
        destacado: $('pr-destacado').checked,
        activo: $('pr-activo').checked
      };
      return estado.editando
        ? api('PUT', '/api/productos/' + estado.editando.id, datos)
        : api('POST', '/api/productos', datos);
    }).then(function () {
      $('dlg-producto').close();
      tostada(estado.editando ? 'Producto actualizado' : 'Producto agregado');
      return cargarCategorias().then(cargarProductos);
    }).catch(function (e) {
      aviso('producto-error', e.message);
    }).then(function () {
      boton.disabled = false;
      boton.textContent = 'Guardar';
    });
  }

  function borrarProducto(p) {
    confirmar({
      titulo: '¿Borrar “' + p.nombre + '”?',
      texto: 'Se quita de la tienda y no se puede deshacer. Si solo querés ocultarlo, editá el producto y destildá “Visible en la tienda”.',
      boton: 'Borrar',
      peligro: true
    }).then(function (ok) {
      if (!ok) return;
      api('DELETE', '/api/productos/' + p.id).then(function () {
        tostada('Producto borrado');
        cargarProductos();
      }).catch(function (e) { tostada(e.message); });
    });
  }

  /* ---------- Categorias ---------- */

  function cargarCategorias() {
    return api('GET', '/api/categorias').then(function (lista) {
      estado.categorias = lista;
      pintarCategorias();
    }).catch(function (e) { tostada(e.message); });
  }

  function productosEn(nombre) {
    return estado.productos.filter(function (p) { return p.categoria === nombre; }).length;
  }

  function pintarCategorias() {
    var cuerpo = $('tabla-categorias');
    cuerpo.textContent = '';
    var lista = estado.categorias;
    $('sin-categorias').hidden = lista.length > 0;
    cuerpo.closest('.tabla-envoltura').hidden = lista.length === 0;

    lista.forEach(function (c, i) {
      var subir = crear('button', { type: 'button', clase: 'btn-icono', texto: '↑', 'aria-label': 'Subir ' + c.nombre });
      var bajar = crear('button', { type: 'button', clase: 'btn-icono', texto: '↓', 'aria-label': 'Bajar ' + c.nombre });
      subir.disabled = i === 0;
      bajar.disabled = i === lista.length - 1;
      subir.addEventListener('click', function () { moverCategoria(c, 'arriba'); });
      bajar.addEventListener('click', function () { moverCategoria(c, 'abajo'); });

      var renombrar = crear('button', { type: 'button', clase: 'btn btn-linea btn-chico', texto: 'Renombrar', 'aria-label': 'Renombrar ' + c.nombre });
      renombrar.addEventListener('click', function () { renombrarCategoria(c); });
      var borrar = crear('button', { type: 'button', clase: 'btn btn-peligro btn-chico', texto: 'Borrar', 'aria-label': 'Borrar ' + c.nombre });
      borrar.addEventListener('click', function () { borrarCategoria(c); });

      var n = productosEn(c.nombre);
      cuerpo.appendChild(crear('tr', null, [
        crear('td', null, [crear('span', { clase: 'orden-btns' }, [subir, bajar])]),
        crear('td', null, [crear('strong', { texto: c.nombre })]),
        crear('td', { clase: 'tenue', texto: n === 1 ? '1 producto' : n + ' productos' }),
        crear('td', { clase: 'acciones' }, [renombrar, borrar])
      ]));
    });
  }

  function llenarSelectCategorias(seleccionada) {
    var sel = $('pr-categoria');
    sel.textContent = '';
    if (!estado.categorias.length) sel.appendChild(crear('option', { value: '', texto: 'No hay categorías' }));
    estado.categorias.forEach(function (c) { sel.appendChild(crear('option', { value: c.nombre, texto: c.nombre })); });
    if (seleccionada && !estado.categorias.some(function (c) { return c.nombre === seleccionada; })) {
      sel.appendChild(crear('option', { value: seleccionada, texto: seleccionada }));
    }
    if (seleccionada) sel.value = seleccionada;
  }

  function mostrarCrearCategoria(mostrar) {
    $('pr-cat-elegir').hidden = mostrar;
    $('pr-cat-crear').hidden = !mostrar;
    $('pr-cat-cancelar').hidden = estado.categorias.length === 0;
    $('pr-cat-nombre').value = '';
  }

  function validarNombreCategoria(nombre, excepto) {
    nombre = nombre.trim();
    if (!nombre) return 'Escribí un nombre.';
    if (nombre.length > 40) return 'Máximo 40 caracteres.';
    var repetida = estado.categorias.some(function (c) {
      return c.id !== excepto && c.nombre.toLowerCase() === nombre.toLowerCase();
    });
    return repetida ? 'Ya existe una categoría con ese nombre.' : '';
  }

  function crearCategoria(nombre) {
    return api('POST', '/api/categorias', { nombre: nombre.trim() }).then(function (c) {
      return cargarCategorias().then(function () { return c; });
    });
  }

  function agregarCategoriaDesdeProducto() {
    var nombre = $('pr-cat-nombre').value;
    var problema = validarNombreCategoria(nombre);
    if (problema) { aviso('producto-error', problema); $('pr-cat-nombre').focus(); return; }
    var boton = $('pr-cat-agregar');
    boton.disabled = true;
    crearCategoria(nombre).then(function (c) {
      aviso('producto-error', '');
      llenarSelectCategorias(c.nombre);
      mostrarCrearCategoria(false);
      tostada('Categoría “' + c.nombre + '” creada');
    }).catch(function (e) {
      aviso('producto-error', e.message);
    }).then(function () { boton.disabled = false; });
  }

  function agregarCategoriaDesdePestana(ev) {
    ev.preventDefault();
    var nombre = $('cat-nombre').value;
    var problema = validarNombreCategoria(nombre);
    if (problema) { aviso('categoria-aviso', problema); return; }
    crearCategoria(nombre).then(function (c) {
      $('form-categoria').reset();
      aviso('categoria-aviso', 'Categoría “' + c.nombre + '” creada.', true);
    }).catch(function (e) { aviso('categoria-aviso', e.message); });
  }

  function moverCategoria(c, hacia) {
    api('PUT', '/api/categorias/' + c.id, { mover: hacia }).then(function (lista) {
      estado.categorias = lista;
      pintarCategorias();
    }).catch(function (e) { tostada(e.message); });
  }

  function renombrarCategoria(c) {
    var n = productosEn(c.nombre);
    confirmar({
      titulo: 'Renombrar “' + c.nombre + '”',
      texto: n ? 'Se actualizan también ' + (n === 1 ? 'el producto' : 'los ' + n + ' productos') + ' de esta categoría.' : '',
      campo: 'Nombre nuevo',
      tipoCampo: 'text',
      valor: c.nombre,
      validar: function (v) { return validarNombreCategoria(v, c.id); },
      boton: 'Guardar'
    }).then(function (nombre) {
      if (!nombre || nombre.trim() === c.nombre) return;
      api('PUT', '/api/categorias/' + c.id, { nombre: nombre.trim() }).then(function (lista) {
        estado.categorias = lista;
        tostada('Categoría renombrada');
        return cargarProductos();
      }).catch(function (e) { tostada(e.message); });
    });
  }

  function borrarCategoria(c) {
    var n = productosEn(c.nombre);
    if (n > 0) {
      tostada('“' + c.nombre + '” tiene ' + (n === 1 ? '1 producto' : n + ' productos') + '. Pasalos a otra categoría antes de borrarla.');
      return;
    }
    confirmar({ titulo: '¿Borrar la categoría “' + c.nombre + '”?', texto: 'No tiene productos. No se puede deshacer.', boton: 'Borrar', peligro: true }).then(function (ok) {
      if (!ok) return;
      api('DELETE', '/api/categorias/' + c.id).then(function () {
        tostada('Categoría borrada');
        cargarCategorias();
      }).catch(function (e) { tostada(e.message); });
    });
  }

  /* ---------- Clientes ---------- */

  function cargarClientes() {
    return api('GET', '/api/clientes').then(function (lista) {
      var cuerpo = $('tabla-clientes');
      cuerpo.textContent = '';
      $('cuenta-clientes').textContent = lista.length ? '(' + lista.length + ')' : '';
      $('sin-clientes').hidden = lista.length > 0;
      cuerpo.closest('.tabla-envoltura').hidden = lista.length === 0;
      lista.forEach(function (c) {
        var direccion = [c.direccion, c.localidad, c.provincia].filter(Boolean).join(', ') + (c.cp ? ' (CP ' + c.cp + ')' : '');
        cuerpo.appendChild(crear('tr', null, [
          crear('td', null, [crear('strong', { texto: c.nombre + ' ' + c.apellido })]),
          crear('td', null, [crear('a', { href: 'mailto:' + c.email, texto: c.email })]),
          crear('td', { clase: 'ocultar-movil tenue', texto: direccion }),
          crear('td', { clase: 'ocultar-movil tenue', texto: c.telefono || '—' }),
          crear('td', null, [crear('span', { clase: c.verificado ? 'pastilla ok' : 'pastilla', texto: c.verificado ? 'Confirmado' : 'Sin confirmar' })]),
          crear('td', { clase: 'ocultar-movil tenue', texto: fechaFmt.format(new Date(c.creado)) })
        ]));
      });
    }).catch(function (e) { tostada(e.message); });
  }

  /* ---------- Mensajes ---------- */

  function cargarMensajes() {
    return api('GET', '/api/mensajes').then(function (lista) {
      estado.mensajes = lista;
      pintarMensajes();
    }).catch(function (e) { tostada(e.message); });
  }

  function enlaceRespuesta(contacto) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto)) return { href: 'mailto:' + contacto, texto: 'Responder por email' };
    var digitos = contacto.replace(/\D/g, '');
    if (digitos.length >= 8) {
      if (digitos.length === 10) digitos = '549' + digitos;        // numero argentino sin codigo de pais
      return { href: 'https://wa.me/' + digitos, texto: 'Responder por WhatsApp' };
    }
    return null;
  }

  function pintarMensajes() {
    var cont = $('lista-mensajes');
    cont.textContent = '';
    var lista = estado.mensajes;
    var nuevos = lista.filter(function (m) { return !m.leido; }).length;
    var burbuja = $('burbuja-mensajes');
    burbuja.textContent = nuevos;
    burbuja.hidden = nuevos === 0;
    $('sin-mensajes').hidden = lista.length > 0;

    lista.forEach(function (m) {
      var acciones = crear('div', { clase: 'mensaje-acc' });
      var resp = enlaceRespuesta(m.contacto);
      if (resp) acciones.appendChild(crear('a', { clase: 'btn btn-chico', href: resp.href, target: '_blank', rel: 'noopener', texto: resp.texto }));
      var marcar = crear('button', { type: 'button', clase: 'btn btn-linea btn-chico', texto: m.leido ? 'Marcar como no leído' : 'Marcar como leído' });
      marcar.addEventListener('click', function () {
        api('PUT', '/api/mensajes/' + m.id, { leido: !m.leido }).then(cargarMensajes).catch(function (e) { tostada(e.message); });
      });
      var borrar = crear('button', { type: 'button', clase: 'btn btn-peligro btn-chico', texto: 'Borrar' });
      borrar.addEventListener('click', function () {
        confirmar({ titulo: '¿Borrar el mensaje de ' + m.nombre + '?', texto: 'No se puede deshacer.', boton: 'Borrar', peligro: true }).then(function (ok) {
          if (!ok) return;
          api('DELETE', '/api/mensajes/' + m.id).then(function () { tostada('Mensaje borrado'); cargarMensajes(); }).catch(function (e) { tostada(e.message); });
        });
      });
      acciones.appendChild(marcar);
      acciones.appendChild(borrar);

      cont.appendChild(crear('article', { clase: 'mensaje' + (m.leido ? '' : ' nuevo') }, [
        crear('div', { clase: 'mensaje-cab' }, [
          crear('div', null, [
            crear('strong', { texto: m.nombre + (m.leido ? '' : ' · Nuevo') }),
            crear('div', { clase: 'tenue', texto: m.contacto })
          ]),
          crear('span', { clase: 'tenue', texto: fechaFmt.format(new Date(m.fecha)) })
        ]),
        crear('p', { texto: m.mensaje }),
        acciones
      ]));
    });
  }

  /* ---------- Datos del negocio ---------- */

  var CAMPOS_CONFIG = ['whatsapp', 'instagram', 'direccion', 'horario', 'heroTitulo', 'heroTexto', 'envios'];

  /* ---------- Carrusel de la portada ---------- */

  var MAX_CARRUSEL = 8;
  var carrusel = [];
  var carruselOcupado = false;

  function pintarCarrusel() {
    var cont = $('ca-fotos');
    cont.textContent = '';
    $('ca-cuenta').textContent = '(' + carrusel.length + ' de ' + MAX_CARRUSEL + ')';
    carrusel.forEach(function (url, i) {
      var img = crear('img', { src: url, alt: 'Imagen ' + (i + 1) + ' del carrusel' });
      var izq = crear('button', { type: 'button', texto: '←', 'aria-label': 'Mover la imagen ' + (i + 1) + ' antes' });
      var der = crear('button', { type: 'button', texto: '→', 'aria-label': 'Mover la imagen ' + (i + 1) + ' después' });
      var quitar = crear('button', { type: 'button', texto: '✕', 'aria-label': 'Quitar la imagen ' + (i + 1) + ' del carrusel' });
      izq.disabled = i === 0;
      der.disabled = i === carrusel.length - 1;
      izq.addEventListener('click', function () { moverCarrusel(i, -1); });
      der.addEventListener('click', function () { moverCarrusel(i, 1); });
      quitar.addEventListener('click', function () {
        confirmar({ titulo: '¿Quitar esta imagen del carrusel?', texto: 'Deja de mostrarse en la portada y se borra.', boton: 'Quitar', peligro: true }).then(function (ok) {
          if (!ok) return;
          var nueva = carrusel.slice();
          nueva.splice(i, 1);
          guardarCarrusel(nueva, 'Imagen quitada');
        });
      });
      cont.appendChild(crear('div', { clase: 'foto-item' }, [img, crear('div', { clase: 'foto-acc' }, [izq, quitar, der])]));
    });
    if (carrusel.length < MAX_CARRUSEL) {
      var agregar = crear('label', { 'for': 'ca-archivo', clase: 'foto-agregar' }, [
        crear('span', { texto: '+', 'aria-hidden': 'true' }),
        document.createTextNode('Agregar imagen')
      ]);
      agregar.tabIndex = 0;
      agregar.setAttribute('role', 'button');
      agregar.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('ca-archivo').click(); }
      });
      cont.appendChild(agregar);
    }
  }

  function guardarCarrusel(lista, mensaje) {
    return api('PUT', '/api/carrusel', { imagenes: lista }).then(function (r) {
      carrusel = r.imagenes;
      pintarCarrusel();
      if (mensaje) aviso('carrusel-aviso', mensaje + '. Ya se ve en la tienda.', true);
    }).catch(function (e) {
      aviso('carrusel-aviso', e.message);
      pintarCarrusel();
    });
  }

  function moverCarrusel(i, delta) {
    var j = i + delta;
    if (j < 0 || j >= carrusel.length) return;
    var nueva = carrusel.slice();
    var f = nueva.splice(i, 1)[0];
    nueva.splice(j, 0, f);
    guardarCarrusel(nueva, 'Orden cambiado');
  }

  function agregarAlCarrusel(archivos) {
    if (carruselOcupado) return;
    var lista = Array.prototype.slice.call(archivos);
    var lugar = MAX_CARRUSEL - carrusel.length;
    if (!lista.length) return;
    var recortado = lista.length > lugar;
    lista = lista.slice(0, Math.max(lugar, 0));
    carruselOcupado = true;
    var nuevas = [];
    var error = '';
    aviso('carrusel-aviso', 'Subiendo ' + (lista.length === 1 ? 'la imagen' : lista.length + ' imágenes') + '...', true);
    lista.reduce(function (cadena, archivo) {
      return cadena.then(function () {
        return prepararImagen(archivo, 1920).then(function (dataUrl) {
          return api('POST', '/api/imagenes', { datos: dataUrl });
        }).then(function (r) { nuevas.push(r.url); }).catch(function (e) { error = e.message; });
      });
    }, Promise.resolve()).then(function () {
      if (!nuevas.length) { aviso('carrusel-aviso', error || 'No se pudo subir la imagen.'); return; }
      return guardarCarrusel(carrusel.concat(nuevas), nuevas.length === 1 ? 'Imagen agregada' : nuevas.length + ' imágenes agregadas').then(function () {
        if (error) aviso('carrusel-aviso', 'Una imagen no se pudo subir: ' + error);
        else if (recortado) aviso('carrusel-aviso', 'Máximo ' + MAX_CARRUSEL + ' imágenes: se agregaron solo las que entraban.');
      });
    }).then(function () { carruselOcupado = false; });
  }

  function cargarConfig() {
    return api('GET', '/api/config').then(function (c) {
      carrusel = Array.isArray(c.carrusel) ? c.carrusel : [];
      pintarCarrusel();
      CAMPOS_CONFIG.forEach(function (k) { $('cf-' + k).value = c[k] || ''; });
    }).catch(function (e) { tostada(e.message); });
  }

  function guardarConfig(ev) {
    ev.preventDefault();
    var datos = {};
    CAMPOS_CONFIG.forEach(function (k) { datos[k] = $('cf-' + k).value.trim(); });
    var boton = $('cf-guardar');
    boton.disabled = true;
    api('PUT', '/api/config', datos).then(function (c) {
      CAMPOS_CONFIG.forEach(function (k) { $('cf-' + k).value = c[k] || ''; });
      aviso('config-aviso', 'Cambios guardados. Ya se ven en la tienda.', true);
    }).catch(function (e) {
      aviso('config-aviso', e.message);
    }).then(function () { boton.disabled = false; });
  }

  /* ---------- Usuarios (solo admin) ---------- */

  function cargarUsuarios() {
    return api('GET', '/api/usuarios').then(function (lista) {
      estado.usuarios = lista;
      var cuerpo = $('tabla-usuarios');
      cuerpo.textContent = '';
      lista.forEach(function (u) {
        var soyYo = u.id === estado.yo.id;
        var acciones = crear('td', { clase: 'acciones' });
        if (soyYo) {
          acciones.appendChild(crear('span', { clase: 'tenue', texto: 'Sos vos' }));
        } else {
          var clave = crear('button', { type: 'button', clase: 'btn btn-linea btn-chico', texto: 'Nueva contraseña', 'aria-label': 'Poner nueva contraseña a ' + u.usuario });
          clave.addEventListener('click', function () {
            confirmar({
              titulo: 'Nueva contraseña para ' + u.usuario,
              texto: 'Se cierra la sesión de ese usuario y va a tener que ingresar con la contraseña nueva.',
              campo: 'Contraseña nueva (mínimo 8 caracteres)',
              boton: 'Guardar'
            }).then(function (pass) {
              if (!pass) return;
              api('PUT', '/api/usuarios/' + u.id, { password: pass }).then(function () { tostada('Contraseña cambiada'); }).catch(function (e) { tostada(e.message); });
            });
          });
          var borrar = crear('button', { type: 'button', clase: 'btn btn-peligro btn-chico', texto: 'Borrar', 'aria-label': 'Borrar usuario ' + u.usuario });
          borrar.addEventListener('click', function () {
            confirmar({ titulo: '¿Borrar el usuario ' + u.usuario + '?', texto: 'Ya no va a poder entrar al panel.', boton: 'Borrar', peligro: true }).then(function (ok) {
              if (!ok) return;
              api('DELETE', '/api/usuarios/' + u.id).then(function () { tostada('Usuario borrado'); cargarUsuarios(); }).catch(function (e) { tostada(e.message); });
            });
          });
          acciones.appendChild(clave);
          acciones.appendChild(borrar);
        }
        cuerpo.appendChild(crear('tr', null, [
          crear('td', null, [crear('strong', { texto: u.usuario })]),
          crear('td', { texto: u.nombre }),
          crear('td', { texto: u.rol === 'admin' ? 'Administrador' : 'Dueño' }),
          acciones
        ]));
      });
    }).catch(function (e) { tostada(e.message); });
  }

  function crearUsuario(ev) {
    ev.preventDefault();
    var datos = {
      usuario: $('u-usuario').value.trim(),
      nombre: $('u-nombre').value.trim(),
      password: $('u-password').value,
      rol: $('u-rol').value
    };
    if (!datos.usuario) { aviso('usuario-aviso', 'Escribí el nombre de usuario.'); return; }
    if (datos.password.length < 8) { aviso('usuario-aviso', 'La contraseña debe tener al menos 8 caracteres.'); return; }
    api('POST', '/api/usuarios', datos).then(function () {
      $('form-usuario').reset();
      aviso('usuario-aviso', 'Usuario creado.', true);
      cargarUsuarios();
    }).catch(function (e) { aviso('usuario-aviso', e.message); });
  }

  /* ---------- Mi cuenta ---------- */

  function cambiarPassword(ev) {
    ev.preventDefault();
    var actual = $('pw-actual').value, nueva = $('pw-nueva').value, repetir = $('pw-repetir').value;
    if (!actual) { aviso('password-aviso', 'Escribí tu contraseña actual.'); return; }
    if (nueva.length < 8) { aviso('password-aviso', 'La contraseña nueva debe tener al menos 8 caracteres.'); return; }
    if (nueva !== repetir) { aviso('password-aviso', 'Las dos contraseñas nuevas no coinciden.'); return; }
    api('PUT', '/api/password', { actual: actual, nueva: nueva }).then(function () {
      $('form-password').reset();
      aviso('password-aviso', 'Contraseña cambiada.', true);
    }).catch(function (e) { aviso('password-aviso', e.message); });
  }

  /* ---------- Inicio ---------- */

  function iniciar() {
    $('form-login').addEventListener('submit', entrar);
    $('salir').addEventListener('click', salir);
    Array.prototype.forEach.call(document.querySelectorAll('.pestana'), function (b) {
      b.addEventListener('click', function () {
        var nombre = b.getAttribute('data-pestana');
        irA(nombre);
        if (nombre === 'mensajes') cargarMensajes();
        if (nombre === 'clientes') cargarClientes();
      });
    });

    $('nuevo-producto').addEventListener('click', function () { abrirProducto(null); });
    $('form-producto').addEventListener('submit', guardarProducto);
    $('cerrar-producto').addEventListener('click', function () { $('dlg-producto').close(); });
    $('cancelar-producto').addEventListener('click', function () { $('dlg-producto').close(); });
    $('pr-otro-talle').addEventListener('click', function () {
      var fila = filaTalle('', '');
      $('pr-talles').appendChild(fila);
      fila.querySelector('input').focus();
    });
    $('pr-archivo').addEventListener('change', function (e) {
      agregarArchivos(e.target.files || []);
      e.target.value = '';
    });

    $('pr-cat-nueva').addEventListener('click', function () { mostrarCrearCategoria(true); $('pr-cat-nombre').focus(); });
    $('pr-cat-cancelar').addEventListener('click', function () { mostrarCrearCategoria(false); aviso('producto-error', ''); });
    $('pr-cat-agregar').addEventListener('click', agregarCategoriaDesdeProducto);
    $('pr-cat-nombre').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); agregarCategoriaDesdeProducto(); }
    });
    $('form-categoria').addEventListener('submit', agregarCategoriaDesdePestana);
    $('form-config').addEventListener('submit', guardarConfig);
    $('ca-archivo').addEventListener('change', function (e) {
      agregarAlCarrusel(e.target.files || []);
      e.target.value = '';
    });
    $('form-usuario').addEventListener('submit', crearUsuario);
    $('form-password').addEventListener('submit', cambiarPassword);

    api('GET', '/api/yo').then(mostrarPanel).catch(function () { mostrarLogin(''); });
  }

  iniciar();
})();
