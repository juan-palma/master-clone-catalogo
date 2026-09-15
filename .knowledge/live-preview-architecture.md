# Arquitectura del preview en vivo — qué mecanismo usar según el tipo de componente

## Decisión: dos familias, no una sola

**Familia A — Componentes Astro puros** (sin JS de cliente propio: HeroBadge, Slider, Gallery
[tab estático], Image-Text Split, Feature Grid, Process Steps, y así seguirá para QuoteGrid,
StatsPanel, AnnouncementBanner, ContactSection, Branches, WhatsAppFab):

- Se registran en `src/lib/component-registry.ts` (componente + CSS + props default + controles).
- `src/pages/api/render/[id].ts` usa la **Container API de Astro**
  (`experimental_AstroContainer`, `astro/container`) para re-renderizar el componente real
  server-side cada vez que un control cambia. Esto funciona porque estos componentes son
  puramente funciones de sus props — no tienen estado propio ni necesitan hidratación.
- `src/components/LivePreview.astro` es el wrapper genérico — agregar un componente nuevo de
  esta familia es solo agregar una entrada al registro, no tocar el mecanismo.

### Control `'repeater'` — para campos `hasMany` de sub-documentos (`items[]`)

Muchos componentes (Feature Grid, Process Steps, y probablemente varios de los que faltan) tienen
un campo `hasMany` real del CMS — cualquier cantidad de ítems, agregables/quitables. Un error real
cometido al construir Feature Grid/Process Steps la primera vez: exponerlos como un NÚMERO FIJO de
controles planos (`item1H3`, `item2H3`, `item3H3`...) — funcionaba, pero no dejaba ver que el
campo real acepta cualquier cantidad, ni permitía probarlo agregando o quitando (el usuario lo
notó explícitamente: "no veo que se pueda crear más ni quitar... para dar a notar que es
configurable").

**Fix:** control genérico `type: 'repeater'` (`Control` en `component-registry.ts`) —
`{ name, label, itemLabel, fields: RepeaterField[] }`, donde `fields` son los sub-campos de CADA
ítem (`text` / `textarea` / `image`). El value final es un array de objetos
`Record<string, string | UploadedImage | null>`. En `LivePreview.astro`:
- Vive FUERA del `<label>` por-control (es un bloque compuesto, no un input único) — un badge
  "🔁 múltiples — agregá o quitá los que quieras" bien visible identifica el campo de un vistazo.
- Los inputs de cada ítem NO tienen `name` (evita que el loop genérico de `form.elements` los
  procese como props top-level) — se manejan aparte, mismo patrón que el control `'images'`:
  estado propio (`repeaterValues`) + inyección manual en `update()`.
- Los campos de texto SÍ disparan el 'input' nativo → el listener global del form los agarra por
  burbujeo (no hace falta debounce propio); los de imagen llaman `update()` directo en su
  'change' (igual que el control `'image'` suelto).
- Reordenar por arrastre NO está implementado en este preview — si hace falta demostrarlo, el
  admin real de Payload sí lo trae (se documenta así en cada página, no se simula acá).
- Los sub-campos de un repeater soportan `text`/`textarea`/`image`/`select` (agregado con Stats
  Panel, cuyo `dashboard[].status` es un select real `good`/`warn`/`bad`) — el `<select>` SÍ
  dispara 'input' nativo al cambiar de opción (no solo 'change'), así que el mismo listener
  global del form lo agarra por burbujeo, igual que los campos de texto.

**Regla para los componentes que faltan:** si un campo del CMS real es `type: 'array'`/`hasMany`
(no importa si el catálogo lo demuestra con 3 o 5 ítems de ejemplo), usar `'repeater'` — nunca un
número fijo de controles `item1`/`item2`/`item3`. Documentar también el campo con el badge 🔁 y
una nota corta en la tabla de Parámetros de la página (patrón ya aplicado en Gallery/Image-Text
Split para sus campos `hasMany` de solo-imágenes, que usan `'images'` en vez de `'repeater'`
porque cada ítem ES la imagen, sin otros sub-campos).

**Familia B — Componentes de framework** (Svelte real: Modal y Gallery hechos):

- La Container API SÍ puede producir el HTML server-rendered de un componente framework (ej. el
  tab "Preview" de Gallery usa `Galeria.astro` → `Gallery.svelte` normal, vía el registro) —
  **pero solo lo estático**: `renderToString` no ejecuta `<script>`/`onMount`/lifecycle, así que
  scroll/animación/lightbox no se ven ahí. Para que la Container API sepa renderizar un `.svelte`
  hace falta registrar su renderer a mano — ver "Container API no trae renderers de framework" en
  `astro-build-gotchas.md`.
- Cuando el componente SÍ necesita demostrarse funcionando de verdad (Modal: lightbox real;
  Gallery: scroll GSAP + lightbox real), eso va en un componente bespoke aparte
  (`ModalPreview.astro`, `GalleryInteractiveDemo.astro`) que monta el componente real con su
  ciclo de vida completo — no encajan en el registro genérico porque no se controlan solo por
  props recibidos una vez, sino por su propia API/estado interno.
  - Modal no toma props — se controla imperativamente (`openPopup()`/`closePopup()` del store
    compartido) — se monta con un `client:load` normal de Astro.
  - Gallery.svelte SÍ toma un prop (`imageData`) que necesita cambiar cada vez que el usuario
    sube/quita imágenes en el preview de arriba — un Astro Island fija sus props en el momento
    del SSR, no está pensado para recibirlos de nuevo desde afuera ya hidratado. Se monta a mano
    con `mount()`/`unmount()` de `'svelte'` (no un directive `client:*`), destruyendo y
    recreando el componente completo en cada cambio de imágenes — no `$set`, porque los efectos
    GSAP de Gallery.svelte se arman una sola vez en `onMount` a partir del grid inicial; con
    `$set` las imágenes agregadas después de montar no se animarían. Ver "Svelte 5: `new
    Component()` ya no existe" en `astro-build-gotchas.md`.
  - Ambos comparten imágenes con el preview de arriba escuchando `livepreview:update`
    (`e.detail.props` — los valores CRUDOS de los controles, no lo que arma `buildProps`, que
    solo corre server-side).
  - **Bug real encontrado con Announcement Banner:** el PRIMER `notifyUpdate()` (el del render
    inicial, antes de tocar cualquier control) puede dispararse antes de que un demo bespoke que
    aparece DESPUÉS en la página llegue a registrar su propio
    `document.addEventListener('livepreview:update', ...)` — los `<script type="module">`
    deferred de Astro no garantizan en la práctica ese orden. El síntoma: todo funciona bien
    después del primer cambio de un control, pero el estado inicial queda sin re-enganchar (ej.
    un botón que no abre nada hasta que se edita algo). Fix que NO alcanza:
    `setTimeout(notifyUpdate, 0)` del lado de quien emite. Fix real: del lado de quien escucha —
    buscar el shadow root ya existente directo por DOM (`document.querySelector('.live-preview
    [data-preview-id="..."] .lp-shadow-host')?.shadowRoot`) y reintentar con un intervalo corto
    hasta encontrarlo, en vez de depender solo del evento para el estado inicial (ver
    `AnnouncementBannerModalMount.astro`). Cualquier demo bespoke nuevo que necesite el estado
    inicial (no solo actualizaciones futuras) debe usar este mismo patrón.
- Si el componente de framework importa dependencias propias (ej. Modal/Gallery usan `svelte` y
  `gsap`), la versión de `svelte` en este catálogo debe satisfacer el peer-range que pide la
  versión instalada de `@astrojs/svelte` — no necesariamente ser idéntica a la de
  `site/package.json` en sitio-cms-mongo (esa versión no se usa para compilar en este proceso).
  Ver "Mismatch de versión de Svelte" en `astro-build-gotchas.md`.

**Cómo decidir cuál usar para un componente nuevo:** ¿el archivo es `.astro` o `.svelte`/`.jsx`/etc.?
`.astro` → Familia A. Framework real → Familia B.

## Por qué Shadow DOM y no `<iframe>`

Se probó con `<iframe>` primero y se descartó — no por preferencia estética, por problemas
reales encontrados:

- Starlight aplica `max-width:100%` a TODO `<iframe>` dentro de contenido markdown
  (`.sl-markdown-content iframe`) — un `width` inline no le gana a eso, hace falta también
  `max-width:none` explícito. Fácil de olvidar, ya pasó.
- Varios componentes de `_library/` ocultan partes de su UI por debajo de ciertos breakpoints
  (ej. HeroBadge solo se muestra a `min-width:866px`) — el iframe mide su ancho real según lo
  que le deja el layout que lo contiene, casi nunca ≥866px dentro de la columna de Starlight.
  Hubo que forzar un ancho fijo (`width:1000px`) envuelto en `overflow-x:auto` como parche.
- Además del costo/fragilidad general de iframes (documento y contexto de navegación aparte).

**La alternativa que se adoptó:** `attachShadow({mode:'open'})` del lado del cliente —
aislamiento real de CSS en ambas direcciones (nada de Starlight se filtra adentro, nada del
componente se filtra afuera), sin documento aparte. El HTML+CSS inicial se pasa del servidor al
cliente vía `<script type="application/json">` (nunca `<template>` si va a estar dentro de un
`<Tabs>` — ver `astro-starlight-gotchas.md`), y el script cliente hace
`shadow.append(...)`/`canvas.innerHTML = ...` una sola vez al cargar.

Nota: Shadow DOM NO resuelve por sí solo el problema de breakpoints — las media queries del
componente siguen evaluando contra el viewport real de la página (Shadow DOM no crea un nuevo
"viewport", solo aísla estilos/DOM). Si un componente de la Familia A tiene lógica de
mostrar/ocultar por breakpoint pensada para desktop, puede hacer falta un ajuste puntual en el
canvas del preview — no asumir que Shadow DOM lo arregla solo.

## Límite real: Container API no empaqueta el `<script>` de un componente Astro

**Encontrado con Slider** (`Slider.astro` trae su propio `<script>` con
`import Swiper from "swiper"`, define el custom element `<astro-swiper>`).

**Síntoma:** el HTML que devuelve `container.renderToString()` sí incluye el `<script
type="module" src="...">`, pero el `src` es una **ruta absoluta del sistema de archivos** al
`.astro` original (ej. `/Users/.../Slider.astro?astro&type=script&index=0&lang.ts`) — no una URL
que el navegador pueda cargar. La Container API está pensada para obtener el HTML de un
componente aislado, no para replicar el pipeline completo de bundling de scripts que corre
cuando Astro construye una página real.

**Consecuencia práctica:** cualquier componente de la Familia A cuyo `<script>` dependa de un
`import` de una librería externa (Swiper, etc.) **no puede ejecutar esa lógica** en este
mecanismo de preview — ni siquiera forzando la re-ejecución del script (el problema no es que no
corra, es que su `src` apunta a un lugar que no existe como URL servible).

**Cómo se manejó para Slider:** el fixture por defecto usa **1 solo slide** — el propio código de
`Slider.astro` decide NO cargar Swiper cuando `data-ns <= 1` (es el mismo camino "sin carrusel"
que usa el sitio real como optimización cuando hay un solo slider activo en una zona). El preview
de Slider muestra ese modo, que es 100% CSS — no necesita que el script corra para verse bien.
**No se agregó un control para pasar a "modo carrusel" (2+ slides)** porque hoy no funcionaría —
sería un preview que se ve roto a propósito, peor que no tenerlo.

**Si en el futuro hace falta mostrar el carrusel funcionando de verdad**, las opciones reales son:
(a) renderizar el componente a través del pipeline normal de páginas de Astro en vez de la
Container API (ej. una ruta real en `sitio-cms-mongo/site/` dedicada a esto, con el costo de
mantenimiento que eso implica — ver la opción "B" que se descartó al decidir dónde vive el
preview, en el historial de la conversación), o (b) inicializar Swiper manualmente desde el
propio script del catálogo en vez de depender del script embebido del componente. Ninguna se
implementó — no vale la pena el esfuerzo mientras el modo "1 slide" cubra el caso real más común.

## Scripts embebidos SIN imports externos — SÍ se pueden ejecutar de verdad (2026-09-15)

Contradice a medias la nota de arriba sobre Slider: esa limitación (src apuntando a una ruta de
filesystem no servible) es específica de scripts que hacen `import` de una librería externa
(Swiper). Un `<script>` de un componente Familia A que NO importa nada (solo lógica propia, ej.
Contact Section interceptando el submit del form) SÍ recibe un `src` real y servible
(`/_astro/....js` en dev vía Vite) — y por lo tanto SÍ se puede forzar a ejecutar de verdad,
cerrando la brecha entre "preview" y "componente real" para este subconjunto de casos.

**Tres problemas reales encontrados y resueltos, todos en `LivePreview.astro`'s
`initLivePreview()`, todos genéricos (no hardcoded por componente):**

1. **`innerHTML` nunca ejecuta `<script>`s** (comportamiento estándar del DOM). Fix: `setCanvasHtml()`
   recorre los `<script>` del HTML recién insertado y los recrea con `document.createElement` +
   `replaceWith` — así el navegador SÍ los corre. Dedup por contenido/`src` (`executedScripts`
   Set) para no re-registrar el mismo listener global en cada `update()` (cada vez que el usuario
   toca un control del form de arriba, todo el `canvas.innerHTML` se reemplaza entero, script
   incluido) — el listener ya activo de la primera ejecución sigue funcionando sobre cualquier
   `<form>` nuevo que aparezca después.
2. **El canvas debe estar CONECTADO antes de insertarle scripts.** Antes, `canvas.innerHTML =
   initialHtml` corría con el `<div class="lp-canvas">` todavía desconectado (se appendeaba a
   `shadow` recién después) — un `<script>` insertado en un árbol desconectado no dispara su
   "prepare the script element", no ejecuta. Fix: `shadow.append(canvas)` va ANTES de poblar el
   canvas, no después.
3. **El evento `submit` no es `composed`** — no cruza el límite del Shadow DOM. Comprobado
   empíricamente: ni con un listener de **captura** en `document` + `preventDefault()` se
   interceptaba un submit disparado dentro del shadow (la navegación nativa seguía pasando). Esto
   rompe cualquier script de producción que delegue eventos en `document` (patrón normal — el form
   vive directo en el documento en producción, nunca dentro de un shadow root). Fix, genérico, sin
   tocar el componente real: mientras el `<script>` recién insertado corre, se intercepta
   `document.addEventListener`/`removeEventListener` para que cualquier listener que registre en
   `document` quede realmente en `shadow` — ahí el form SÍ es parte del mismo árbol que el
   listener, sin problema de composed/retargeting.

**Complicación de timing con el punto 3:** en dev, Astro sirve el `<script>` de un `.astro` como
**módulo externo** (`type="module" src="..."`), no inline — confirmado inspeccionando el nodo (0
hijos de texto, atributos `type`+`src`). Un módulo externo ejecuta ASYNC, después de su fetch —
restaurar el parche de `document.addEventListener` de forma síncrona (en un `try/finally`
alrededor de solo el `replaceWith`) cerraba la ventana ANTES de que el módulo llegara a registrar
nada, y el listener real terminaba otra vez en el `document` de verdad (mismo bug que sin el
parche). Fix: si el script tiene `src`, el parche se mantiene activo hasta su evento
`load`/`error`, no hasta el final del `replaceWith` síncrono — `setCanvasHtml()` ahora devuelve
una `Promise<void>` que `initLivePreview` (ahora `async`) espera antes de seguir.

**Riesgo conocido, no confirmado como problema real:** mientras el parche de
`document.addEventListener` está activo (ventana async, solo para scripts con `src`), CUALQUIER
otro código de la página que llame `document.addEventListener` durante esa misma ventana también
quedaría redirigido al `shadow` equivocado — interferencia cruzada entre el LivePreview de un
componente y hidratación de OTRO componente en la misma página. Se investigó un error de consola
real en la página de Gallery (`Failed to fetch dynamically imported module:
astro:scripts/before-hydration.js`) sospechando que era este problema, pero se descartó: persiste
incluso con el dev server reiniciado limpio, y `Galeria.astro` **no tiene `<script>` propio** (el
camino con `src` nunca se activa para su canvas) — así que no puede ser causado por este parche.
Además, Announcement Banner (que monta el mismo `<Modal client:load />`) hidrata sin errores. Se
documenta como pendiente aparte en `CATALOG-STATUS.md`, no bloqueante — pero si en el futuro
aparece un caso real de interferencia cruzada, la ventana debería acotarse más (ej. reemplazar el
parche global por un `Proxy` de `document` inyectado solo en el scope de ESE script vía `new
Function('document', ...)`, en vez de reasignar el método global).

Verificado con `pnpm build` limpio + prueba real en el navegador: llenar Nombre/Correo/Mensaje de
Contact Section y hacer submit ahora muestra el mensaje de error inline documentado
(`.form-error-msg`, "Error al enviar. Intenta de nuevo.") en vez de navegar a `/api/submit-form/`
(404) — el `:::caution` de `contact-section.mdx` ya describía este comportamiento correctamente
(se escribió anticipando el fix, no hizo falta tocarlo). Sin regresión en Announcement Banner,
Modal, Slider ni la home (sin errores de consola nuevos en ninguna).
