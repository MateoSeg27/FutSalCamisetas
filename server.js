'use strict';
/*
 * FutSal Camisetas - servidor web
 *
 * Guarda los datos en Supabase si estan definidas SUPABASE_URL y SUPABASE_SECRET_KEY
 * (asi funciona en Render). Si no, usa un archivo local en la carpeta data/ (para probar).
 *
 * Iniciar con:  node server.js   (o doble clic en iniciar.bat)
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'data');
const CRED_FILE = path.join(DATA_DIR, 'credenciales-iniciales.txt');
const DETRAS_DE_PROXY = !!(process.env.RENDER || process.env.TRUST_PROXY);

const SESSION_MS = 7 * 24 * 60 * 60 * 1000;   // 7 dias
const MAX_JSON_BYTES = 100 * 1024;            // 100 KB para datos normales
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;     // 8 MB para subir imagenes
const MAX_IMAGENES = 5;                       // fotos por producto
const MAX_CARRUSEL = 8;                       // imagenes del carrusel de la portada

/* ------------------------------------------------------------------ */
/* Almacenamiento                                                      */
/* ------------------------------------------------------------------ */

const almacen = (process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY)
  ? require('./almacen/supabase').crear(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY)
  : require('./almacen/archivo').crear(DATA_DIR);

if (DETRAS_DE_PROXY && almacen.tipo === 'archivo' && !process.env.PERMITIR_ARCHIVO_LOCAL) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY. Cargalas en Render -> Environment.');
  process.exit(1);
}

const CONFIG_INICIAL = {
  whatsapp: '',
  instagram: '',
  direccion: 'Salta Capital, Argentina',
  horario: 'Lunes a sábado de 9 a 13 y de 17 a 21 hs',
  heroTitulo: 'Camisetas de fútbol y ropa deportiva',
  heroTexto: 'Elegí tu camiseta, tu talle y hacé el pedido por WhatsApp. Envíos a todo el país y retiro en Salta Capital.',
  envios: 'Retiro en Salta Capital o envío a todo el país (a coordinar por WhatsApp).',
};

function nuevoId() {
  return crypto.randomBytes(8).toString('hex');
}

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}

function verificarPassword(password, usuario) {
  const calculado = crypto.scryptSync(String(password), usuario.salt, 64);
  const guardado = Buffer.from(usuario.hash, 'hex');
  return calculado.length === guardado.length && crypto.timingSafeEqual(calculado, guardado);
}

function passwordAleatoria() {
  const letras = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) out += letras[bytes[i] % letras.length];
  return out;
}

function productosDeEjemplo() {
  const ahora = Date.now();
  const talles = (stocks) => ['S', 'M', 'L', 'XL', 'XXL'].map((talle, i) => ({ talle, stock: stocks[i] }));
  const lista = [
    ['Camiseta Rayada Gris y Blanca', 'Camisetas', 45000, 'ej-rayada.svg', [3, 5, 4, 2, 1], true,
      'Camiseta de ejemplo a rayas grises y blancas. Tela liviana y respirable, ideal para jugar o para todos los días.'],
    ['Camiseta Azul Marino Franja Blanca', 'Camisetas', 42000, 'ej-azul-franja.svg', [2, 4, 4, 3, 0], true,
      'Camiseta de ejemplo azul marino con franja horizontal blanca. Calce regular.'],
    ['Camiseta Blanca Banda Negra', 'Camisetas', 42000, 'ej-blanca-banda.svg', [1, 3, 5, 2, 1], true,
      'Camiseta de ejemplo blanca con banda cruzada negra. Tela con secado rápido.'],
    ['Camiseta Negra Edición Especial', 'Camisetas', 48000, 'ej-negra.svg', [2, 2, 3, 2, 2], true,
      'Camiseta de ejemplo negra con detalles en gris. Edición especial.'],
    ['Camiseta Roja Clásica', 'Camisetas', 39000, 'ej-roja.svg', [0, 3, 3, 1, 0], false,
      'Camiseta de ejemplo roja con mangas blancas.'],
    ['Camiseta Verde y Blanca', 'Camisetas', 39000, 'ej-verde.svg', [2, 2, 2, 2, 0], false,
      'Camiseta de ejemplo mitad verde, mitad blanca.'],
    ['Camiseta de Entrenamiento Violeta', 'Entrenamiento', 35000, 'ej-violeta.svg', [3, 3, 3, 3, 1], false,
      'Remera de entrenamiento de ejemplo. Liviana y cómoda.'],
    ['Short Negro', 'Shorts', 22000, 'ej-short-negro.svg', [4, 4, 4, 2, 1], false,
      'Short deportivo de ejemplo, con elástico y cordón en la cintura.'],
    ['Short Blanco', 'Shorts', 22000, 'ej-short-blanco.svg', [2, 3, 3, 0, 0], false,
      'Short deportivo de ejemplo, color blanco.'],
  ];
  return lista.map((p, i) => ({
    id: nuevoId(), nombre: p[0], categoria: p[1], precio: p[2], imagen: '/img/productos/' + p[3], imagenes: ['/img/productos/' + p[3]],
    talles: talles(p[4]), destacado: p[5], activo: true, descripcion: p[6], creado: ahora - i * 1000,
  }));
}

// Crea las categorias que usan los productos y todavia no existen en la lista
async function sincronizarCategorias() {
  const productos = await almacen.listarProductos(false);
  const vistos = new Set();
  for (const p of productos.slice().sort((a, b) => b.creado - a.creado)) {
    if (vistos.has(p.categoria)) continue;
    vistos.add(p.categoria);
    await asegurarCategoria(p.categoria);
  }
}

// Primera vez: crea usuarios, configuracion y productos de ejemplo
async function prepararDatos() {
  await almacen.iniciar();
  if (!(await almacen.obtenerConfig())) await almacen.guardarConfig(CONFIG_INICIAL);
  if ((await almacen.contarUsuarios()) > 0) return sincronizarCategorias();

  const passAdmin = process.env.ADMIN_PASSWORD || passwordAleatoria();
  const passDueno = process.env.OWNER_PASSWORD || passwordAleatoria();
  await almacen.crearUsuario(Object.assign({ id: nuevoId(), usuario: 'admin', nombre: 'Administrador', rol: 'admin' }, hashPassword(passAdmin)));
  await almacen.crearUsuario(Object.assign({ id: nuevoId(), usuario: 'dueno', nombre: 'Dueño', rol: 'dueno' }, hashPassword(passDueno)));
  if ((await almacen.listarProductos(false)).length === 0) {
    for (const p of productosDeEjemplo()) await almacen.guardarProducto(p);
  }
  await sincronizarCategorias();

  const texto = [
    'FutSal Camisetas - credenciales iniciales',
    '=========================================',
    '',
    'ADMINISTRADOR  usuario: admin   contraseña: ' + passAdmin,
    'DUEÑO          usuario: dueno   contraseña: ' + passDueno,
    '',
    'Cámbienlas desde el panel (pestaña "Mi cuenta") y borren este archivo.',
    '',
  ].join('\r\n');
  if (almacen.tipo === 'archivo') {
    try { fs.writeFileSync(CRED_FILE, '﻿' + texto, 'utf8'); } catch (e) { /* solo informativo */ }
  }
  console.log('\n' + texto.replace(/\r/g, ''));
}

/* ------------------------------------------------------------------ */
/* Utilidades HTTP                                                     */
/* ------------------------------------------------------------------ */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const CABECERAS_SEGURIDAD = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data: blob:" + (almacen.origenImagenes ? ' ' + almacen.origenImagenes : '') +
    "; style-src 'self' 'unsafe-inline'; script-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
};
if (DETRAS_DE_PROXY) CABECERAS_SEGURIDAD['Strict-Transport-Security'] = 'max-age=31536000';

class ErrorHttp extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

function enviarJson(res, status, data, extra) {
  const cuerpo = JSON.stringify(data);
  res.writeHead(status, Object.assign({
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(cuerpo),
    'Cache-Control': 'no-store',
  }, CABECERAS_SEGURIDAD, extra || {}));
  res.end(cuerpo);
}

function leerJson(req, limite) {
  return new Promise((resolve, reject) => {
    const tipo = String(req.headers['content-type'] || '');
    if (!tipo.toLowerCase().startsWith('application/json')) {
      req.resume();
      return reject(new ErrorHttp(415, 'Formato no admitido.'));
    }
    const partes = [];
    let total = 0;
    let cancelado = false;
    req.on('data', (chunk) => {
      if (cancelado) return;
      total += chunk.length;
      if (total > limite) {
        cancelado = true;
        reject(new ErrorHttp(413, 'El contenido es demasiado grande.'));
        return;
      }
      partes.push(chunk);
    });
    req.on('end', () => {
      if (cancelado) return;
      try {
        const texto = Buffer.concat(partes).toString('utf8');
        const data = texto ? JSON.parse(texto) : {};
        if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('no es objeto');
        resolve(data);
      } catch (e) {
        reject(new ErrorHttp(400, 'Datos inválidos.'));
      }
    });
    req.on('error', () => reject(new ErrorHttp(400, 'Error al leer los datos.')));
  });
}

function leerCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach((par) => {
    const i = par.indexOf('=');
    if (i > 0) out[par.slice(0, i).trim()] = par.slice(i + 1).trim();
  });
  return out;
}

function ipDe(req) {
  if (DETRAS_DE_PROXY) {
    const cf = req.headers['cf-connecting-ip'];
    if (cf) return String(cf);
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress || 'desconocida';
}

function esHttps(req) {
  return req.headers['x-forwarded-proto'] === 'https';
}

/* Limite simple de intentos por IP (en memoria) */
const intentos = new Map();
function limitar(clave, maximo, ventanaMs) {
  const ahora = Date.now();
  const lista = (intentos.get(clave) || []).filter((t) => ahora - t < ventanaMs);
  if (lista.length >= maximo) {
    intentos.set(clave, lista);
    return false;
  }
  lista.push(ahora);
  intentos.set(clave, lista);
  return true;
}
setInterval(() => {
  const ahora = Date.now();
  for (const [k, lista] of intentos) {
    if (!lista.some((t) => ahora - t < 60 * 60 * 1000)) intentos.delete(k);
  }
}, 10 * 60 * 1000).unref();

/* ------------------------------------------------------------------ */
/* Sesiones                                                            */
/* ------------------------------------------------------------------ */

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function usuarioActual(req) {
  const token = leerCookies(req).fs_sesion;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const sesion = await almacen.obtenerSesion(hashToken(token));
  if (!sesion || sesion.expira < Date.now()) return null;
  return almacen.usuarioPorId(sesion.usuarioId);
}

function cookieSesion(req, token, maxAgeSeg) {
  const seguro = esHttps(req) ? '; Secure' : '';
  return 'fs_sesion=' + token + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + maxAgeSeg + seguro;
}

async function exigirSesion(req) {
  const u = await usuarioActual(req);
  if (!u) throw new ErrorHttp(401, 'Tenés que iniciar sesión.');
  return u;
}

async function exigirAdmin(req) {
  const u = await exigirSesion(req);
  if (u.rol !== 'admin') throw new ErrorHttp(403, 'Solo el administrador puede hacer esto.');
  return u;
}

function usuarioPublico(u) {
  return { id: u.id, usuario: u.usuario, nombre: u.nombre, rol: u.rol };
}

/* ------------------------------------------------------------------ */
/* Validaciones                                                        */
/* ------------------------------------------------------------------ */

function texto(valor, max, campo, obligatorio) {
  const t = (valor === undefined || valor === null) ? '' : String(valor).trim();
  if (obligatorio && !t) throw new ErrorHttp(400, 'Falta completar: ' + campo + '.');
  if (t.length > max) throw new ErrorHttp(400, campo + ' es demasiado largo (máximo ' + max + ' caracteres).');
  return t;
}

function imagenValida(imagen) {
  if (!imagen) return true;
  if (imagen.includes('..')) return false;
  if (/^\/img\/[A-Za-z0-9._\/-]+$/.test(imagen)) return true;
  if (imagen.startsWith(almacen.prefijoImagenes)) {
    return /^[A-Za-z0-9._-]+$/.test(imagen.slice(almacen.prefijoImagenes.length));
  }
  return false;
}

function validarProducto(data) {
  const nombre = texto(data.nombre, 120, 'el nombre', true);
  const categoria = texto(data.categoria, 40, 'la categoría', true);
  const descripcion = texto(data.descripcion, 2000, 'la descripción', false);
  const precio = Number(data.precio);
  if (!Number.isFinite(precio) || precio < 0 || precio > 1e9) throw new ErrorHttp(400, 'El precio no es válido.');

  let imagenes = data.imagenes;
  if (imagenes === undefined) imagenes = data.imagen ? [data.imagen] : [];
  if (!Array.isArray(imagenes)) throw new ErrorHttp(400, 'Las imágenes no son válidas.');
  if (imagenes.length > MAX_IMAGENES) throw new ErrorHttp(400, 'Máximo ' + MAX_IMAGENES + ' fotos por producto.');
  imagenes = imagenes.map((i) => texto(i, 300, 'la imagen', true));
  if (!imagenes.every(imagenValida)) throw new ErrorHttp(400, 'Alguna de las imágenes no es válida.');
  if (new Set(imagenes).size !== imagenes.length) throw new ErrorHttp(400, 'Hay una foto repetida.');

  if (!Array.isArray(data.talles)) throw new ErrorHttp(400, 'Los talles no son válidos.');
  if (data.talles.length > 30) throw new ErrorHttp(400, 'Demasiados talles (máximo 30).');
  const vistos = new Set();
  const talles = data.talles.map((t) => {
    const talle = texto(t && t.talle, 12, 'el talle', true).toUpperCase();
    const stock = Math.floor(Number(t && t.stock));
    if (!Number.isFinite(stock) || stock < 0 || stock > 99999) throw new ErrorHttp(400, 'El stock del talle ' + talle + ' no es válido.');
    if (vistos.has(talle)) throw new ErrorHttp(400, 'El talle ' + talle + ' está repetido.');
    vistos.add(talle);
    return { talle, stock };
  });

  return {
    nombre, categoria, descripcion,
    precio: Math.round(precio),
    imagen: imagenes[0] || '',
    imagenes,
    talles,
    destacado: !!data.destacado,
    activo: data.activo === undefined ? true : !!data.activo,
  };
}

// Devuelve el nombre de la categoria tal como esta guardada (la crea si no existe)
async function asegurarCategoria(nombre) {
  const existente = await almacen.categoriaPorNombre(nombre);
  if (existente) return existente.nombre;
  const lista = await almacen.listarCategorias();
  const orden = lista.reduce((m, c) => Math.max(m, c.orden), -1) + 1;
  await almacen.crearCategoria({ id: nuevoId(), nombre, orden });
  return nombre;
}

function nombreCategoria(valor) {
  const nombre = texto(valor, 40, 'el nombre de la categoría', true).replace(/\s+/g, ' ');
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

// Borra del almacenamiento las fotos que dejo de usar un producto
// (cada foto subida pertenece a un solo producto; las de ejemplo en /img/ no se tocan)
async function borrarImagenesQuitadas(anteriores, actuales) {
  const quedan = new Set(actuales || []);
  for (const url of anteriores || []) {
    if (!url || url.startsWith('/img/') || quedan.has(url)) continue;
    try { await almacen.borrarImagen(url); } catch (e) { console.error('No se pudo borrar la imagen:', e.message); }
  }
}

function tipoDeImagen(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { ext: '.png', tipo: 'image/png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: '.jpg', tipo: 'image/jpeg' };
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: '.webp', tipo: 'image/webp' };
  return null;
}

const cuentas = require('./cuentas').crear({
  almacen, ErrorHttp, enviarJson, leerJson, texto, limitar, ipDe, hashPassword, verificarPassword,
  nuevoId, hashToken, leerCookies, esHttps, enProduccion: DETRAS_DE_PROXY,
});

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

async function manejarApi(req, res, ruta) {
  const metodo = req.method;
  const partes = ruta.split('/').filter(Boolean); // ['api', 'productos', ':id']
  const recurso = partes[1];
  const id = partes[2];
  if (recurso === 'cuenta') return cuentas.manejar(req, res, partes[2] || '');
  if (id && !/^[a-f0-9]{16}$/.test(id)) throw new ErrorHttp(404, 'No encontrado.');

  /* ---- Publico ---- */

  if (recurso === 'salud' && metodo === 'GET') {
    return enviarJson(res, 200, { ok: true });
  }

  if (recurso === 'config' && metodo === 'GET' && !id) {
    return enviarJson(res, 200, (await almacen.obtenerConfig()) || CONFIG_INICIAL);
  }

  if (recurso === 'categorias' && metodo === 'GET' && !id) {
    return enviarJson(res, 200, await almacen.listarCategorias());
  }

  if (recurso === 'productos' && metodo === 'GET' && !id) {
    const u = await usuarioActual(req);
    return enviarJson(res, 200, await almacen.listarProductos(!u));
  }

  if (recurso === 'mensajes' && metodo === 'POST' && !id) {
    if (!limitar('msg:' + ipDe(req), 5, 10 * 60 * 1000)) {
      throw new ErrorHttp(429, 'Enviaste varios mensajes seguidos. Probá de nuevo en unos minutos.');
    }
    const data = await leerJson(req, MAX_JSON_BYTES);
    if (data.sitio) return enviarJson(res, 201, { ok: true }); // trampa anti-spam: campo oculto
    await almacen.crearMensaje({
      id: nuevoId(),
      nombre: texto(data.nombre, 80, 'tu nombre', true),
      contacto: texto(data.contacto, 120, 'tu teléfono o email', true),
      mensaje: texto(data.mensaje, 2000, 'el mensaje', true),
      fecha: Date.now(),
      leido: false,
    });
    return enviarJson(res, 201, { ok: true });
  }

  /* ---- Sesion ---- */

  if (recurso === 'login' && metodo === 'POST') {
    if (!limitar('login:' + ipDe(req), 10, 15 * 60 * 1000)) {
      throw new ErrorHttp(429, 'Demasiados intentos. Esperá 15 minutos y probá de nuevo.');
    }
    const data = await leerJson(req, MAX_JSON_BYTES);
    const nombreUsuario = String(data.usuario || '').trim().toLowerCase().slice(0, 60);
    const u = nombreUsuario ? await almacen.usuarioPorNombre(nombreUsuario) : null;
    const ok = u ? verificarPassword(data.password || '', u) : (hashPassword('x'), false);
    if (!ok) throw new ErrorHttp(401, 'Usuario o contraseña incorrectos.');
    almacen.limpiarSesiones().catch(() => {});
    const token = crypto.randomBytes(32).toString('hex');
    await almacen.crearSesion(hashToken(token), u.id, Date.now() + SESSION_MS);
    return enviarJson(res, 200, usuarioPublico(u), { 'Set-Cookie': cookieSesion(req, token, SESSION_MS / 1000) });
  }

  if (recurso === 'logout' && metodo === 'POST') {
    const token = leerCookies(req).fs_sesion;
    if (token) await almacen.borrarSesion(hashToken(token));
    return enviarJson(res, 200, { ok: true }, { 'Set-Cookie': cookieSesion(req, '', 0) });
  }

  if (recurso === 'yo' && metodo === 'GET') {
    const u = await usuarioActual(req);
    if (!u) throw new ErrorHttp(401, 'Sin sesión.');
    return enviarJson(res, 200, usuarioPublico(u));
  }

  /* ---- Panel (requiere sesion) ---- */

  if (recurso === 'password' && metodo === 'PUT') {
    const u = await exigirSesion(req);
    const data = await leerJson(req, MAX_JSON_BYTES);
    if (!verificarPassword(data.actual || '', u)) throw new ErrorHttp(400, 'La contraseña actual no es correcta.');
    const nueva = String(data.nueva || '');
    if (nueva.length < 8 || nueva.length > 100) throw new ErrorHttp(400, 'La contraseña nueva debe tener al menos 8 caracteres.');
    await almacen.actualizarUsuario(u.id, hashPassword(nueva));
    await almacen.borrarSesionesDeUsuario(u.id, hashToken(leerCookies(req).fs_sesion));
    return enviarJson(res, 200, { ok: true });
  }

  if (recurso === 'productos') {
    await exigirSesion(req);
    if (metodo === 'POST' && !id) {
      const p = validarProducto(await leerJson(req, MAX_JSON_BYTES));
      p.categoria = await asegurarCategoria(nombreCategoria(p.categoria));
      p.id = nuevoId();
      p.creado = Date.now();
      await almacen.guardarProducto(p);
      return enviarJson(res, 201, p);
    }
    const anterior = id ? await almacen.obtenerProducto(id) : null;
    if (id && !anterior) throw new ErrorHttp(404, 'El producto no existe.');
    if (metodo === 'PUT' && id) {
      const nuevo = Object.assign(validarProducto(await leerJson(req, MAX_JSON_BYTES)), { id: anterior.id, creado: anterior.creado });
      nuevo.categoria = await asegurarCategoria(nombreCategoria(nuevo.categoria));
      await almacen.guardarProducto(nuevo);
      await borrarImagenesQuitadas(anterior.imagenes, nuevo.imagenes);
      return enviarJson(res, 200, nuevo);
    }
    if (metodo === 'DELETE' && id) {
      await almacen.borrarProducto(id);
      await borrarImagenesQuitadas(anterior.imagenes, []);
      return enviarJson(res, 200, { ok: true });
    }
  }

  if (recurso === 'categorias') {
    await exigirSesion(req);
    if (metodo === 'POST' && !id) {
      const nombre = nombreCategoria((await leerJson(req, MAX_JSON_BYTES)).nombre);
      if (await almacen.categoriaPorNombre(nombre)) throw new ErrorHttp(400, 'Ya existe la categoría "' + nombre + '".');
      await asegurarCategoria(nombre);
      return enviarJson(res, 201, await almacen.categoriaPorNombre(nombre));
    }
    const cat = id ? await almacen.categoriaPorId(id) : null;
    if (id && !cat) throw new ErrorHttp(404, 'La categoría no existe.');
    if (metodo === 'PUT' && id) {
      const data = await leerJson(req, MAX_JSON_BYTES);
      if (data.nombre !== undefined) {
        const nombre = nombreCategoria(data.nombre);
        const otra = await almacen.categoriaPorNombre(nombre);
        if (otra && otra.id !== cat.id) throw new ErrorHttp(400, 'Ya existe la categoría "' + otra.nombre + '".');
        if (nombre !== cat.nombre) {
          await almacen.actualizarCategoria(cat.id, { nombre });
          await almacen.renombrarCategoriaEnProductos(cat.nombre, nombre);
        }
      }
      if (data.mover === 'arriba' || data.mover === 'abajo') {
        const lista = await almacen.listarCategorias();
        const i = lista.findIndex((c) => c.id === cat.id);
        const j = data.mover === 'arriba' ? i - 1 : i + 1;
        if (j >= 0 && j < lista.length) {
          const [item] = lista.splice(i, 1);
          lista.splice(j, 0, item);
          for (let k = 0; k < lista.length; k++) {
            if (lista[k].orden !== k) await almacen.actualizarCategoria(lista[k].id, { orden: k });
          }
        }
      }
      return enviarJson(res, 200, await almacen.listarCategorias());
    }
    if (metodo === 'DELETE' && id) {
      const usados = await almacen.contarProductosEnCategoria(cat.nombre);
      if (usados > 0) {
        throw new ErrorHttp(400, 'No se puede borrar: "' + cat.nombre + '" tiene ' + usados +
          (usados === 1 ? ' producto' : ' productos') + '. Pasalos a otra categoría primero.');
      }
      await almacen.borrarCategoria(cat.id);
      return enviarJson(res, 200, { ok: true });
    }
  }

  if (recurso === 'imagenes' && metodo === 'POST' && !id) {
    await exigirSesion(req);
    const data = await leerJson(req, MAX_UPLOAD_BYTES);
    const base64 = String(data.datos || '').replace(/^data:[^;,]+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');
    if (!buf.length) throw new ErrorHttp(400, 'La imagen está vacía.');
    const info = tipoDeImagen(buf);
    if (!info) throw new ErrorHttp(400, 'Solo se aceptan imágenes JPG, PNG o WEBP.');
    const nombre = Date.now().toString(36) + '-' + crypto.randomBytes(6).toString('hex') + info.ext;
    const url = await almacen.subirImagen(nombre, buf, info.tipo);
    return enviarJson(res, 201, { url });
  }

  if (recurso === 'mensajes') {
    await exigirSesion(req);
    if (metodo === 'GET' && !id) return enviarJson(res, 200, await almacen.listarMensajes());
    if (id && !(await almacen.obtenerMensaje(id))) throw new ErrorHttp(404, 'El mensaje no existe.');
    if (metodo === 'PUT' && id) {
      const data = await leerJson(req, MAX_JSON_BYTES);
      await almacen.marcarMensaje(id, !!data.leido);
      return enviarJson(res, 200, { ok: true });
    }
    if (metodo === 'DELETE' && id) {
      await almacen.borrarMensaje(id);
      return enviarJson(res, 200, { ok: true });
    }
  }

  if (recurso === 'config' && metodo === 'PUT' && !id) {
    await exigirSesion(req);
    const data = await leerJson(req, MAX_JSON_BYTES);
    const whatsapp = texto(data.whatsapp, 30, 'el WhatsApp', false).replace(/\D/g, '');
    if (whatsapp && (whatsapp.length < 8 || whatsapp.length > 15)) {
      throw new ErrorHttp(400, 'El número de WhatsApp no parece válido. Ejemplo: 5493871234567');
    }
    const config = {
      whatsapp,
      instagram: texto(data.instagram, 60, 'el Instagram', false).replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[^A-Za-z0-9._]/g, ''),
      direccion: texto(data.direccion, 200, 'la dirección', false),
      horario: texto(data.horario, 200, 'el horario', false),
      heroTitulo: texto(data.heroTitulo, 120, 'el título', false),
      heroTexto: texto(data.heroTexto, 400, 'el texto de portada', false),
      envios: texto(data.envios, 400, 'el texto de envíos', false),
    };
    // los carruseles se guardan aparte (PUT /api/carrusel): aca se conservan
    const anterior = (await almacen.obtenerConfig()) || {};
    config.carrusel = Array.isArray(anterior.carrusel) ? anterior.carrusel : [];
    config.carruselMovil = Array.isArray(anterior.carruselMovil) ? anterior.carruselMovil : [];
    await almacen.guardarConfig(config);
    return enviarJson(res, 200, config);
  }

  // Carrusel de la portada: una lista para computadoras y otra para celulares
  if (recurso === 'carrusel' && metodo === 'PUT' && !id) {
    await exigirSesion(req);
    const data = await leerJson(req, MAX_JSON_BYTES);
    const campo = data.tipo === 'movil' ? 'carruselMovil' : 'carrusel';
    if (!Array.isArray(data.imagenes)) throw new ErrorHttp(400, 'Las imágenes no son válidas.');
    if (data.imagenes.length > MAX_CARRUSEL) throw new ErrorHttp(400, 'Máximo ' + MAX_CARRUSEL + ' imágenes en cada carrusel.');
    const imagenes = data.imagenes.map((i) => texto(i, 300, 'la imagen', true));
    if (!imagenes.every((i) => i.startsWith(almacen.prefijoImagenes) && imagenValida(i))) {
      throw new ErrorHttp(400, 'Alguna de las imágenes no es válida.');
    }
    if (new Set(imagenes).size !== imagenes.length) throw new ErrorHttp(400, 'Hay una imagen repetida.');
    const config = Object.assign({}, CONFIG_INICIAL, (await almacen.obtenerConfig()) || {});
    const anteriores = Array.isArray(config[campo]) ? config[campo] : [];
    const otraLista = campo === 'carrusel' ? config.carruselMovil : config.carrusel;
    if (imagenes.some((i) => (otraLista || []).includes(i))) throw new ErrorHttp(400, 'Esa imagen ya está en el otro carrusel.');
    config[campo] = imagenes;
    await almacen.guardarConfig(config);
    await borrarImagenesQuitadas(anteriores, imagenes);
    return enviarJson(res, 200, { tipo: campo === 'carruselMovil' ? 'movil' : 'pc', imagenes });
  }

  if (recurso === 'clientes' && metodo === 'GET' && !id) {
    await exigirSesion(req);
    return enviarJson(res, 200, await almacen.listarClientes());
  }

  if (recurso === 'usuarios') {
    const yo = await exigirAdmin(req);
    if (metodo === 'GET' && !id) return enviarJson(res, 200, (await almacen.listarUsuarios()).map(usuarioPublico));
    if (metodo === 'POST' && !id) {
      const data = await leerJson(req, MAX_JSON_BYTES);
      const usuario = texto(data.usuario, 30, 'el usuario', true).toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) throw new ErrorHttp(400, 'El usuario debe tener entre 3 y 30 letras o números, sin espacios.');
      if (await almacen.usuarioPorNombre(usuario)) throw new ErrorHttp(400, 'Ya existe un usuario con ese nombre.');
      const password = String(data.password || '');
      if (password.length < 8 || password.length > 100) throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres.');
      const nuevo = Object.assign({
        id: nuevoId(),
        usuario,
        nombre: texto(data.nombre, 60, 'el nombre', false) || usuario,
        rol: data.rol === 'admin' ? 'admin' : 'dueno',
      }, hashPassword(password));
      await almacen.crearUsuario(nuevo);
      return enviarJson(res, 201, usuarioPublico(nuevo));
    }
    const u = id ? await almacen.usuarioPorId(id) : null;
    if (id && !u) throw new ErrorHttp(404, 'El usuario no existe.');
    if (metodo === 'PUT' && id) {
      const data = await leerJson(req, MAX_JSON_BYTES);
      const password = String(data.password || '');
      if (password.length < 8 || password.length > 100) throw new ErrorHttp(400, 'La contraseña debe tener al menos 8 caracteres.');
      await almacen.actualizarUsuario(u.id, hashPassword(password));
      if (u.id !== yo.id) await almacen.borrarSesionesDeUsuario(u.id);
      return enviarJson(res, 200, { ok: true });
    }
    if (metodo === 'DELETE' && id) {
      if (u.id === yo.id) throw new ErrorHttp(400, 'No podés borrar tu propio usuario.');
      await almacen.borrarSesionesDeUsuario(u.id);
      await almacen.borrarUsuario(u.id);
      return enviarJson(res, 200, { ok: true });
    }
  }

  throw new ErrorHttp(404, 'No encontrado.');
}

/* ------------------------------------------------------------------ */
/* Archivos estaticos                                                  */
/* ------------------------------------------------------------------ */

function servirArchivo(req, res, base, relativo, cache) {
  let decodificado;
  try { decodificado = decodeURIComponent(relativo); } catch (e) { return noEncontrado(res); }
  if (decodificado.includes('\0')) return noEncontrado(res);
  const archivo = path.normalize(path.join(base, decodificado));
  if (archivo !== base && !archivo.startsWith(base + path.sep)) return noEncontrado(res);
  fs.stat(archivo, (err, st) => {
    if (err || !st.isFile()) return noEncontrado(res);
    const ext = path.extname(archivo).toLowerCase();
    res.writeHead(200, Object.assign({
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cache-Control': cache,
    }, CABECERAS_SEGURIDAD));
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(archivo).on('error', () => res.destroy()).pipe(res);
  });
}

function noEncontrado(res) {
  const cuerpo = '<!doctype html><meta charset="utf-8"><title>No encontrado</title>' +
    '<body style="font-family:system-ui,sans-serif;text-align:center;padding:80px 20px">' +
    '<h1>Página no encontrada</h1><p><a href="/">Volver a la tienda</a></p></body>';
  res.writeHead(404, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, CABECERAS_SEGURIDAD));
  res.end(cuerpo);
}

/* ------------------------------------------------------------------ */
/* Servidor                                                            */
/* ------------------------------------------------------------------ */

const servidor = http.createServer((req, res) => {
  let ruta;
  try {
    ruta = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {
    return noEncontrado(res);
  }

  // En Render: redirigir http -> https
  if (DETRAS_DE_PROXY && req.headers['x-forwarded-proto'] === 'http' && req.headers.host) {
    res.writeHead(301, { Location: 'https://' + req.headers.host + req.url });
    return res.end();
  }

  if (ruta === '/api' || ruta.startsWith('/api/')) {
    manejarApi(req, res, ruta).catch((err) => {
      if (res.headersSent) return res.destroy();
      if (err instanceof ErrorHttp) {
        const extra = err.status === 413 ? { Connection: 'close' } : {};
        return enviarJson(res, err.status, { error: err.message }, extra);
      }
      console.error(err);
      enviarJson(res, 500, { error: 'Ocurrió un error en el servidor. Probá de nuevo en un momento.' });
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, CABECERAS_SEGURIDAD);
    return res.end();
  }

  if (almacen.tipo === 'archivo' && ruta.startsWith('/uploads/')) {
    return servirArchivo(req, res, almacen.UPLOADS_DIR, ruta.slice('/uploads/'.length), 'public, max-age=604800');
  }
  if (ruta === '/') ruta = '/index.html';
  if (ruta === '/admin' || ruta === '/admin/') ruta = '/admin.html';
  if (ruta === '/cuenta' || ruta === '/cuenta/') ruta = '/cuenta.html';
  const esImagen = ruta.startsWith('/img/') || ruta === '/favicon.svg';
  servirArchivo(req, res, PUBLIC_DIR, ruta.slice(1), esImagen ? 'public, max-age=86400' : 'no-cache');
});

servidor.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('\nEl puerto ' + PORT + ' ya está en uso. Puede que la página ya esté abierta en otra ventana.');
    console.error('Cerrá la otra ventana y volvé a intentar.\n');
  } else {
    console.error(err);
  }
  process.exit(1);
});

prepararDatos().then(() => {
  // Consulta diaria a la base para que Supabase (plan gratis) no la pause por inactividad
  if (almacen.tipo === 'supabase') {
    setInterval(() => { almacen.obtenerConfig().catch(() => {}); }, 24 * 60 * 60 * 1000).unref();
  }
  servidor.listen(PORT, () => {
    console.log('\nFutSal Camisetas funcionando (datos en ' + (almacen.tipo === 'supabase' ? 'Supabase' : DATA_DIR) + ').');
    console.log('  Tienda: http://localhost:' + PORT);
    console.log('  Panel:  http://localhost:' + PORT + '/admin');
    if (almacen.tipo === 'archivo' && fs.existsSync(CRED_FILE)) console.log('  Contraseñas iniciales en: ' + CRED_FILE);
    console.log('\nPara apagar: cerrá esta ventana o apretá Ctrl + C.\n');
  });
}).catch((err) => {
  console.error('\nNo se pudo iniciar: ' + err.message);
  if (almacen.tipo === 'supabase') console.error('Revisá SUPABASE_URL y SUPABASE_SECRET_KEY.');
  process.exit(1);
});
