'use strict';
/*
 * Almacenamiento en Supabase (PostgreSQL + Storage).
 * Se usa cuando estan definidas SUPABASE_URL y SUPABASE_SECRET_KEY.
 */
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'productos';

function crear(url, clave) {
  const sb = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const prefijoPublico = url.replace(/\/+$/, '') + '/storage/v1/object/public/' + BUCKET + '/';

  function ok(res) {
    if (res.error) {
      const e = new Error('Base de datos: ' + res.error.message);
      e.causa = res.error;
      throw e;
    }
    return res.data;
  }

  const aMs = (t) => (t ? new Date(t).getTime() : 0);

  const productoDeFila = (f) => ({
    id: f.id, nombre: f.nombre, categoria: f.categoria, descripcion: f.descripcion,
    precio: f.precio, imagen: f.imagen,
    imagenes: (Array.isArray(f.imagenes) && f.imagenes.length) ? f.imagenes : (f.imagen ? [f.imagen] : []),
    talles: f.talles || [],
    destacado: f.destacado, activo: f.activo, creado: aMs(f.creado),
  });
  const filaDeProducto = (p) => ({
    id: p.id, nombre: p.nombre, categoria: p.categoria, descripcion: p.descripcion,
    precio: p.precio, imagen: p.imagen, imagenes: p.imagenes, talles: p.talles,
    destacado: p.destacado, activo: p.activo,
    creado: new Date(p.creado).toISOString(),
  });
  const mensajeDeFila = (f) => ({
    id: f.id, nombre: f.nombre, contacto: f.contacto, mensaje: f.mensaje, leido: f.leido, fecha: aMs(f.fecha),
  });

  return {
    tipo: 'supabase',
    prefijoImagenes: prefijoPublico,
    origenImagenes: new URL(url).origin,

    async iniciar() {
      // Verifica la conexion (y que existan las tablas)
      ok(await sb.from('config').select('id').limit(1));
    },

    /* ---- Usuarios ---- */
    async contarUsuarios() {
      const res = await sb.from('usuarios').select('id', { count: 'exact', head: true });
      ok(res);
      return res.count || 0;
    },
    async listarUsuarios() {
      return ok(await sb.from('usuarios').select('*').order('creado'));
    },
    async usuarioPorNombre(usuario) {
      return ok(await sb.from('usuarios').select('*').eq('usuario', usuario).maybeSingle());
    },
    async usuarioPorId(id) {
      return ok(await sb.from('usuarios').select('*').eq('id', id).maybeSingle());
    },
    async crearUsuario(u) {
      ok(await sb.from('usuarios').insert(u));
      return u;
    },
    async actualizarUsuario(id, campos) {
      ok(await sb.from('usuarios').update(campos).eq('id', id));
    },
    async borrarUsuario(id) {
      ok(await sb.from('usuarios').delete().eq('id', id)); // las sesiones se borran en cascada
    },

    /* ---- Sesiones ---- */
    async crearSesion(tokenHash, usuarioId, expira) {
      ok(await sb.from('sesiones').insert({ token_hash: tokenHash, usuario_id: usuarioId, expira: new Date(expira).toISOString() }));
    },
    async obtenerSesion(tokenHash) {
      const f = ok(await sb.from('sesiones').select('*').eq('token_hash', tokenHash).maybeSingle());
      return f ? { usuarioId: f.usuario_id, expira: aMs(f.expira) } : null;
    },
    async borrarSesion(tokenHash) {
      ok(await sb.from('sesiones').delete().eq('token_hash', tokenHash));
    },
    async borrarSesionesDeUsuario(usuarioId, exceptoHash) {
      let q = sb.from('sesiones').delete().eq('usuario_id', usuarioId);
      if (exceptoHash) q = q.neq('token_hash', exceptoHash);
      ok(await q);
    },
    async limpiarSesiones() {
      ok(await sb.from('sesiones').delete().lt('expira', new Date().toISOString()));
    },

    /* ---- Productos ---- */
    async listarProductos(soloActivos) {
      let q = sb.from('productos').select('*').order('creado', { ascending: false });
      if (soloActivos) q = q.eq('activo', true);
      return ok(await q).map(productoDeFila);
    },
    async obtenerProducto(id) {
      const f = ok(await sb.from('productos').select('*').eq('id', id).maybeSingle());
      return f ? productoDeFila(f) : null;
    },
    async contarProductosConImagen(imagen) {
      const res = await sb.from('productos').select('id', { count: 'exact', head: true }).eq('imagen', imagen);
      ok(res);
      return res.count || 0;
    },
    async guardarProducto(p) {
      ok(await sb.from('productos').upsert(filaDeProducto(p)));
      return p;
    },
    async borrarProducto(id) {
      ok(await sb.from('productos').delete().eq('id', id));
    },

    async contarProductosEnCategoria(nombre) {
      const res = await sb.from('productos').select('id', { count: 'exact', head: true }).eq('categoria', nombre);
      ok(res);
      return res.count || 0;
    },
    async renombrarCategoriaEnProductos(viejo, nuevo) {
      ok(await sb.from('productos').update({ categoria: nuevo }).eq('categoria', viejo));
    },

    /* ---- Categorias ---- */
    async listarCategorias() {
      return ok(await sb.from('categorias').select('id,nombre,orden').order('orden').order('nombre'));
    },
    async categoriaPorId(id) {
      return ok(await sb.from('categorias').select('id,nombre,orden').eq('id', id).maybeSingle());
    },
    async categoriaPorNombre(nombre) {
      return ok(await sb.from('categorias').select('id,nombre,orden').ilike('nombre', nombre.replace(/[%_\\]/g, '\\$&')).maybeSingle());
    },
    async crearCategoria(c) {
      ok(await sb.from('categorias').insert({ id: c.id, nombre: c.nombre, orden: c.orden }));
      return c;
    },
    async actualizarCategoria(id, campos) {
      ok(await sb.from('categorias').update(campos).eq('id', id));
    },
    async borrarCategoria(id) {
      ok(await sb.from('categorias').delete().eq('id', id));
    },

    /* ---- Mensajes ---- */
    async listarMensajes() {
      return ok(await sb.from('mensajes').select('*').order('fecha', { ascending: false }).limit(500)).map(mensajeDeFila);
    },
    async crearMensaje(m) {
      ok(await sb.from('mensajes').insert({
        id: m.id, nombre: m.nombre, contacto: m.contacto, mensaje: m.mensaje, leido: false,
        fecha: new Date(m.fecha).toISOString(),
      }));
    },
    async obtenerMensaje(id) {
      const f = ok(await sb.from('mensajes').select('*').eq('id', id).maybeSingle());
      return f ? mensajeDeFila(f) : null;
    },
    async marcarMensaje(id, leido) {
      ok(await sb.from('mensajes').update({ leido }).eq('id', id));
    },
    async borrarMensaje(id) {
      ok(await sb.from('mensajes').delete().eq('id', id));
    },

    /* ---- Configuracion ---- */
    async obtenerConfig() {
      const f = ok(await sb.from('config').select('datos').eq('id', 1).maybeSingle());
      return f ? f.datos : null;
    },
    async guardarConfig(datos) {
      ok(await sb.from('config').upsert({ id: 1, datos }));
    },

    /* ---- Imagenes ---- */
    async subirImagen(nombre, buffer, tipo) {
      ok(await sb.storage.from(BUCKET).upload(nombre, buffer, {
        contentType: tipo, cacheControl: '31536000', upsert: false,
      }));
      return prefijoPublico + nombre;
    },
    async borrarImagen(urlImagen) {
      if (!urlImagen.startsWith(prefijoPublico)) return;
      const nombre = urlImagen.slice(prefijoPublico.length);
      await sb.storage.from(BUCKET).remove([nombre]); // si falla, solo queda un archivo sin usar
    },
  };
}

module.exports = { crear };
