'use strict';
/*
 * Almacenamiento local en un archivo JSON (data/db.json) y fotos en data/uploads.
 * Se usa para probar en la computadora cuando no hay Supabase configurado.
 */
const fs = require('fs');
const path = require('path');

function crear(dataDir) {
  const UPLOADS_DIR = path.join(dataDir, 'uploads');
  const DB_FILE = path.join(dataDir, 'db.json');
  let db;

  function guardar() {
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
    if (fs.existsSync(DB_FILE)) {
      try { fs.copyFileSync(DB_FILE, DB_FILE + '.bak'); } catch (e) { /* copia opcional */ }
    }
    fs.renameSync(tmp, DB_FILE);
  }

  const copia = (o) => (o ? JSON.parse(JSON.stringify(o)) : o);

  return {
    tipo: 'archivo',
    prefijoImagenes: '/uploads/',
    origenImagenes: null,
    UPLOADS_DIR,

    async iniciar() {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
      if (fs.existsSync(DB_FILE)) {
        try {
          db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        } catch (e) {
          throw new Error('No se pudo leer ' + DB_FILE + ': ' + e.message + '. Restauralo desde db.json.bak.');
        }
      } else {
        db = {};
      }
      db.usuarios = db.usuarios || [];
      db.sesiones = db.sesiones || {};
      db.productos = db.productos || [];
      db.mensajes = db.mensajes || [];
      db.config = db.config || null;
      db.productos.forEach((p) => {
        if (!Array.isArray(p.imagenes)) p.imagenes = p.imagen ? [p.imagen] : [];
      });
      if (!Array.isArray(db.categorias)) {
        db.categorias = [];
        db.productos.forEach((p) => {
          if (!db.categorias.some((c) => c.nombre.toLowerCase() === p.categoria.toLowerCase())) {
            db.categorias.push({ id: require('crypto').randomBytes(8).toString('hex'), nombre: p.categoria, orden: db.categorias.length });
          }
        });
      }
      guardar();
    },

    /* ---- Usuarios ---- */
    async contarUsuarios() { return db.usuarios.length; },
    async listarUsuarios() { return copia(db.usuarios); },
    async usuarioPorNombre(usuario) { return copia(db.usuarios.find((u) => u.usuario === usuario) || null); },
    async usuarioPorId(id) { return copia(db.usuarios.find((u) => u.id === id) || null); },
    async crearUsuario(u) { db.usuarios.push(copia(u)); guardar(); return u; },
    async actualizarUsuario(id, campos) {
      const u = db.usuarios.find((x) => x.id === id);
      if (u) { Object.assign(u, campos); guardar(); }
    },
    async borrarUsuario(id) {
      db.usuarios = db.usuarios.filter((u) => u.id !== id);
      for (const k of Object.keys(db.sesiones)) if (db.sesiones[k].usuarioId === id) delete db.sesiones[k];
      guardar();
    },

    /* ---- Sesiones ---- */
    async crearSesion(tokenHash, usuarioId, expira) { db.sesiones[tokenHash] = { usuarioId, expira }; guardar(); },
    async obtenerSesion(tokenHash) { return copia(db.sesiones[tokenHash] || null); },
    async borrarSesion(tokenHash) {
      if (db.sesiones[tokenHash]) { delete db.sesiones[tokenHash]; guardar(); }
    },
    async borrarSesionesDeUsuario(usuarioId, exceptoHash) {
      for (const k of Object.keys(db.sesiones)) {
        if (db.sesiones[k].usuarioId === usuarioId && k !== exceptoHash) delete db.sesiones[k];
      }
      guardar();
    },
    async limpiarSesiones() {
      const ahora = Date.now();
      let cambio = false;
      for (const k of Object.keys(db.sesiones)) if (db.sesiones[k].expira < ahora) { delete db.sesiones[k]; cambio = true; }
      if (cambio) guardar();
    },

    /* ---- Productos ---- */
    async listarProductos(soloActivos) {
      const lista = soloActivos ? db.productos.filter((p) => p.activo) : db.productos;
      return copia(lista).sort((a, b) => b.creado - a.creado);
    },
    async obtenerProducto(id) { return copia(db.productos.find((p) => p.id === id) || null); },
    async contarProductosConImagen(imagen) { return db.productos.filter((p) => p.imagen === imagen).length; },
    async guardarProducto(p) {
      const i = db.productos.findIndex((x) => x.id === p.id);
      if (i === -1) db.productos.push(copia(p)); else db.productos[i] = copia(p);
      guardar();
      return p;
    },
    async borrarProducto(id) { db.productos = db.productos.filter((p) => p.id !== id); guardar(); },

    async contarProductosEnCategoria(nombre) { return db.productos.filter((p) => p.categoria === nombre).length; },
    async renombrarCategoriaEnProductos(viejo, nuevo) {
      db.productos.forEach((p) => { if (p.categoria === viejo) p.categoria = nuevo; });
      guardar();
    },

    /* ---- Categorias ---- */
    async listarCategorias() {
      return copia(db.categorias).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre));
    },
    async categoriaPorId(id) { return copia(db.categorias.find((c) => c.id === id) || null); },
    async categoriaPorNombre(nombre) {
      const n = nombre.toLowerCase();
      return copia(db.categorias.find((c) => c.nombre.toLowerCase() === n) || null);
    },
    async crearCategoria(c) { db.categorias.push(copia(c)); guardar(); return c; },
    async actualizarCategoria(id, campos) {
      const c = db.categorias.find((x) => x.id === id);
      if (c) { Object.assign(c, campos); guardar(); }
    },
    async borrarCategoria(id) { db.categorias = db.categorias.filter((c) => c.id !== id); guardar(); },

    /* ---- Mensajes ---- */
    async listarMensajes() { return copia(db.mensajes.slice(0, 500)); },
    async crearMensaje(m) {
      db.mensajes.unshift(copia(m));
      if (db.mensajes.length > 2000) db.mensajes.length = 2000;
      guardar();
    },
    async obtenerMensaje(id) { return copia(db.mensajes.find((m) => m.id === id) || null); },
    async marcarMensaje(id, leido) {
      const m = db.mensajes.find((x) => x.id === id);
      if (m) { m.leido = leido; guardar(); }
    },
    async borrarMensaje(id) { db.mensajes = db.mensajes.filter((m) => m.id !== id); guardar(); },

    /* ---- Configuracion ---- */
    async obtenerConfig() { return copia(db.config); },
    async guardarConfig(datos) { db.config = copia(datos); guardar(); },

    /* ---- Imagenes ---- */
    async subirImagen(nombre, buffer) {
      fs.writeFileSync(path.join(UPLOADS_DIR, nombre), buffer);
      return '/uploads/' + nombre;
    },
    async borrarImagen(urlImagen) {
      if (!urlImagen.startsWith('/uploads/')) return;
      fs.unlink(path.join(UPLOADS_DIR, path.basename(urlImagen)), () => {});
    },
  };
}

module.exports = { crear };
