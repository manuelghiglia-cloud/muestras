# Stock diseño · sistema de diseño y especificación

Guía para mantener la app pareja cuando se agreguen pantallas. Todo vive en `index.html`: los tokens están en `:root` y los componentes son clases CSS.

## Tokens

### Color
| Token | Valor | Uso |
|---|---|---|
| `--paper` | #ffffff | Fondo de la app, interior de tarjetas sobre gris |
| `--fill` | #f2f2f2 | Tarjetas, listas, buscador |
| `--fill-2` | #e8e8e8 | Botón secundario, segmentado |
| `--line` | #dcdcdc | Separadores, borde inferior de campos |
| `--ink` | #000000 | Texto principal, botón principal, tarjeta oscura |
| `--ink-2` | #464646 | Texto secundario |
| `--ink-3` | #6f6d6d | Texto terciario, íconos apagados (pasa 4.5:1 sobre blanco y #f2f2f2) |
| `--on-dark` | #c9c7c7 | Texto secundario **solo sobre negro** |
| `--acc` | #a35e47 | Terracota: forma del FAB, acción "Agregar", lo último escaneado |
| `--acc-ink` | #8c4e3a | Links y texto en acento (contraste para texto chico) |
| `--acc-soft` | #f6ece8 | Fondo de resaltado (línea nueva, apartados) |
| `--red` / `--red-ink` / `--red-soft` | #b3261e / #8c1d18 / #f9dedc | Errores y vencidos |

Regla: en los templates usar siempre `var(--token)`, nunca el hex. Excepción: atributos SVG `fill="…"`, que no aceptan variables.

### Tipografía
Archivo (Google Fonts), un solo family.
| Rol | Tamaño / peso | Ejemplo |
|---|---|---|
| Título de app | 44px · 900 · font-stretch 125% | "Stock diseño" |
| Título de pantalla (`h1.md`) | 32px · 900 · 125% | "Producto nuevo" |
| Sección (`.sec h2`) | 18px · 800 | "Cajas", "Actividad" |
| Cuerpo | 15px · 400–700 | filas, campos |
| Secundario | 13px | lugar de la caja, metadatos |
| Mínimo | 12.5px | solo metadatos, nunca acciones |

Pendiente: hoy conviven 12.5, 13, 13.5, 14, 14.5 y 15 px. Al tocar una pantalla, llevar todo a 12.5 / 13 / 15 / 18.

### Forma y espacio
- Radios: 999px (pastillas y botones), 28px (tarjeta grande / oscura), 20px (fila y tarjeta), 12–14px (miniaturas). No usar otros.
- Formas M3: GALLETA (FAB y burbujas de caja) y SOL (spinner).
- Separación entre filas 6–8px; entre secciones 18–26px; margen lateral 20px.
- Zona táctil mínima 44×44 (stepper de lista 40×40 dentro de una fila de 44+).

## Componentes

| Componente | Clase | Variantes / estados |
|---|---|---|
| Botón | `.btn` | `.pri` negro (una sola acción principal por pantalla), base gris; `disabled` = opacidad; `.save` = fijo abajo |
| FAB | `.fab` | Negro con GALLETA terracota. Inicio: **Agregar producto**. Caja: **Agregar acá**. Siempre una línea |
| Fila de lista | `.item`, `.row-p` | Ícono/foto 44px + título + subtítulo + número a la derecha |
| Línea de tanda | `.linea` | Normal · `.nuevo` (lo último escaneado, resaltado 4 s) · `.pend` (apartado, borde punteado) · buscando (spinner SOL) |
| Pregunta de foto | `.fotopreg` | Miniatura + "¿Usás esta foto?" + Usar / Sacar otra |
| Stepper | `.mini` | − cantidad +; nunca baja de 1; tope = stock de la caja de origen |
| Segmentado | `.seg` / `.seg4` | Agregar · Sacar · Mover · Devolver |
| Chips | `.chip` | `aria-pressed` para el elegido |
| Tarjeta oscura | `.d-card` | Para la decisión de destino (caja) |
| Aviso de cámara | `#camOk` | Verde = leído, rojo = error, desaparece a los 1,8 s, con pip |
| Toast | `toast()` | Confirma lo hecho con el mismo verbo del botón |

## Lenguaje (UX copy)

Un verbo por acción, en botón, aviso y actividad:
| Acción | Botón | Aviso | Actividad |
|---|---|---|---|
| Meter en una caja | Agregar / Listo · Agregar 3 a CAJA | Agregaste 3 | Agregó 3 × … a CAJA |
| Sacar | Listo · Sacar 2 unidades | Sacaste 2 unidades | Usó / Descartó |
| Mover | Listo · Mover 2 a CAJA | Moviste 2 unidades | Movió 2 × … de A a B |
| Devolver al cliente | Listo · Devolver 1 unidad | Devolviste 1 unidad | Devolvió 1 × … al cliente |

- No decir de dónde salen los datos (tiendas, catálogos): "Completado solo. Revisalo."
- Errores = qué pasó + qué hacer: "No se pudo subir la foto. Revisá la conexión y probá de nuevo."
- Vacíos = qué es + cómo empezar: "Está vacía. Tocá “Agregar acá” y escaneá…".
- Voseo, frases cortas, sin signos de exclamación.

## Flujos y estados (handoff)

### Agregar productos (tanda)
1. Entrada: FAB del inicio, "Agregar acá" en una caja o "Agregar" en la ficha.
2. Cámara continua (BarcodeDetector o ZXing). Mismo código dentro de 1,5 s se ignora.
3. Cada lectura: pip + vibración + aviso + la línea sube arriba y se resalta.
4. QR de caja: fija el destino.
5. Código desconocido → línea "Buscando…" → si aparece: se crea el producto y, si hay foto, se pregunta → si no: "Apartado".
6. Listo: agrega lo completo; lo apartado va a la lista de Apartados (por celular).
Bloqueos: sin caja → aviso y foco en el selector; búsquedas en curso → "Esperá un segundo…".

### Casos borde
- Nombre largo: 2 líneas y "…".
- Sin conexión: el aviso de error de `escribir()`; la tanda no se pierde hasta tocar Listo.
- Sin cámara: "Agregar sin escanear" acepta texto o un código de 8–14 dígitos.
- Foto de tienda que no carga: queda sin foto, se puede sacar después.

### Accesibilidad
- Botones reales (`<button>`), `aria-label` en íconos solos (×, −, +).
- `aria-selected` en el segmentado, `aria-pressed` en chips.
- Movimiento reducido: sin animación de entrada en `.linea.nuevo`.
- Cada lectura se anuncia a lectores de pantalla (`#camOk` con `role=status`, `aria-live=polite`).
