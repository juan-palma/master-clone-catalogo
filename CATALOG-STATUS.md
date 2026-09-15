# Estado del catálogo — leer antes de empezar a trabajar aquí

Este documento existe para que una sesión nueva (Claude o developer humano) retome el trabajo
sin releer toda la conversación donde se construyó. Es documentación **de developer**, vive en
la raíz del repo — nunca se mezcla con el contenido de `src/content/docs/` (eso es lo que ve
quien consulta el catálogo).

**Regla de esta bitácora:** cuando un bug ya está corregido, no se documenta acá ni en las
páginas del catálogo — el `git log` es la fuente de verdad para "qué se arregló y cuándo". Este
archivo describe el estado y las decisiones de arquitectura *vigentes*, no un historial de fixes.

## Qué es este proyecto

Catálogo técnico de developer para las features de `_library/` del Master Clone
(`sitio-cms-mongo`, repo hermano bajo `sites/sitio-cms/`). Construido con Astro + Starlight.
Nunca debe copiarse ni vivir dentro de `sitio-cms-mongo` — un proyecto de cliente clonado desde
ahí no debe recibir este catálogo jamás.

## Arquitectura — decisiones vigentes

- **Lectura en vivo, nunca copia.** `src/content.config.ts` lee `cms/src/_library/*/manifest.json`
  de `sitio-cms-mongo` con el loader `glob()` de Astro, apuntando a una ruta absoluta —
  `astro.config.mjs` genera la sidebar por categoría con el mismo mecanismo. Página
  **"Estado en vivo de `_library/`"** (`src/pages/estado-en-vivo.astro`) tabula esos manifests.
- **Preview en vivo real, no simulado — dos mecanismos distintos según el tipo de componente:**
  - **Componentes Astro puros** (sin JS de cliente propio — HeroBadge, Slider, y así seguirá
    para FeatureGrid/ImageTextSplit/ProcessSteps/QuoteGrid/StatsPanel/AnnouncementBanner/
    ContactSection/Branches/WhatsAppFab): `src/lib/component-registry.ts` +
    `src/pages/api/render/[id].ts`, usando la **Container API de Astro**
    (`experimental_AstroContainer`) para re-renderizar el componente real server-side con props
    nuevas en cada cambio de un control. `src/components/LivePreview.astro` es el wrapper
    genérico — un registro nuevo en `component-registry.ts` es todo lo que hace falta para un
    componente nuevo de este tipo.
  - **Componentes de framework** (Svelte — Modal y Gallery hechos): el registro genérico +
    Container API también puede producir su HTML estático (tab "Preview") si se le registra
    explícitamente el renderer del framework (ver `astro-build-gotchas.md`), pero eso NUNCA
    incluye interactividad real (sin `<script>`/`onMount`). Cuando el componente necesita
    demostrarse funcionando de verdad, va un componente bespoke aparte
    (`ModalPreview.astro`, `GalleryInteractiveDemo.astro`) que monta la versión real con su
    ciclo de vida completo: Modal se controla llamando a su API imperativa (`openPopup()`) vía
    un `client:load` normal; Gallery necesita re-montarse (`mount()`/`unmount()` de `'svelte'`,
    no un directive `client:*`) cada vez que cambian sus imágenes, porque sus props no se
    pueden actualizar en un Island ya hidratado. Ninguno encaja en el registro genérico.
- **Aislamiento de CSS: Shadow DOM, no `<iframe>`.** Se probó con iframe primero y se descartó
  — máx-width/breakpoints del propio componente real quedaban rotos por CSS ajeno de Starlight,
  además del costo/fragilidad general de iframes. `LivePreview.astro` usa
  `attachShadow({mode:'open'})` cliente-side: aislamiento real de CSS en ambas direcciones, sin
  documento/contexto de navegación aparte.
- **`MASTER_CLONE_PATH` en `.env`, no `import.meta.url`.** Cualquier módulo que se ejecute
  SSR (páginas, endpoints — no `astro.config.mjs`, ese sí puede usar `import.meta.url` sin
  problema porque nunca se re-empaqueta) debe resolver la ruta a `sitio-cms-mongo` vía
  `import.meta.env.MASTER_CLONE_PATH`, nunca calculándola con `import.meta.url` — Vite mueve
  esos módulos a `dist/server/...` en build y una ruta relativa calculada en runtime deja de
  apuntar a donde debería.
- **`output: 'server'` + `@astrojs/node`.** Necesario para que `/api/render/[id]` funcione
  (POST dinámico) — las páginas de docs siguen pre-generándose como estático de todas formas
  (Starlight las marca `prerender` internamente).

## Estructura de página — framework fijo para cada componente

Definido y aplicado en `hero-badge.mdx`/`slider.mdx` (familia Container API), `modal.mdx`
(familia isla/bespoke pura) y `gallery.mdx` (híbrido: Container API para el tab Preview estático
+ un bloque bespoke aparte para la hidratación real). Aplicar igual a cualquier página nueva:

1. Callout "Base reutilizable, no un contrato"
2. ¿Qué es?
3. ¿Cuándo usarlo?
4. Cómo activarlo
5. **Parámetros** — tabla única y completa (props/campos de CMS, o parámetros de función para
   los que se controlan por código)
6. **Preview, uso y código** — un solo bloque con pestañas: Preview (interactivo) / Uso (snippet
   de invocación real) / HTML (solo familia Container API) / CSS
7. Notas técnicas (implementación, gotchas vigentes — nunca changelog de fixes ya resueltos)

## Layout de Starlight — overrides en `src/styles/custom.css`

Tres fixes reales al tema default de Starlight, todos con su razón documentada ahí mismo:
`--sl-content-width` (evitar columna derecha sobre-expandida), `.main-pane { isolation: auto }`
(evitar que atrape el z-index de overlays reales como Modal), y el ancho/centrado simétrico de
las 3 columnas (`.right-sidebar-container` + `--sl-content-margin-inline`). Ver también memoria
`starlight_three_column_layout_fix` — el usuario pidió explícitamente guardar ese patrón para
reusarlo en futuros proyectos con la misma forma de IA (nav izq / contenido centro / submenú
derecha).

## Pendiente real

- **Los 5 componentes con `manifest.json` que faltaban ya están completos**: ContactSection
  (family B bespoke, form real interceptado — ver `.knowledge/live-preview-architecture.md`),
  Branches (family A, fixture fijo de `contacts[]` por sucursal documentado en su propia página),
  WhatsAppFab (family A, `position:fixed` real contenido en el preview vía `extraCss` — ver su
  página). No queda ningún componente activo/con manifest sin su página en este catálogo.
- `product-menu` queda documentado como pendiente de decisión de diseño (dos implementaciones
  sin reconciliar) — no construirle preview hasta que eso se resuelva.
- Slider tiene una limitación conocida documentada en su propia página (deformación de imagen
  sin `settings.absolutePosition` activo) — pendiente para una revisión futura del componente
  real, no algo a resolver en el catálogo.
- **Error de consola en la página de Gallery** (`Failed to fetch dynamically imported module:
  astro:scripts/before-hydration.js`), reproducible incluso con dev server limpio — investigado
  y descartado como causado por el fix de scripts embebidos de 2026-09-15 (`Galeria.astro` no
  tiene `<script>` propio, ese camino no se activa para su canvas; Announcement Banner, que monta
  el mismo `<Modal client:load />`, no tiene el error; tampoco se repitió en Branches ni
  WhatsAppFab). No bloquea el uso real del preview (funciona visualmente), pero queda sin causa
  raíz confirmada.
- Sin repo git todavía — en proceso (usuario creando el remoto).
