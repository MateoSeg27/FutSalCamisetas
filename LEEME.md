# FutSal Camisetas - página web

Tienda con catálogo, carrito con pedido por WhatsApp, formulario de contacto
y panel para el dueño y el administrador.

## Cómo iniciarla en esta computadora

1. Instalar **Node.js** (versión LTS) desde https://nodejs.org (solo la primera vez).
2. Doble clic en **iniciar.bat**.
3. Se abre la tienda en http://localhost:3000. El panel está en http://localhost:3000/admin.

Para apagarla, cerrar la ventana negra.

## Usuarios y contraseñas

La primera vez que se inicia, se crean dos usuarios con contraseñas al azar y se
guardan en `data/credenciales-iniciales.txt`:

- `admin` (administrador): todo lo del dueño y además crea/borra usuarios y
  les pone contraseña nueva.
- `dueno` (dueño): productos, mensajes y datos del negocio.

Cada uno puede cambiar su contraseña en el panel, pestaña **Mi cuenta**.
Después de cambiarlas, borrar `credenciales-iniciales.txt`.

## Primeros pasos en el panel

1. **Datos del negocio**: cargar el WhatsApp (ej. `5493871234567`). Ahí llegan los pedidos.
2. **Productos**: borrar los de ejemplo y cargar los reales con foto, precio, talles y stock.
3. **Mensajes**: acá aparecen las consultas del formulario de contacto.

## Dónde se guarda todo

**En internet (Render):** todo se guarda en **Supabase**, proyecto `futsal-camisetas`:
productos, mensajes, usuarios y datos del negocio en la base de datos, y las fotos en el
almacenamiento `productos`. Render solo ejecuta la página; si se reinicia no se pierde nada.

**En esta computadora:**
- Sin archivo `.env`: guarda en la carpeta `data/` (solo para probar, separado de la tienda real).
- Con `.env` (copiar `.env.ejemplo` y completar la clave secreta): usa la misma base de datos
  que la tienda real. Cuidado: lo que cambies se ve en la página publicada.

## Archivos

- `server.js`: servidor.
- `cuentas.js` y `correo.js`: cuentas de clientes y envío de emails.
- `almacen/supabase.js` y `almacen/archivo.js`: dónde se guardan los datos.
- `public/`: la página (`index.html`, `admin.html`, `css/`, `js/`, `img/`).
- `image.png`: logo original.

## Publicación (Render + Supabase)

- Código en GitHub: cada cambio que se sube se publica solo en Render.
- Para los códigos por email (cuentas de clientes): `BREVO_API_KEY` y `EMAIL_REMITENTE`
  (clave de API de Brevo y el mail remitente confirmado ahí). Sin eso, en la computadora
  el código aparece en la ventana negra en vez de enviarse.
- Variables en Render: `SUPABASE_URL` y `SUPABASE_SECRET_KEY` (la clave secreta de
  Supabase → Project Settings → API Keys). Nunca compartir esa clave.
- Plan gratis de Render: si nadie entra en 15 minutos, la página "se duerme" y la primera
  visita tarda unos 30-60 segundos. Pasando a Starter (USD 7/mes) eso desaparece.
- Plan gratis de Supabase: se pausa si pasa una semana sin ninguna visita. Se reactiva desde
  supabase.com.
