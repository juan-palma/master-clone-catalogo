# Gotchas de build/rutas cross-repo encontrados construyendo este catálogo

## `import.meta.url` para resolver rutas cross-repo funciona en dev, se rompe en build

**Síntoma:** `readFileSync` u otra lectura de archivo cross-repo lanza `ENOENT` — pero solo en
`pnpm build` / al correr el server compilado, nunca en `pnpm dev`.

**Causa:** en cualquier módulo que se ejecute como parte de una página o endpoint SSR (no en
`astro.config.mjs`, que corre directo desde su ubicación real siempre), Vite MUEVE ese módulo a
`dist/server/.../chunk-XXXX.mjs` durante el build. Si la ruta a `sitio-cms-mongo` se calcula con
`fileURLToPath(new URL('../../sitio-cms-mongo/...', import.meta.url))`, en dev `import.meta.url`
apunta al archivo fuente real (funciona), pero en el bundle de producción apunta a esa nueva
ubicación dentro de `dist/` — la ruta relativa calculada ya no llega a donde debería.

`astro.config.mjs` SÍ puede usar este patrón sin problema (nunca se re-empaqueta, siempre corre
desde su ubicación real) — el bug es específico de módulos importados por páginas/endpoints.

**Fix:** variable de entorno explícita. `MASTER_CLONE_PATH` en `.env` (ver `.env.example`),
leída vía `import.meta.env.MASTER_CLONE_PATH` — Vite la inlinea como constante en build time, no
es un cálculo de ruta en runtime. Ver `src/lib/component-registry.ts`.

Mismo patrón/problema que ya existía en `sitio-cms-mongo`: `scripts/library.mjs` resuelve la
ruta al master-clone vía `MASTER_CLONE_PATH`/`.library-source`, no vía rutas relativas mágicas.

## Dependencias compartidas (Svelte, gsap) — la versión que importa es la de ESTE catálogo

Cuando un componente de `_library/` importado cross-repo trae sus propias dependencias de npm
(ej. `Modal.svelte`/`Gallery.svelte` importan `svelte` y `gsap`), quien realmente compila e
hidrata ese `.svelte` en el navegador es el Vite/`@astrojs/svelte` **de este catálogo** — la
versión de `svelte` en `sitio-cms-mongo/site/package.json` es irrelevante en este proceso (solo
importa cuando ese sitio se compila/corre por su cuenta). Lo que sí importa: la versión de
`svelte` instalada acá debe caer dentro del **peer-range que pide la versión instalada de
`@astrojs/svelte`** — revisar `peerDependencies` en su `package.json` antes de fijar una versión
con `pnpm add -E`. Mismatch real encontrado (2026-09-14): `@astrojs/svelte@9.0.1` pide
`svelte@^5.43.6`, este catálogo tenía `5.36.5` fijado (copiado de `sitio-cms-mongo` sin verificar
el peer-range) — compilaba sin error, pero **fallaba en runtime** al hidratar cualquier
componente Svelte real (`client:load`) con `TypeError: Cannot read properties of null (reading
'u')` dentro de `Module.init` — sin ningún mensaje que apunte a la causa real. Fix: `pnpm add -E
svelte@<versión dentro del peer-range>` + reiniciar el dev server (el caché de dependencias de
Vite no siempre invalida solo con guardar `package.json`; si el error persiste tras el bump,
borrar `node_modules/.vite` y reiniciar `astro dev`).

## Container API no trae renderers de framework registrados

**Síntoma:** `container.renderToString()` sobre un componente Astro que envuelve un `.svelte`
(ej. `Galeria.astro` → `Gallery.svelte`) lanza `NoMatchingRenderer: Unable to render... No valid
renderer was found for the .svelte file extension`, aunque `astro.config.mjs` sí tiene el
integration `svelte()` registrado.

**Causa:** un `astro dev`/`astro build` normal arma la lista de renderers automáticamente a
partir de las integrations del config — `experimental_AstroContainer.create()` NO lee
`astro.config.mjs`, hay que pasarle los renderers ya cargados explícitamente.

**Fix** (ver `renderEntry()` en `src/lib/component-registry.ts`):
```ts
const { getContainerRenderer } = await import('@astrojs/svelte/container-renderer');
const spec = getContainerRenderer(); // { name, clientEntrypoint, serverEntrypoint }
const mod = await import(/* @vite-ignore */ spec.serverEntrypoint); // '@astrojs/svelte/server.js'
const renderer = { ...spec, ssr: mod.default };
const container = await AstroContainer.create({ renderers: [renderer] });
```
El paquete de cada integration de framework expone su propio `<paquete>/container-renderer` con
esta forma (confirmado con `@astrojs/svelte`; otros frameworks oficiales de Astro siguen el mismo
patrón). Se cachea la promesa del renderer cargado — no depende de qué entry se esté renderizando.

## El renderer de `@astrojs/svelte` para Container API pierde el `<style>` del componente

**Síntoma:** el HTML que devuelve `container.renderToString()` para un componente que envuelve
un `.svelte` con estilos scoped (ej. `Galeria.astro` → `Gallery.svelte`) trae las clases
correctas en el markup (`class="idaColumns svelte-xxxx"`) pero el `<style>` real del componente
no está en ningún lado del HTML — el grid se ve sin ninguno de sus estilos propios (`display:flex`
nunca llega a aplicarse, por ejemplo).

**Causa:** `renderToStaticMarkup()` de `@astrojs/svelte/server.js` llama a `render()` de
`svelte/server` y solo usa `result.body` para armar el HTML — descarta cualquier `<style>` que
Svelte hubiera puesto aparte (en un build/página real de Astro, ese CSS se recolecta e inyecta en
el `<head>` de la página por un paso distinto del pipeline normal que la Container API, al
renderizar aislado, no ejecuta).

**Fix aplicado** (`extractSvelteStyle()` en `component-registry.ts`): leer el `.svelte` FUENTE
directo con `readFileSync` y extraer con una regex simple el contenido entre `<style>` y
`</style>`, tal cual (sin el hash de scope). Como el HTML SSR ya trae tanto la clase con hash
como la bare (`idaColumns svelte-xxxx`), un selector sin hash (`.idaColumns{...}`) sigue
matcheando el elemento igual de bien. Se agrega al CSS del Shadow Root vía `extraCss` en el
registro de esa entry.

## Svelte 5: `new Component({target, props})` ya no existe

**Síntoma:** montar un componente Svelte a mano (fuera de un directive `client:*` de Astro, ej.
para poder re-montarlo con props nuevos — ver `GalleryInteractiveDemo.astro`) con la API de clase
de Svelte 4 (`new GalleryClass({ target, props })`) lanza en runtime `Error:
https://svelte.dev/e/component_api_invalid_new`.

**Causa:** Svelte 5 (en modo runes, que es lo que produce el compilador por default) reemplazó la
API de clase por funciones imperativas — el componente compilado ya no es "instanciable" con
`new`.

**Fix:** usar `mount(Component, { target, props })` / `unmount(instance)` del paquete `svelte`
(export de nivel superior). El componente puede seguir escrito en sintaxis legacy (`export let
prop`) — Svelte 5 lo sigue aceptando, solo cambia la API externa de montaje manual.
