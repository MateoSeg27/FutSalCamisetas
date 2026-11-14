'use strict';
/*
 * Cuentas de clientes: registro con verificacion de email por codigo,
 * inicio de sesion, datos personales y recuperacion de contraseña.
 */
const crypto = require('crypto');
const correo = require('./correo');

const PROVINCIAS = [
  'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes',
  'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro',
  'Salta', 'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
];

const SESION_MS = 30 * 24 * 60 * 60 * 1000;   // 30 dias
const CODIGO_MS = 15 * 60 * 1000;             // 15 minutos
const MAX_INTENTOS = 5;

function crear(d) {
  const { almacen, ErrorHttp, enviarJson, leerJson, texto, limitar, ipDe, hashPassword, verificarPassword,
    nuevoId, hashToken, leerCookies, esHttps, enProduccion } = d;
  const LIMITE = 20 * 1024;

  function publico(c) {
    return {
      id: c.id, email: c.email, nombre: c.nombre, apellido: c.apellido, direccion: c.direccion,
      localidad: c.localidad, provincia: c.provincia, cp: c.cp, telefono: c.telefono,
    };
  }

  function leerEmail(valor) {
    const email = texto(valor, 120, 'el email', true).toLowerCase();
    if (!/^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(email)) throw new ErrorHttp(400, 'El email no parece válido.');
    return email;
  }

  function leerPassword(data, campo, campoRepetir) {
    const pass = String(data[campo] || '');
    if (pass.length < 8) throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres.');
    if (pass.length > 100) throw new ErrorHttp(400, 'La contraseña es demasiado larga.');
    if (pass !== String(data[campoRepetir] || '')) throw new ErrorHttp(400, 'Las contraseñas no coinciden.');
    return pass;
  }

  function leerPerfil(data) {
    const provincia = texto(data.provincia, 60, 'la provincia', true);
    if (!PROVINCIAS.includes(provincia)) throw new ErrorHttp(400, 'Elegí una provincia de la lista.');
    const cp = texto(data.cp, 8, 'el código postal', true).toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(cp)) throw new ErrorHttp(400, 'El código postal no parece válido.');
    const telefono = texto(data.telefono, 30, 'el teléfono', false);
    if (telefono && !/^[0-9+() -]{6,30}$/.test(telefono)) throw new ErrorHttp(400, 'El teléfono no parece válido.');
    return {
      nombre: texto(data.nombre, 60, 'tu nombre', true),
      apellido: texto(data.apellido, 60, 'tu apellido', true),
      direccion: texto(data.direccion, 200, 'la dirección', true),
      localidad: texto(data.localidad, 80, 'la localidad', true),
      provincia, cp, telefono,
    };
  }

  /* ---- Codigos ---- */

  const hashCodigo = (clienteId, codigo) => crypto.createHash('sha256').update(clienteId + ':' + codigo).digest('hex');

  async function emitirCodigo(cliente, tipo) {
    if (enProduccion && !correo.configurado) {
      throw new ErrorHttp(503, 'El envío de emails todavía no está configurado. Avisale al negocio.');
    }
    if (!limitar('cod1:' + tipo + cliente.id, 1, 45 * 1000)) throw new ErrorHttp(429, 'Ya te enviamos un código. Esperá un minuto para pedir otro.');
    if (!limitar('codh:' + tipo + cliente.id, 6, 60 * 60 * 1000)) throw new ErrorHttp(429, 'Pediste demasiados códigos. Probá de nuevo en una hora.');
    const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    await almacen.guardarCodigo(cliente.id, tipo, hashCodigo(cliente.id, codigo), Date.now() + CODIGO_MS);
    try {
      await correo.enviarCodigo(cliente.email, cliente.nombre, codigo, tipo);
    } catch (e) {
      console.error('No se pudo enviar el email:', e.message);
      throw new ErrorHttp(502, 'No pudimos enviarte el email. Probá de nuevo en unos minutos.');
    }
  }

  async function comprobarCodigo(cliente, tipo, valor) {
    const codigo = String(valor || '').replace(/\D/g, '');
    const reg = await almacen.obtenerCodigo(cliente.id, tipo);
    if (!reg || reg.expira < Date.now()) throw new ErrorHttp(400, 'El código venció. Pedí uno nuevo.');
    if (reg.intentos >= MAX_INTENTOS) throw new ErrorHttp(400, 'Demasiados intentos. Pedí un código nuevo.');
    const a = Buffer.from(hashCodigo(cliente.id, codigo), 'hex');
    const b = Buffer.from(reg.codigoHash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      await almacen.sumarIntentoCodigo(cliente.id, tipo);
      throw new ErrorHttp(400, 'El código no es correcto.');
    }
    await almacen.borrarCodigo(cliente.id, tipo);
  }

  /* ---- Sesiones ---- */

  function cookie(req, token, maxAgeSeg) {
    return 'fs_cliente=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAgeSeg + (esHttps(req) ? '; Secure' : '');
  }

  async function clienteActual(req) {
    const token = leerCookies(req).fs_cliente;
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const sesion = await almacen.obtenerSesionCliente(hashToken(token));
    if (!sesion || sesion.expira < Date.now()) return null;
    return almacen.clientePorId(sesion.clienteId);
  }

  async function exigirCliente(req) {
    const c = await clienteActual(req);
    if (!c) throw new ErrorHttp(401, 'Tenés que ingresar a tu cuenta.');
    return c;
  }

  async function iniciarSesion(req, res, cliente) {
    almacen.limpiarSesionesClientes().catch(() => {});
    const token = crypto.randomBytes(32).toString('hex');
    await almacen.crearSesionCliente(hashToken(token), cliente.id, Date.now() + SESION_MS);
    enviarJson(res, 200, { cliente: publico(cliente) }, { 'Set-Cookie': cookie(req, token, SESION_MS / 1000) });
  }

  /* ---- Rutas: /api/cuenta/<accion> ---- */

  async function manejar(req, res, accion) {
    const metodo = req.method;
    const ip = ipDe(req);

    if (accion === '' && metodo === 'GET') {
      const c = await clienteActual(req);
      return enviarJson(res, 200, { cliente: c ? publico(c) : null, provincias: PROVINCIAS });
    }

    if (accion === 'registro' && metodo === 'POST') {
      if (!limitar('reg:' + ip, 10, 60 * 60 * 1000)) throw new ErrorHttp(429, 'Demasiados intentos. Probá de nuevo más tarde.');
      const data = await leerJson(req, LIMITE);
      const email = leerEmail(data.email);
      const perfil = leerPerfil(data);
      const pass = leerPassword(data, 'password', 'password2');
      let cliente = await almacen.clientePorEmail(email);
      if (cliente && cliente.verificado) {
        throw new ErrorHttp(400, 'Ya existe una cuenta con ese email. Ingresá o recuperá tu contraseña.');
      }
      if (cliente) {
        // registro anterior sin confirmar: se actualiza con los datos nuevos
        await almacen.actualizarCliente(cliente.id, Object.assign({}, perfil, hashPassword(pass)));
        cliente = Object.assign(cliente, perfil);
      } else {
        cliente = Object.assign({ id: nuevoId(), email, verificado: false, creado: Date.now() }, perfil, hashPassword(pass));
        await almacen.crearCliente(cliente);
      }
      await emitirCodigo(cliente, 'verificacion');
      return enviarJson(res, 201, { ok: true, email });
    }

    if (accion === 'verificar' && metodo === 'POST') {
      if (!limitar('ver:' + ip, 30, 15 * 60 * 1000)) throw new ErrorHttp(429, 'Demasiados intentos. Esperá unos minutos.');
      const data = await leerJson(req, LIMITE);
      const cliente = await almacen.clientePorEmail(leerEmail(data.email));
      if (!cliente) throw new ErrorHttp(400, 'El código no es correcto.');
      if (!cliente.verificado) {
        await comprobarCodigo(cliente, 'verificacion', data.codigo);
        await almacen.actualizarCliente(cliente.id, { verificado: true });
        cliente.verificado = true;
        return iniciarSesion(req, res, cliente);
      }
      throw new ErrorHttp(400, 'Esta cuenta ya está confirmada. Ingresá con tu contraseña.');
    }

    if (accion === 'reenviar' && metodo === 'POST') {
      const data = await leerJson(req, LIMITE);
      const cliente = await almacen.clientePorEmail(leerEmail(data.email));
      if (cliente && !cliente.verificado) await emitirCodigo(cliente, 'verificacion');
      return enviarJson(res, 200, { ok: true });
    }

    if (accion === 'login' && metodo === 'POST') {
      if (!limitar('clogin:' + ip, 10, 15 * 60 * 1000)) throw new ErrorHttp(429, 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.');
      const data = await leerJson(req, LIMITE);
      const email = String(data.email || '').trim().toLowerCase().slice(0, 120);
      const cliente = email ? await almacen.clientePorEmail(email) : null;
      const ok = cliente ? verificarPassword(data.password || '', cliente) : (hashPassword('x'), false);
      if (!ok) throw new ErrorHttp(401, 'Email o contraseña incorrectos.');
      if (!cliente.verificado) {
        try { await emitirCodigo(cliente, 'verificacion'); } catch (e) { if (!(e instanceof ErrorHttp) || e.status !== 429) throw e; }
        return enviarJson(res, 403, { error: 'Falta confirmar tu email. Te enviamos un código.', pendiente: true, email: cliente.email });
      }
      return iniciarSesion(req, res, cliente);
    }

    if (accion === 'logout' && metodo === 'POST') {
      const token = leerCookies(req).fs_cliente;
      if (token) await almacen.borrarSesionCliente(hashToken(token));
      return enviarJson(res, 200, { ok: true }, { 'Set-Cookie': cookie(req, '', 0) });
    }

    if (accion === 'recuperar' && metodo === 'POST') {
      if (!limitar('rec:' + ip, 6, 60 * 60 * 1000)) throw new ErrorHttp(429, 'Demasiados intentos. Probá de nuevo más tarde.');
      const data = await leerJson(req, LIMITE);
      const cliente = await almacen.clientePorEmail(leerEmail(data.email));
      // la respuesta es la misma exista o no la cuenta
      if (cliente) {
        try { await emitirCodigo(cliente, 'recuperacion'); } catch (e) {
          if (e instanceof ErrorHttp && (e.status === 503 || e.status === 502)) throw e;
        }
      }
      return enviarJson(res, 200, { ok: true });
    }

    if (accion === 'restablecer' && metodo === 'POST') {
      if (!limitar('ver:' + ip, 30, 15 * 60 * 1000)) throw new ErrorHttp(429, 'Demasiados intentos. Esperá unos minutos.');
      const data = await leerJson(req, LIMITE);
      const email = leerEmail(data.email);
      const pass = leerPassword(data, 'nueva', 'nueva2');
      const cliente = await almacen.clientePorEmail(email);
      if (!cliente) throw new ErrorHttp(400, 'El código no es correcto.');
      await comprobarCodigo(cliente, 'recuperacion', data.codigo);
      // el codigo llego a su email, asi que tambien queda confirmado
      await almacen.actualizarCliente(cliente.id, Object.assign({ verificado: true }, hashPassword(pass)));
      await almacen.borrarSesionesDeCliente(cliente.id);
      cliente.verificado = true;
      return iniciarSesion(req, res, cliente);
    }

    if (accion === 'datos' && metodo === 'PUT') {
      const cliente = await exigirCliente(req);
      const perfil = leerPerfil(await leerJson(req, LIMITE));
      await almacen.actualizarCliente(cliente.id, perfil);
      return enviarJson(res, 200, { cliente: publico(Object.assign(cliente, perfil)) });
    }

    if (accion === 'password' && metodo === 'PUT') {
      const cliente = await exigirCliente(req);
      if (!limitar('cpass:' + cliente.id, 10, 15 * 60 * 1000)) throw new ErrorHttp(429, 'Demasiados intentos. Esperá unos minutos.');
      const data = await leerJson(req, LIMITE);
      if (!verificarPassword(data.actual || '', cliente)) throw new ErrorHttp(400, 'La contraseña actual no es correcta.');
      const pass = leerPassword(data, 'nueva', 'nueva2');
      await almacen.actualizarCliente(cliente.id, hashPassword(pass));
      await almacen.borrarSesionesDeCliente(cliente.id, hashToken(leerCookies(req).fs_cliente));
      return enviarJson(res, 200, { ok: true });
    }

    throw new ErrorHttp(404, 'No encontrado.');
  }

  return { manejar, clienteActual, publico };
}

module.exports = { crear };
