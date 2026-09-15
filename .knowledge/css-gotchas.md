# Gotchas de CSS encontrados revisando componentes de `_library/`

Estos son patrones a **buscar activamente** al revisar el CSS de los componentes que faltan
(FeatureGrid, ProcessSteps, QuoteGrid, StatsPanel, AnnouncementBanner, ContactSection, Branches,
WhatsAppFab) — ya aparecieron una vez en `_library/`, es razonable que aparezcan de nuevo.

## `currentColor` para fondo Y contenido a la vez se auto-cancela

**Síntoma:** un botón/ícono se ve invisible (o con contraste raro) contra su propio fondo, sin
importar qué valor tenga la variable CSS de la que depende.

**Causa real, encontrada en el botón de cerrar de `Modal.svelte`:**
```css
.popup-actions button {
  color: var(--ida-color-main-first, #fff);
  background-color: currentColor; /* = el mismo color que `color` */
}
.popup-actions button::before, .popup-actions button::after {
  background-color: currentColor; /* = TAMBIÉN el mismo color */
}
```
El fondo del botón y las rayitas de la "X" (dibujadas con `::before`/`::after`) usan
`currentColor` — ambos terminan siendo **exactamente el mismo color**, sin importar qué valor
resuelva la variable. No hay ninguna combinación de valores donde esto tenga contraste.

**Fix aplicado:** separar explícitamente el color de fondo del color del "contenido" (lo que sea
que dibuje `currentColor` — texto, ::before/::after, etc.) — nunca depender de que
`currentColor` sea distinto de sí mismo:
```css
.popup-actions button {
  background-color: var(--popup-bg, #fff);
  color: var(--popup-text, #1a1a1a); /* ahora sí, distinto del fondo */
}
```

## `<textarea>algo</textarea>` con espacio/salto de línea entre las etiquetas

**Síntoma:** el `placeholder` de un `<textarea>` nunca se muestra, aunque el campo se vea
"vacío" a simple vista.

**Causa:** a diferencia de `<input>`, el contenido entre `<textarea>` y `</textarea>` en el HTML
se convierte en el **valor inicial real** del campo — no es decoración/indentación. Un salto de
línea + espacios de indentación ahí adentro (común al formatear código con el cierre en su
propia línea) se vuelve un valor no-vacío pero invisible (solo whitespace) — el navegador nunca
muestra el placeholder porque técnicamente el campo ya tiene contenido.

**Fix:** escribir la etiqueta de apertura y cierre pegadas, sin nada — ni siquiera un salto de
línea — entre `<textarea placeholder="...">` y `</textarea>`.

## `:root { ... }` NUNCA aplica dentro de un Shadow Root — usar `:host`

**Esta es la causa raíz más importante encontrada hasta ahora en todo el mecanismo de preview —
afecta a CUALQUIER componente de la Familia A (Container API + Shadow DOM), no solo a Slider.**

**Síntoma:** cualquier variable CSS custom definida en un bloque `:root { --foo: ... }` dentro
del `<style>` que se inyecta al Shadow Root simplemente no se aplica — `getComputedStyle(el)
.getPropertyValue('--foo')` devuelve un string vacío `""` dentro del shadow tree, sin ningún
error visible. Layouts que dependen de esas variables para `calc()`/altura/espaciado colapsan o
quedan mal alineados (ej. texto no centrado verticalmente en Slider — así se encontró, con la
extensión de Chrome, confirmando con `getComputedStyle` real que `--spaceSection` y
`--marginGlobal` estaban vacías pese a estar "definidas").

**Causa:** el selector `:root` matchea específicamente el elemento raíz del **documento**
(`<html>`) — nunca el árbol interno de un Shadow Root, que no tiene ese concepto. Esto afecta a
TRES fuentes de CSS a la vez en este mecanismo de preview:
1. `main.css` real de sitio-cms-mongo define ahí `--color-orange`, `--text-lg`, etc.
2. `swiper-bundle.css` (y cualquier otra librería de terceros) define ahí sus propias variables
   (`--swiper-theme-color`, etc.).
3. La propia paleta de ejemplo del catálogo (`SAMPLE_PALETTE_CSS`) también usaba `:root`.

Ninguna de esas tres fuentes fue escrita pensando en que terminaría dentro de un Shadow Root —
es un mismatch estructural del mecanismo de preview, no un bug de ninguna de ellas.

**Fix:** en `readEntryCss()` (`component-registry.ts`), después de concatenar TODO el CSS que va
al Shadow Root (main.css + paleta de ejemplo + CSS propio del componente + extraCss), se hace un
reemplazo de texto `:root` → `:host` sobre el resultado completo, antes de inyectarlo. `:host` es
el equivalente correcto para que las variables custom se hereden por todo el árbol del shadow
root, igual que `:root` lo haría en un documento normal. Un solo `.replace()`, aplica a las tres
fuentes a la vez, sin tener que tocar ninguna de ellas.

**Verificado con la extensión de Chrome** (no solo razonando sobre el CSS): antes del fix,
`--spaceSection` computaba a `""` dentro del shadow root; después del fix, computa al valor real
(`calc(4vw + (3vh * .8) + 2rem)`) y el layout de Slider quedó correctamente centrado — confirmado
con `getComputedStyle`/`getBoundingClientRect` reales, no una suposición.

**Regla para los componentes que faltan:** si algo de layout/spacing/color se ve raro en un
preview nuevo y "el CSS se ve bien" al leerlo, sospechar primero de esto — es fácil gastar tiempo
en teorías de flexbox/especificidad cuando la causa real es que la variable ni siquiera está
llegando al elemento. Verificar con `getComputedStyle(el).getPropertyValue('--nombre')` dentro
del shadow root antes de asumir cualquier otra causa.

## CSS scoped de Astro no matchea elementos creados por `document.createElement`

**Síntoma:** una clase CSS definida en el `<style>` de un componente `.astro` (ej.
`.lp-image-chip` en `LivePreview.astro`) simplemente no se aplica a un elemento que tiene
exactamente esa clase — sin error, el elemento cae a los estilos default del navegador (un `img`
sin tamaño se renderiza a sus dimensiones naturales, empujando el resto del layout).

**Causa:** el scoping de estilos de Astro funciona agregando un atributo `data-astro-cid-*` a
cada elemento del **template** en tiempo de build/SSR, y reescribiendo cada selector del
`<style>` para exigir ese mismo atributo. Un elemento creado después, del lado del cliente, con
`document.createElement(...)` (ej. los chips del control `'images'` de `LivePreview.astro`,
armados dinámicamente según cuántas imágenes suba el usuario) **nunca recibe ese atributo** — no
existía en el template, Astro no tiene forma de saber que debería tenerlo.

**Fix:** envolver esas reglas específicas en `:global(...)` dentro del mismo `<style>` scoped —
`:global(.lp-image-chip) { ... }` — así el selector compilado no exige el atributo de scope y
matchea el elemento sin importar cómo se creó. Solo hace falta para las clases que se aplican a
elementos creados por JS; las que vienen del template normal (ej. `.lp-clear-image`, ya
renderizado server-side) siguen scopeadas normalmente sin necesitarlo.

## `.fadeInOnScroll`/`[data-reveal]` dejan contenido invisible para siempre en el preview

**Síntoma:** un elemento se renderiza con el tamaño/posición correctos (confirmado con
`getBoundingClientRect()`) pero simplemente no se ve — `getComputedStyle(el).opacity` es `"0"`.
Encontrado con la columna de imágenes de Image-Text Split: las imágenes cargaban bien, con las
dimensiones correctas, pero quedaban invisibles.

**Causa:** `.fadeInOnScroll`/`[data-reveal]` (`main.css`) son un utility de reveal-on-scroll
compartido por TODO el sitio — arrancan en `opacity:0` a propósito, y un script global
(`site/src/utils/fx/fadeOnScroll.js`, un IntersectionObserver) los revela cuando entran al
viewport real. Ese script nunca corre en este mecanismo de preview (Container API, sin
`<script>`), así que cualquier elemento con estas clases se queda invisible para siempre. No es
específico de un componente — cualquier feature de `_library/` puede traerlas (ya se vio en
Slider, Gallery e Image-Text Split).

**Fix:** `REVEAL_ON_SCROLL_RESET_CSS` en `component-registry.ts`, agregado a **todas** las
entries dentro de `readEntryCss()` (no por componente) — fuerza `opacity:1 !important;
transform:none !important` sobre `.fadeInOnScroll`/`[data-reveal]`. Es el estado final real que
vería cualquier visitante después de hacer scroll, así que mostrarlo directo en el preview es
correcto, no una simulación.

## El canvas del preview necesita `min-height` SIEMPRE, `height` real solo a veces

**Síntoma real #1 (contenido recortado):** Image-Text Split con dos imágenes reales se veía con
la columna de imágenes completamente en blanco — el contenido real medía ~940px pero el canvas
tenía una altura fija de 480px con `overflow:hidden` en el contenedor, así que se recortaba
completo (la columna de texto, más corta, sí se alcanzaba a ver).

**Fix intentado primero (incompleto):** cambiar el canvas a `height:auto` por default, con
`height` fijo solo para componentes que lo declaren (`needsFixedCanvasHeight`, hoy solo Slider).
Esto arregló Image-Text Split pero **rompió Hero Badge** — su badge es `position:absolute`, así
que no aporta nada a la altura intrínseca de su contenedor; con `height:auto` y ningún otro
contenido en el flujo normal, el canvas colapsaba a 0px y el badge quedaba invisible (fuera del
área con `overflow:hidden`).

**Fix real:** el canvas necesita **ambas** cosas — `min-height: var(--lp-height)` SIEMPRE (piso,
para que contenido `position:absolute` o más chico que el alto configurado igual se vea), y
`height` real (no solo mínimo) SOLO cuando el componente lo necesita de verdad para su propia
cadena de `height:100%`/flex-stretch (Slider). `min-height` solo no le sirve a Slider porque esa
cadena necesita un valor de altura DEFINIDO, no un mínimo — y `height` fijo para todos rompe
cualquier componente cuyo contenido real pueda ser más alto que el configurado.
