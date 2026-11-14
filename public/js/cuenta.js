/* FutSal Camisetas - cuenta del cliente */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var VISTAS = ['ingresar', 'registro', 'verificar', 'recuperar', 'restablecer', 'perfil'];
  var estado = { email: '', cliente: null };

  /* ---------- Utilidades ---------- */

  function api(metodo, url, datos) {
    var opciones = { method: metodo, headers: {}, credentials: 'same-origin' };
    if (datos !== undefined) {
      opciones.headers['Content-Type'] = 'application/json';
      opciones.body = JSON.stringify(datos);
    }
    return fetch(url, opciones).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) {
          var e = new Error(j.error || 'Ocurrió un error (' + r.status + ').');
          e.datos = j;
          throw e;
        }
        return j;
      });
    }, function () {
      throw new Error('No hay conexión. Probá de nuevo.');
    });
  }

  function aviso(form, texto, ok) {
    var el = form.querySelector('[data-aviso]');
    if (!texto) { el.hidden = true; return; }
    el.textContent = texto;
    el.className = 'aviso ' + (ok ? 'aviso-ok' : 'aviso-error');
    el.hidden = false;
  }

  function ir(vista, mensaje) {
    $('cargando').hidden = true;
    VISTAS.forEach(function (v) { $('vista-' + v).hidden = v !== vista; });
    var cont = $('vista-' + vista);
    Array.prototype.forEach.call(cont.querySelectorAll('[data-aviso]'), function (a) { a.hidden = true; });
    if (mensaje) aviso(cont.tagName === 'FORM' ? cont : cont.querySelector('form'), mensaje, true);
    $('ve-email').textContent = estado.email;
    $('rs-email').textContent = estado.email;
    var primero = cont.querySelector('input:not([disabled]), select');
    if (primero && vista !== 'perfil') primero.focus();
    window.scrollTo(0, 0);
  }

  // Envia un formulario mostrando el estado en su boton
  function enviar(form, tarea) {
    var boton = form.querySelector('button[type="submit"]');
    var original = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Un momento...';
    aviso(form, '');
    return tarea().catch(function (e) {
      aviso(form, e.message);
      return Promise.reject(e);
    }).then(function (v) {
      boton.disabled = false; boton.textContent = original; return v;
    }, function () {
      boton.disabled = false; boton.textContent = original;
    });
  }

  function valor(id) { return $(id).value.trim(); }

  function validarClave(a, b) {
    if (a.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (a !== b) return 'Las contraseñas no coinciden.';
    return '';
  }

  function llenarProvincias(lista) {
    ['re-provincia', 'pf-provincia'].forEach(function (id) {
      var sel = $(id);
      sel.textContent = '';
      lista.forEach(function (p) {
        var o = document.createElement('option');
        o.value = p; o.textContent = p;
        sel.appendChild(o);
      });
      sel.value = 'Salta';
    });
  }

  function mostrarPerfil(cliente, mensaje) {
    estado.cliente = cliente;
    $('pf-saludo').textContent = cliente.nombre;
    ['email', 'nombre', 'apellido', 'direccion', 'localidad', 'provincia', 'cp', 'telefono'].forEach(function (k) {
      $('pf-' + k).value = cliente[k] || '';
    });
    $('form-clave').reset();
    ir('perfil');
    if (mensaje) aviso($('form-datos'), mensaje, true);
  }

  function datosPerfil(prefijo) {
    return {
      nombre: valor(prefijo + 'nombre'), apellido: valor(prefijo + 'apellido'), direccion: valor(prefijo + 'direccion'),
      localidad: valor(prefijo + 'localidad'), provincia: $(prefijo + 'provincia').value, cp: valor(prefijo + 'cp'),
      telefono: valor(prefijo + 'telefono')
    };
  }

  function faltaEnPerfil(d) {
    if (!d.nombre) return 'Escribí tu nombre.';
    if (!d.apellido) return 'Escribí tu apellido.';
    if (!d.direccion) return 'Escribí tu dirección.';
    if (!d.localidad) return 'Escribí tu localidad.';
    if (!d.cp) return 'Escribí tu código postal.';
    return '';
  }

  /* ---------- Formularios ---------- */

  $('vista-ingresar').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var email = valor('in-email'), password = $('in-password').value;
    if (!email || !password) { aviso(form, 'Escribí tu email y tu contraseña.'); return; }
    var boton = form.querySelector('button[type="submit"]');
    boton.disabled = true;
    aviso(form, '');
    api('POST', '/api/cuenta/login', { email: email, password: password }).then(function (r) {
      form.reset();
      mostrarPerfil(r.cliente);
    }).catch(function (e) {
      if (e.datos && e.datos.pendiente) {
        estado.email = e.datos.email;
        $('in-password').value = '';
        ir('verificar', e.message);
      } else aviso(form, e.message);
    }).then(function () { boton.disabled = false; });
  });

  $('vista-registro').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var d = datosPerfil('re-');
    d.email = valor('re-email');
    d.password = $('re-password').value;
    d.password2 = $('re-password2').value;
    var falta = '';
    if (!d.nombre) falta = 'Escribí tu nombre.';
    else if (!d.apellido) falta = 'Escribí tu apellido.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) falta = 'Escribí un email válido.';
    else falta = validarClave(d.password, d.password2) || faltaEnPerfil(d);
    if (falta) { aviso(form, falta); return; }
    enviar(form, function () {
      return api('POST', '/api/cuenta/registro', d).then(function (r) {
        estado.email = r.email;
        $('re-password').value = '';
        $('re-password2').value = '';
        $('ve-codigo').value = '';
        ir('verificar');
      });
    });
  });

  $('vista-verificar').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var codigo = valor('ve-codigo').replace(/\D/g, '');
    if (codigo.length !== 6) { aviso(form, 'El código tiene 6 números.'); return; }
    enviar(form, function () {
      return api('POST', '/api/cuenta/verificar', { email: estado.email, codigo: codigo }).then(function (r) {
        $('vista-registro').reset();
        $('re-provincia').value = 'Salta';
        mostrarPerfil(r.cliente, '¡Listo! Tu cuenta quedó confirmada.');
      });
    });
  });

  $('ve-reenviar').addEventListener('click', function () {
    var form = $('vista-verificar');
    api('POST', '/api/cuenta/reenviar', { email: estado.email }).then(function () {
      aviso(form, 'Te enviamos un código nuevo.', true);
    }).catch(function (e) { aviso(form, e.message); });
  });

  $('vista-recuperar').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var email = valor('rc-email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { aviso(form, 'Escribí un email válido.'); return; }
    enviar(form, function () {
      return api('POST', '/api/cuenta/recuperar', { email: email }).then(function () {
        estado.email = email.toLowerCase();
        $('vista-restablecer').reset();
        ir('restablecer');
      });
    });
  });

  $('vista-restablecer').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var codigo = valor('rs-codigo').replace(/\D/g, '');
    var nueva = $('rs-nueva').value, nueva2 = $('rs-nueva2').value;
    var falta = codigo.length !== 6 ? 'El código tiene 6 números.' : validarClave(nueva, nueva2);
    if (falta) { aviso(form, falta); return; }
    enviar(form, function () {
      return api('POST', '/api/cuenta/restablecer', { email: estado.email, codigo: codigo, nueva: nueva, nueva2: nueva2 }).then(function (r) {
        form.reset();
        mostrarPerfil(r.cliente, 'Tu contraseña se cambió.');
      });
    });
  });

  $('form-datos').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var d = datosPerfil('pf-');
    var falta = faltaEnPerfil(d);
    if (falta) { aviso(form, falta); return; }
    enviar(form, function () {
      return api('PUT', '/api/cuenta/datos', d).then(function (r) {
        estado.cliente = r.cliente;
        $('pf-saludo').textContent = r.cliente.nombre;
        aviso(form, 'Datos guardados.', true);
      });
    });
  });

  $('form-clave').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.currentTarget;
    var actual = $('cl-actual').value, nueva = $('cl-nueva').value, nueva2 = $('cl-nueva2').value;
    var falta = !actual ? 'Escribí tu contraseña actual.' : validarClave(nueva, nueva2);
    if (falta) { aviso(form, falta); return; }
    enviar(form, function () {
      return api('PUT', '/api/cuenta/password', { actual: actual, nueva: nueva, nueva2: nueva2 }).then(function () {
        form.reset();
        aviso(form, 'Contraseña cambiada.', true);
      });
    });
  });

  $('pf-salir').addEventListener('click', function () {
    api('POST', '/api/cuenta/logout').catch(function () {}).then(function () {
      estado.cliente = null;
      ir('ingresar');
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-ir]'), function (b) {
    b.addEventListener('click', function () { ir(b.getAttribute('data-ir')); });
  });

  /* ---------- Inicio ---------- */

  api('GET', '/api/cuenta').then(function (r) {
    llenarProvincias(r.provincias || ['Salta']);
    if (r.cliente) mostrarPerfil(r.cliente);
    else ir(location.hash === '#crear' ? 'registro' : 'ingresar');
  }).catch(function () {
    $('cargando').textContent = 'No pudimos cargar la página. Actualizá para probar de nuevo.';
  });
})();
