# Remitos — app para hacer remitos en la calle

App web instalable (PWA). Funciona sin internet y guarda todo en el dispositivo.

## Cómo ponerla en marcha

1. Subir **toda esta carpeta** a un hosting estático con HTTPS (Netlify, GitHub Pages, Cloudflare Pages o un hosting propio). No necesita servidor ni base de datos.
2. En el dispositivo del cliente, abrir la dirección una vez con internet.
3. Instalarla: en Android/Chrome, menú ⋮ → "Instalar app"; en iPhone/iPad (Safari), Compartir → "Agregar a inicio"; en PC (Chrome/Edge), ícono de instalar en la barra de direcciones.
4. Desde ahí abre y funciona sin conexión.

Para probarla en la PC: `python -m http.server 8000` dentro de la carpeta y abrir `http://localhost:8000`.
No abrir `index.html` con doble clic: sin servidor no se instala ni queda disponible sin conexión.

## Primer uso

1. **Ajustes**: cargar nombre del negocio, logo, dirección, teléfono, CUIT y el número de remito por el que va.
2. **Productos → Importar Excel**: elegir la planilla de precios e indicar qué columna es descripción, código y precio. Cuando cambien los precios, se importa de nuevo la planilla actualizada.
3. **Nuevo**: buscar productos, tocar "Agregar", poner el cliente y "Confirmar remito". Después "Enviar PDF por WhatsApp".

## Para tener en cuenta

- Los datos viven **solo en ese dispositivo y ese navegador**. No se sincronizan entre el celular y la tablet.
- Usar **Ajustes → Guardar copia** seguido. Si se borran los datos del navegador o se pierde el equipo, sin copia no hay forma de recuperarlos.
- Al subir una versión nueva de la app, cambiar `remitos-v1` por `remitos-v2` (etc.) en `sw.js` para que los dispositivos la tomen.
- El ícono de la app en la pantalla del celular son los archivos `icon-192.png` e `icon-512.png`. Para poner el logo del cliente, reemplazarlos por su logo en esos dos tamaños (cuadrado, PNG) con el mismo nombre.
- El PDF dice "Documento no válido como factura": es un remito interno, no un comprobante fiscal.
