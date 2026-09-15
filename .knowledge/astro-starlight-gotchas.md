# Gotchas de Astro Starlight encontrados construyendo este catálogo

## `<Tabs>` rompe el contenido de `<template>`

**Síntoma:** un `<template set:html={...}>` puesto dentro de un `<TabItem>` llega **vacío** al
navegador — el JS cliente que espera leer `template.content` no encuentra nada.

**Causa:** `Tabs.astro` (de `@astrojs/starlight/components`) renderiza sus hijos a un string vía
`Astro.slots.render('default')`, lo pasa por su propio parser/serializador (`processPanels`,
`tabs-processor`) para armar los `<div role="tabpanel">` con las etiquetas ARIA correctas, y
reinyecta el resultado con `<Fragment set:html={html} />`. Ese pipeline de reparse-y-reserializar
no entiende el contenido "inerte" especial de `<template>` (a diferencia de HTML normal, que si
sobrevive — un `<Code>` de Starlight adentro de un TabItem funciona bien).

**Fix:** para pasar un payload de datos (HTML/CSS/JSON) desde el servidor al script cliente
cuando ese payload puede terminar dentro de un `<Tabs>`, usar
`<script type="application/json">{JSON.stringify(payload)}</script>` en vez de `<template>`. El
texto de un `<script>` es contenido de texto plano para cualquier parser HTML — sobrevive
cualquier reprocesamiento sin importar el motor usado. Escapar `<` como `<` en el JSON antes
de inyectarlo (`JSON.stringify(payload).replace(/</g, '\\u003c')`) para que una posible secuencia
`</script` dentro del HTML/CSS no cierre el tag antes de tiempo.

Ver `src/components/LivePreview.astro` para la implementación real.

## `isolation: isolate` en `.main-pane` atrapa el z-index de overlays reales

**Síntoma:** un componente con `position:fixed` + z-index alto (ej. `Modal.svelte`,
`z-index:10000`) renderizado dentro del contenido de una página de docs queda **detrás** de la
columna derecha ("En esta página") — clicks en esa zona no llegan al elemento fixed.

**Causa:** `TwoColumnContent.astro` le pone `isolation:isolate` a `.main-pane` (el contenedor del
contenido principal). Eso crea un nuevo contexto de apilamiento — cualquier z-index adentro
queda acotado a competir solo contra otros elementos DENTRO de `.main-pane`, nunca contra la
columna derecha, que vive fuera de ese contenedor.

**Fix:** override en `src/styles/custom.css` — `.main-pane { isolation: auto; }`. Confirmado que
no rompe nada más (el propósito original de esa regla en Starlight es contener temas/estilos de
plugins de terceros, no aplica a este catálogo).

## Columna derecha sobre-ancha + contenido no centrado

**Síntoma:** en monitores anchos, la columna de "En esta página" se ve enorme con espacio vacío
a su derecha, y el contenido central tiene más aire a su izquierda que a su derecha (no está
centrado).

**Causa:** Starlight reparte el espacio sobrante del viewport (más allá de `--sl-content-width`,
default 45rem) en dos mitades — la mitad ensancha `.right-sidebar-container` más de lo que su
propio contenido necesita, y la otra mitad queda como `margin-inline-start:auto` del contenido
(`margin-inline-end:0` fijo) — empuja el contenido a pegarse contra el TOC en vez de centrarlo.

**Fix**, en `src/styles/custom.css`:
```css
:root { --sl-content-width: 60rem; } /* antes 45rem */
@media (min-width: 72rem) {
  .right-sidebar-container { width: var(--sl-sidebar-width); }
  [data-has-sidebar][data-has-toc] .main-pane {
    width: calc(100% - var(--sl-sidebar-width));
    --sl-content-margin-inline: auto; /* antes "auto 0" */
  }
}
```
El usuario pidió explícitamente guardar este patrón para reusarlo en futuros proyectos con la
misma forma de IA (nav izq / contenido centro / submenú derecha) — ver también la memoria
`starlight_three_column_layout_fix` en el sistema de memoria de Claude.

## `max-width:100%` forzado en todo `<iframe>` de contenido markdown

Ya no aplica directamente (se abandonó el enfoque de iframe — ver `live-preview-architecture.md`)
pero queda documentado por si se vuelve a necesitar un iframe para algo: Starlight le pone
`.sl-markdown-content iframe { max-width:100%; height:auto }` a cualquier iframe embebido en
contenido — un `width` inline no lo anula, hace falta agregar `max-width:none` también.
