# Muestras · Micropack Diseño

App para saber **qué muestras de producto tenemos y dónde están**. Se escanea el QR de una caja o el código de barras de un producto con el celular.

Funciona igual que Brief POP:

- **GitHub Pages** sirve la página (`index.html`), que se instala en el celular como app.
- **Google Apps Script** guarda los datos en una **planilla de Google**, en las hojas Cajas, Productos, Stock y Movimientos. Las fotos van a una carpeta de Drive.
- La misma página corre también desde la URL del Apps Script.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | La app. Va en GitHub y también se pega en Apps Script como archivo HTML `Index`. |
| `Codigo.gs` | El backend. Se pega en Apps Script. |
| `catalogo/00.json … 99.json` | ~76.500 productos con código de barras, nombre y marca, sacados de la base SEPA de Precios Claros (datos.gob.ar, 06/11/2026). Partido en 100 archivos para que la app baje solo el que necesita. |
| `manifest.json`, `icon.png`, `icon-192.png` | Para instalarla en el celular. |

## Puesta en marcha

### 1. Planilla + Apps Script
1. Crear una planilla de Google nueva llamada **Muestras**.
2. **Extensiones → Apps Script**.
3. Pegar el contenido de `Codigo.gs` en `Código.gs`.
4. **+ → HTML**, nombre `Index`, y pegar el contenido de `index.html`.
5. Elegir la función `configurar` y tocar **Ejecutar**. Aceptar los permisos: crea las 4 hojas y la carpeta de fotos.
6. **Implementar → Nueva implementación → App web**:
   - Ejecutar como: **yo**
   - Quién tiene acceso: **Cualquier persona**
7. Copiar la URL que termina en `/exec`.

### 2. Conectar la página
En `index.html`, reemplazar `PEGAR_ACA_LA_URL_DEL_APPS_SCRIPT` por esa URL. Hacerlo en las dos copias: la de GitHub y la de Apps Script.

### 3. GitHub Pages
1. Subir todos los archivos a un repositorio llamado **muestras**.
2. **Settings → Pages → Deploy from a branch → main / root**.
3. La app queda en `https://manuelghiglia-cloud.github.io/muestras/`.

Si el repositorio tiene otro nombre, cambiar `CATALOGO_URL` en `index.html`.

### 4. En el celular
Abrir la URL de GitHub Pages en Chrome (Android) o Safari (iPhone) y elegir **Agregar a pantalla de inicio**.

## Cómo se usa
- **Nueva caja**: nombre tipo `HH GLOBAL - E5` y lugar. Genera la etiqueta con QR para imprimir (10 × 6,5 cm).
- **Escanear**: la cámara en vivo reconoce sola si es el QR de una caja o el código de un producto.
  - QR de caja → muestra lo que hay adentro.
  - Producto ya cargado → muestra en qué cajas está.
  - Producto nuevo → completa nombre y marca desde el catálogo. Si no lo encuentra, prueba Open Food Facts y Open Beauty Facts; si tampoco está, se carga a mano.
- **Mover / Devolver / Descartar**: queda registrado quién lo hizo y cuándo.
- **Buscar**: “shampoo sedal” → “Sí, hay. Está en Estudio, en la caja E5”.

## Reglas
- La app **nunca borra filas**. Lo devuelto queda con cantidad 0 y su movimiento registrado.
- Los códigos se guardan como texto, para que no se pierdan ceros ni aparezcan como `7,79E+12`.

## Actualizar el catálogo
Bajar un zip nuevo de https://datos.gob.ar/dataset/produccion-precios-claros---base-sepa y regenerar `catalogo/` (pedírselo a Claude).
