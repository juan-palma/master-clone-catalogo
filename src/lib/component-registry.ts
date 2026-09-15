import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Registro explícito de qué componente real (cross-repo, nunca copiado), qué
// CSS necesita, y qué controles editables tiene el preview en vivo de cada
// feature. A propósito NO se deriva automáticamente de manifest.json — cada
// feature tiene su propia forma de props/datos de muestra reales, y adivinarlo
// genera falsos positivos (ver hallazgo de hero-badge/manifest.json con
// formato viejo). Se agrega una entrada por feature conforme se construye su
// preview.

export type Control =
	| { name: string; label: string; type: 'text' }
	/** Varias líneas — cada línea no vacía se vuelve un párrafo (nodo lexical)
	 * distinto al renderizar, para poder demostrar richText de verdad (varios
	 * párrafos) sin construir un editor completo. */
	| { name: string; label: string; type: 'textarea' }
	| { name: string; label: string; type: 'checkbox' }
	| { name: string; label: string; type: 'select'; options: string[] }
	/** Input de archivo — el cliente lo convierte a { url, width, height } (data: URL +
	 * dimensiones reales leídas del archivo) antes de mandarlo al endpoint de render. */
	| { name: string; label: string; type: 'image' }
	/** Como 'image' pero de varios — el cliente arma un array de { url, width, height }
	 * (una por archivo agregado, orden de inserción), con botón individual para quitar
	 * cada una. Para campos tipo `hasMany` de una collection de imágenes (ej. Gallery). */
	| { name: string; label: string; type: 'images' }
	/**
	 * Arreglo de sub-documentos editables (ej. `items[]` de Feature Grid o
	 * Process Steps) — cada uno con sus propios campos (`fields`), agregable y
	 * quitable sin límite desde el preview, para demostrar de verdad que es un
	 * campo `hasMany` del CMS (no un número fijo de slots). `itemLabel` nombra
	 * el botón de agregar (ej. "Agregar paso"). El cliente arma un array de
	 * objetos `Record<string, string | UploadedImage | null>` (una entrada por
	 * `fields[].name`) — reordenar con arrastre no está implementado en este
	 * preview (si hace falta demostrarlo, el admin real de Payload sí lo trae).
	 */
	| { name: string; label: string; type: 'repeater'; itemLabel: string; fields: RepeaterField[] };

export type RepeaterField =
	| { name: string; label: string; type: 'text' }
	| { name: string; label: string; type: 'textarea' }
	| { name: string; label: string; type: 'image' }
	| { name: string; label: string; type: 'select'; options: string[] };

/** Forma que produce el control 'image' del lado del cliente. */
export interface UploadedImage {
	url: string;
	width: number;
	height: number;
}

export interface RegistryEntry {
	name: string;
	component: () => Promise<{ default: unknown }>;
	/** Rutas absolutas (resolver con resolveMongoPath) a los .css que el componente necesita. */
	cssFiles: string[];
	controls: Control[];
	/** Valor inicial de cada control (una entrada por `control.name`) — primer render y valores default del form. */
	initialControlValues: Record<string, unknown>;
	/**
	 * Construye los props REALES del componente a partir de los valores actuales
	 * de los controles. Para un componente de props planas (ej. HeroBadge) puede
	 * ser tan simple como `(v) => v` — pero la mayoría de los componentes
	 * CMS-shaped (Slider, FeatureGrid...) tienen props anidados (`sliders.docs[0].
	 * styles.background_color`, arrays de `items[]`, richText de Lexical) que un
	 * merge superficial no puede producir. Este closure cierra sobre su propio
	 * fixture base y solo inyecta los valores editables donde corresponda.
	 */
	buildProps: (controlValues: Record<string, unknown>) => Record<string, unknown>;
	/** Snippet realista de cómo se ve invocado en código real — se muestra en la doc. */
	usageExample: string;
	/**
	 * CSS estructural extra SOLO para que el preview se vea correcto — nunca CSS
	 * real del componente (por eso no se incluye en la pestaña "CSS" de la doc,
	 * ver readOwnCss). Existe porque el mecanismo de preview solo puede ejecutar
	 * de verdad el <script> de un componente cuando NO importa una librería
	 * externa (ver .knowledge/live-preview-architecture.md, sección "Scripts
	 * embebidos sin imports externos") — para Slider, cuyo <script> hace `import
	 * Swiper from "swiper"`, sigue sin correr, así que cualquier CSS que ese
	 * script normalmente cargaría (el propio paquete swiper no define altura en
	 * <astro-swiper> ni en .swiper mismo, solo en .swiper-wrapper) hay que
	 * aportarlo a mano.
	 */
	extraCss?: string;
	/**
	 * Oculta el canvas del tab "Preview" (el grid/HTML estático que arma la
	 * Container API) sin dejar de renderizarlo — sigue disparando
	 * `livepreview:update` normal, solo no se muestra. Para componentes con un
	 * demo bespoke aparte (ej. Gallery + GalleryInteractiveDemo) que ya muestran
	 * el resultado real más abajo: ver ese estático Y el real duplica la misma
	 * grilla sin aportar nada — el usuario lo pidió explícitamente para Gallery.
	 */
	hideCanvasPreview?: boolean;
	/**
	 * El canvas del preview usa `height` (no `min-height`) por default para que
	 * componentes tipo hero (Slider) cuya cadena de `height:100%`/flex-stretch
	 * necesita que sus ancestros tengan una altura DEFINIDA se vean bien. La
	 * mayoría de secciones (About, grids, etc.) NO son de altura fija — su
	 * contenido real puede ser más alto que el `height` del preview, y con
	 * `height` fijo + `overflow:hidden` del contenedor eso se recorta en vez de
	 * mostrarse completo. Poner `true` solo si el componente específicamente
	 * necesita una altura definida para verse bien (como Slider).
	 */
	needsFixedCanvasHeight?: boolean;
}

// NO usar import.meta.url para esto: funciona en `pnpm dev` pero se rompe en
// `pnpm build` — Vite mueve este módulo a dist/server/... y una ruta relativa
// calculada en tiempo de ejecución deja de apuntar a donde debería (bug real
// encontrado 2026-09-14). MASTER_CLONE_PATH viene de .env, inlineado por Vite
// en build time — se vuelve una constante, no un cálculo de ruta en runtime.
const MASTER_CLONE_PATH =
	import.meta.env.MASTER_CLONE_PATH ?? resolve(process.cwd(), '../sitio-cms-mongo');

/** Resuelve una ruta dentro de sitio-cms-mongo. */
function resolveMongoPath(relativeFromRepoRoot: string): string {
	return resolve(MASTER_CLONE_PATH, relativeFromRepoRoot);
}

/**
 * Extrae el bloque `<style>` de un `.svelte` fuente, tal cual, sin el hash de
 * scope de Svelte (`.idaColumns`, no `.idaColumns.svelte-xxxx`). Hace falta
 * porque el renderer de `@astrojs/svelte` para la Container API solo devuelve
 * el `body` del render — el `<style>` que Svelte normalmente inyecta en el
 * `<head>` de una página real se pierde en este mecanismo aislado (bug real
 * encontrado con Gallery: el grid de `Gallery.svelte` se veía sin su propio
 * CSS — `display:flex` nunca llegaba). El HTML SSR sí trae ambas clases
 * (`class="idaColumns svelte-152bn9a"`), así que un selector sin el hash
 * (`.idaColumns`) sigue matcheando el elemento igual de bien.
 */
function extractSvelteStyle(svelteFilePath: string): string {
	const source = readFileSync(svelteFilePath, 'utf-8');
	const match = source.match(/<style[^>]*>([\s\S]*?)<\/style>/);
	return match ? match[1] : '';
}

const MAIN_CSS = resolveMongoPath('site/src/assets/css/main.css');

/**
 * Slider nunca ejecuta su propio <script> en este mecanismo de preview (ver
 * .knowledge/live-preview-architecture.md — la Container API no empaqueta
 * scripts de componentes renderizados aislados), así que el `import
 * "swiper/css"` que trae ese script tampoco corre. Sin eso, `.swiper`/
 * `.swiper-wrapper` no tienen su estructura/altura base real. Se carga el CSS
 * de Swiper (misma versión exacta que sitio-cms-mongo/site/package.json)
 * directo, sin depender de que el script cargue. `import.meta.resolve` sigue
 * el export map real del paquete — no una ruta de pnpm hardcodeada que se
 * rompería al cambiar de versión.
 */
const SWIPER_BUNDLE_CSS = fileURLToPath(import.meta.resolve('swiper/swiper-bundle.css'));

// Paleta + tokens de espaciado de ejemplo — NO son los de ningún proyecto
// real, son los mismos valores neutros de data/_seed/general-site.*.json del
// master-clone (generateCssVariables.ts los emite como --nombre literal, sin
// prefijo). Cada proyecto de cliente tiene los suyos; esto es solo para que
// el preview se vea intencional, no roto.
//
// Los tokens de espaciado (--spaceSection, etc.) importan tanto como los
// colores: main.css los usa sin fallback en varias reglas del propio Slider
// (--ida-slider-swiper-space-in: calc(var(--spaceSection) * 0.45)) — sin
// definirlos, ese calc() queda inválido y CSS lo trata como si la propiedad
// no existiera, colapsando la altura real de .wrapContent y rompiendo el
// centrado vertical del texto. Bug real encontrado 2026-09-14 revisando por
// qué el preview de Slider no centraba el texto.
export const SAMPLE_PALETTE_CSS = `:root {
	--ida-color-main-first: #e27722;
	--ida-color-main-second: #433830;
	--ida-color-back-first: #211816;
	--ida-color-text-dark: #f4f1eb;
	--maxSizeMainContainer: 1440px;
	--marginGlobal: calc(4vw + ( 3vh * .6 ));
	--spaceSection: calc(4vw + (3vh * .8) + 2rem);
	--titleSize: calc(3vw + 2vh + 0.75rem);
	--textSize: 1.2rem;
	--lineHeight: 1.24;
}`;

/**
 * `.fadeInOnScroll`/`[data-reveal]` (main.css) arrancan en `opacity:0` a
 * propósito — un script global del sitio (`site/src/utils/fx/fadeOnScroll.js`,
 * un IntersectionObserver) los revela al hacer scroll. Ese script NUNCA corre
 * en este mecanismo de preview (Container API, sin `<script>` — ver
 * `.knowledge/live-preview-architecture.md`), así que cualquier elemento con
 * estas clases queda invisible para siempre, sin error visible — bug real
 * encontrado con la columna de imágenes de Image-Text Split (las imágenes SÍ
 * se renderizaban, con el tamaño correcto, pero opacity:0 las dejaba
 * invisibles). Se neutraliza para TODOS los componentes acá (no por
 * entry) porque estas clases son un utility de sitio compartido, no algo
 * específico de un componente — cualquier feature futuro puede traerlas.
 */
const REVEAL_ON_SCROLL_RESET_CSS = `
.fadeInOnScroll, [data-reveal] {
	opacity: 1 !important;
	transform: none !important;
}`;

function lexicalTextNode(text: string) {
	return { detail: 0, format: 0, mode: 'normal', style: '', text, type: 'text', version: 1 };
}

/** Nodo de párrafo o heading lexical — mismo shape que produce el editor real de Payload. */
function lexicalBlock(type: 'paragraph' | 'heading', text: string, tag?: string) {
	return {
		children: [lexicalTextNode(text)],
		direction: null,
		format: '',
		indent: 0,
		type,
		version: 1,
		...(type === 'paragraph' ? { textFormat: 0, textStyle: '' } : { tag }),
	};
}

/**
 * Fixture de richText real (varios bloques), aceptado por renderLexicalToHTML
 * — no es un editor completo, pero demuestra lo que el campo real SÍ soporta
 * (título + varios párrafos) sin construir un WYSIWYG. `bodyText` es texto de
 * varias líneas (de un <textarea>) — cada línea no vacía se vuelve su propio
 * párrafo, para que se pueda apreciar richText de verdad, no un solo string.
 */
function lexicalRichText(titleText: string, bodyText: string) {
	const children: unknown[] = [];
	if (titleText.trim()) children.push(lexicalBlock('heading', titleText.trim(), 'h2'));
	const paragraphs = bodyText
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	for (const p of paragraphs.length ? paragraphs : ['']) children.push(lexicalBlock('paragraph', p));
	return {
		root: { children, direction: null, format: '', indent: 0, type: 'root', version: 1 },
	};
}

export const registry: Record<string, RegistryEntry> = {
	'hero-badge': {
		name: 'Hero Badge',
		component: () => import('../../../sitio-cms-mongo/site/src/_library/hero-badge/HeroBadge.astro'),
		cssFiles: [resolveMongoPath('site/src/_library/hero-badge/HeroBadge.css')],
		controls: [{ name: 'text', label: 'Texto de la insignia', type: 'text' }],
		initialControlValues: { text: '100% artesanal · ' },
		buildProps: (v) => ({ text: v.text }),
		usageExample: `<HeroBadge text="100% artesanal · " />`,
	},

	slider: {
		name: 'Slider',
		component: () => import('../../../sitio-cms-mongo/site/src/_library/slider/Slider.astro'),
		// Slider no trae un .css propio — su estilo real vive repartido entre
		// main.css (reglas .swiper-slide...) y el CSS del propio paquete swiper
		// (nunca cargado por el <script> del componente en este mecanismo — ver
		// nota de SWIPER_BUNDLE_CSS arriba).
		cssFiles: [SWIPER_BUNDLE_CSS],
		// astro-swiper/.swiper: sin estilo propio, custom element inline por
		// default — sin esto la cadena de altura nunca arranca. (El resto de la
		// cadena de altura — .wrapItem/.containerSpaces/.wrapContent — SÍ
		// resuelve sola una vez que --spaceSection y compañía existen de verdad;
		// ver el fix :root→:host en readEntryCss. Un parche anterior acá que
		// forzaba height:100% en .wrapItem por una teoría de causa equivocada
		// se quitó tras confirmar con la extensión de Chrome que no hacía falta.)
		extraCss: `astro-swiper, .swiper { display: block; height: 100%; }`,
		// Único componente hasta ahora cuya cadena de height:100%/flex-stretch
		// necesita que el canvas tenga una altura DEFINIDA, no auto — ver el
		// comentario del campo en component-registry.ts.
		needsFixedCanvasHeight: true,
		controls: [
			{ name: 'titleText', label: 'Título (opcional — se renderiza como h2 real)', type: 'text' },
			{
				name: 'bodyText',
				label: 'Contenido (una línea = un párrafo — así se ve richText real de varios bloques)',
				type: 'textarea',
			},
			{ name: 'ctaText', label: 'Texto del botón', type: 'text' },
			{ name: 'ctaLink', label: 'Link del botón', type: 'text' },
			{ name: 'mainImage', label: 'Imagen principal (columna)', type: 'image' },
			{
				name: 'maxWidth',
				label: 'Ancho máximo de la imagen — ⚠️ ver Notas técnicas, bug real conocido',
				type: 'text',
			},
			{
				name: 'hoverImage',
				label: 'Imagen de hover (capa de paralax — ver pestaña Uso)',
				type: 'image',
			},
			{
				name: 'hoverPosition',
				label: 'Posición de la imagen de hover',
				type: 'select',
				options: ['below', 'on'],
			},
			{ name: 'backgroundImage', label: 'Imagen de fondo (full-bleed, detrás de todo)', type: 'image' },
			{
				name: 'backgroundVideoUrl',
				label: 'URL de video de fondo (opcional, externo)',
				type: 'text',
			},
			{ name: 'backgroundColor', label: 'Color de fondo', type: 'text' },
			{ name: 'titleColor', label: 'Color de título', type: 'text' },
			{ name: 'textColor', label: 'Color de texto', type: 'text' },
			{ name: 'overlayColor', label: 'Color de overlay (opcional)', type: 'text' },
			{
				name: 'justifyBlock',
				label: 'Alineación del bloque',
				type: 'select',
				options: ['center', 'flex-start', 'flex-end', 'space-between', 'space-evenly'],
			},
			{
				name: 'justifyContent',
				label: 'Alineación del texto',
				type: 'select',
				options: ['center', 'flex-start', 'flex-end'],
			},
			{
				name: 'justifyImage',
				label: 'Alineación de la imagen',
				type: 'select',
				options: ['center', 'flex-start', 'flex-end'],
			},
			{ name: 'invertOrder', label: 'Invertir orden (texto/imagen)', type: 'checkbox' },
			{ name: 'equalWidth', label: 'Columnas de ancho igual', type: 'checkbox' },
			{ name: 'absolutePosition', label: 'Imagen en posición absoluta', type: 'checkbox' },
			{ name: 'oneColumnMobile', label: 'Una columna en mobile', type: 'checkbox' },
			{ name: 'oneColumnDesktop', label: 'Una columna en desktop', type: 'checkbox' },
			{ name: 'limitTo50', label: 'Limitar columnas a 50/50', type: 'checkbox' },
		],
		initialControlValues: {
			titleText: '',
			bodyText: 'próximamente',
			ctaText: '',
			ctaLink: '',
			mainImage: null,
			maxWidth: '',
			hoverImage: null,
			hoverPosition: 'below',
			backgroundImage: null,
			backgroundVideoUrl: '',
			backgroundColor: '#2a2d2c',
			titleColor: '#f4f3e7',
			textColor: '#f4f3e7',
			overlayColor: '',
			justifyBlock: 'center',
			justifyContent: 'center',
			justifyImage: 'center',
			invertOrder: false,
			equalWidth: false,
			absolutePosition: false,
			oneColumnMobile: false,
			oneColumnDesktop: false,
			limitTo50: true,
		},
		// Mismo shape que un slider real ya resuelto por Payload (locale plano, no
		// el objeto multi-locale de la DB cruda) — ver data/collections/sliders.json
		// del master-clone para el fixture "En construcción" del que sale esta base.
		buildProps: (v) => {
			const mainImage = v.mainImage as UploadedImage | null;
			const hoverImage = v.hoverImage as UploadedImage | null;
			const backgroundImage = v.backgroundImage as UploadedImage | null;
			return {
				sliders: {
					docs: [
						{
							name: 'Preview',
							info: lexicalRichText(String(v.titleText ?? ''), String(v.bodyText ?? '')),
							images: {
								mainImage: mainImage ? { ...mainImage, alt: 'Imagen de preview' } : undefined,
								maxWidth: v.maxWidth || undefined,
								hovers: hoverImage
									? [
											{
												hover: {
													image: { ...hoverImage, alt: 'Imagen de hover / paralax' },
													position: v.hoverPosition,
												},
											},
										]
									: [],
							},
							styles: {
								background_image: backgroundImage
									? { ...backgroundImage, alt: 'Imagen de fondo' }
									: undefined,
								background_color: v.backgroundColor,
								titleColor: v.titleColor,
								textColor: v.textColor,
								background_overlay_color: v.overlayColor || undefined,
								background_overlay_opacity: 50,
							},
							settings: {
								areas: 'inicio',
								justifyBlock: v.justifyBlock,
								justifyContent: v.justifyContent,
								justifyImage: v.justifyImage,
								absolutePosition: v.absolutePosition,
								active: true,
								equalWidth: v.equalWidth,
								invertOrder: v.invertOrder,
								limitTo50: v.limitTo50,
								oneColumnDesktop: v.oneColumnDesktop,
								oneColumnMobile: v.oneColumnMobile,
								callToAction: v.ctaText || undefined,
								ctaLink: (v.ctaText && v.ctaLink) || undefined,
								background_video_url: v.backgroundVideoUrl || undefined,
							},
						},
					],
				},
				options: {},
			};
		},
		usageExample: `<Slider\n\tsliders={{ docs: [sliderDoc] }}\n\toptions={{}}\n/>\n\n// sliderDoc: documento real de la collection \`sliders\` (ya resuelto por\n// Payload al locale actual) — ver data/collections/sliders.json.\n// El carrusel en sí (cuando hay 2+ sliders activos en la misma área) lo\n// maneja Swiper (swiperjs.com) — Slider expone TODAS sus opciones vía el\n// objeto \`options.slider\`, no solo lo que ves en este preview.`,
	},

	gallery: {
		name: 'Gallery',
		component: () => import('../../../sitio-cms-mongo/site/src/_library/gallery/Galeria.astro'),
		// Galeria.css solo estiliza el wrapper (h2/texto) — la grilla en sí vive en
		// el <style> propio de Gallery.svelte. La Container API NO lo incluye en
		// el HTML que devuelve (ver extractSvelteStyle) — se agrega a mano vía
		// extraCss abajo.
		cssFiles: [resolveMongoPath('site/src/_library/gallery/Galeria.css')],
		extraCss: extractSvelteStyle(resolveMongoPath('site/src/_library/gallery/Gallery.svelte')),
		// El grid real ya se muestra abajo, hidratado de verdad, en
		// GalleryInteractiveDemo — mostrar también la versión estática acá sería
		// la misma grilla duplicada sin aportar nada (pedido explícito del
		// usuario). El tab sigue existiendo para Uso/HTML/CSS.
		hideCanvasPreview: true,
		controls: [
			{ name: 'h2', label: 'Título', type: 'text' },
			{
				name: 'bodyText',
				label: 'Texto (una línea = un párrafo — richText real)',
				type: 'textarea',
			},
			{ name: 'galleryImages', label: 'Imágenes de la galería', type: 'images' },
		],
		initialControlValues: {
			h2: 'Galería',
			bodyText: 'Sube algunas imágenes para ver la grilla real con su efecto de scroll.',
			galleryImages: [],
		},
		// Mismo shape que produce Payload para un campo `hasMany` de la collection
		// `gallery` (upload) ya resuelto — cada imagen necesita `alt` porque es un
		// campo requerido real de esa collection (ver cms/src/_library/gallery/collection.ts).
		buildProps: (v) => {
			const images = (v.galleryImages as UploadedImage[] | undefined) ?? [];
			return {
				data: {
					h2: v.h2,
					text: lexicalRichText('', String(v.bodyText ?? '')),
					galleryImage: images.map((img, i) => ({ ...img, alt: `Imagen de galería ${i + 1}` })),
				},
			};
		},
		usageExample: `<Galeria data={data} />\n\n// data: { h2, text: richText, galleryImage: Media[] } — mismo shape que\n// produce un global-section con un campo \`hasMany\` apuntando a la\n// collection \`gallery\`. Este Master Clone no trae ese campo montado en\n// ningún global hoy (ver Notas técnicas) — hay que agregarlo para usar el\n// feature en un proyecto real.`,
	},

	'image-text-split': {
		name: 'Image-Text Split',
		component: () =>
			import('../../../sitio-cms-mongo/site/src/_library/image-text-split/ImageTextSplit.astro'),
		cssFiles: [resolveMongoPath('site/src/_library/image-text-split/ImageTextSplit.css')],
		controls: [
			{ name: 'saludo', label: 'Saludo (etiqueta pequeña arriba del título)', type: 'text' },
			{ name: 'h2', label: 'Título', type: 'text' },
			{
				name: 'bodyText',
				label: 'Texto (una línea = un párrafo — richText real)',
				type: 'textarea',
			},
			{ name: 'destacado', label: 'Destacado (línea final, con separador)', type: 'text' },
			{ name: 'ctaText', label: 'Texto del botón', type: 'text' },
			{ name: 'ctaLink', label: 'Link del botón', type: 'text' },
			{ name: 'images', label: 'Imágenes (columna izquierda)', type: 'images' },
		],
		initialControlValues: {
			saludo: 'Sobre nosotros',
			h2: 'Nuestra historia',
			bodyText:
				'Sube algunas imágenes para ver la columna de galería real.\nCada línea de este campo es un párrafo real (richText), no una sola línea de texto plano.',
			destacado: '',
			ctaText: '',
			ctaLink: '',
			images: [],
		},
		// Mismo shape que produce Payload para el campo `images` (array de
		// sub-documentos `{ image: Media }`, no un array plano de Media) del
		// global-section real — ver ImageTextSplit.astro línea 18.
		buildProps: (v) => {
			const images = (v.images as UploadedImage[] | undefined) ?? [];
			return {
				id: 'image-text-split',
				data: {
					saludo: v.saludo || undefined,
					h2: v.h2 || undefined,
					text: lexicalRichText('', String(v.bodyText ?? '')),
					destacado: v.destacado || undefined,
					cta_text: v.ctaText || undefined,
					cta_link: (v.ctaText && v.ctaLink) || undefined,
					images: images.map((img, i) => ({ image: { ...img, alt: `Imagen ${i + 1}` } })),
				},
			};
		},
		usageExample: `<ImageTextSplit id="image-text-split" data={data} />\n\n// data: { saludo, h2, text: richText, destacado, cta_text, cta_link,\n// images: [{ image: Media }] } — mismo shape que un campo \`imageTextSplit\`\n// en un global (ej. PageHome). Este Master Clone no trae ese campo montado\n// hoy (ver Notas técnicas) — hay que agregarlo para usar el feature en un\n// proyecto real.`,
	},

	'feature-grid': {
		name: 'Feature Grid',
		component: () => import('../../../sitio-cms-mongo/site/src/_library/feature-grid/FeatureGrid.astro'),
		cssFiles: [resolveMongoPath('site/src/_library/feature-grid/FeatureGrid.css')],
		controls: [
			{ name: 'variant', label: 'Variante', type: 'select', options: ['cards', 'list'] },
			{ name: 'saludo', label: 'Saludo (etiqueta pequeña arriba del título)', type: 'text' },
			{ name: 'h2', label: 'Título', type: 'text' },
			{
				name: 'introText',
				label: 'Texto de introducción (una línea = un párrafo — richText real)',
				type: 'textarea',
			},
			{ name: 'frase', label: 'Frase de cierre (opcional, debajo del grid)', type: 'text' },
			{
				name: 'items',
				label: 'Ítems',
				type: 'repeater',
				itemLabel: 'ítem',
				fields: [
					{ name: 'icon', label: 'Ícono', type: 'image' },
					{ name: 'h3', label: 'Título', type: 'text' },
					{ name: 'text', label: 'Texto (richText)', type: 'textarea' },
				],
			},
		],
		initialControlValues: {
			variant: 'cards',
			saludo: 'Qué ofrecemos',
			h2: 'Nuestros servicios',
			introText: 'Sube un ícono en cada ítem para ver el grid real completo.',
			frase: '',
			items: [
				{ icon: null, h3: 'Rápido', text: 'Un párrafo real de ejemplo para el primer ítem.' },
				{ icon: null, h3: 'Confiable', text: 'Un párrafo real de ejemplo para el segundo ítem.' },
				{ icon: null, h3: 'A tu medida', text: 'Un párrafo real de ejemplo para el tercer ítem.' },
			],
		},
		// Mismo shape que produce Payload para un campo `hasMany` de items (cada
		// uno con su propio richText) — ver FeatureGrid.astro. `subtitle`/
		// `tagline`/`cta_text`/`cta_link` son campos reales del schema que no se
		// exponen acá como control individual (ver Notas técnicas de la doc). El
		// control 'repeater' deja agregar/quitar ítems sin límite desde el
		// preview mismo — no un número fijo de slots.
		buildProps: (v) => {
			const items = (v.items as { icon: UploadedImage | null; h3: string; text: string }[] | undefined) ?? [];
			return {
				id: 'feature-grid',
				data: {
					variant: v.variant,
					saludo: v.saludo || undefined,
					h2: v.h2 || undefined,
					text: lexicalRichText('', String(v.introText ?? '')),
					frase: v.frase || undefined,
					items: items.map((it, i) => ({
						icono: it.icon ? { ...it.icon, alt: `Ícono ${i + 1}`, mimeType: 'image/png' } : undefined,
						h3: it.h3 || undefined,
						text: lexicalRichText('', it.text),
					})),
				},
			};
		},
		usageExample: `<FeatureGrid id="feature-grid" data={data} />\n\n// data: { variant: 'cards' | 'list', saludo, h2, text: richText, frase,\n// items: [{ icono: Media, h3, text: richText, subtitle?, tagline?,\n// cta_text?, cta_link? }] } — mismo shape que un campo \`featureGrid\` en un\n// global (ej. PageHome). Este Master Clone no trae ese campo montado hoy\n// (ver Notas técnicas) — hay que agregarlo para usar el feature en un\n// proyecto real.`,
	},

	'process-steps': {
		name: 'Process Steps',
		component: () =>
			import('../../../sitio-cms-mongo/site/src/_library/process-steps/ProcessSteps.astro'),
		cssFiles: [resolveMongoPath('site/src/_library/process-steps/ProcessSteps.css')],
		controls: [
			{ name: 'saludo', label: 'Saludo (etiqueta pequeña arriba del título)', type: 'text' },
			{ name: 'h2', label: 'Título', type: 'text' },
			{
				name: 'items',
				label: 'Pasos',
				type: 'repeater',
				itemLabel: 'paso',
				fields: [
					{ name: 'h3', label: 'Título', type: 'text' },
					{ name: 'text', label: 'Texto (richText)', type: 'textarea' },
				],
			},
		],
		initialControlValues: {
			saludo: 'Cómo trabajamos',
			h2: 'Nuestro proceso',
			items: [
				{ h3: 'Contacto', text: 'Un párrafo real de ejemplo para el primer paso.' },
				{ h3: 'Diagnóstico', text: 'Un párrafo real de ejemplo para el segundo paso.' },
				{ h3: 'Propuesta', text: 'Un párrafo real de ejemplo para el tercer paso.' },
				{ h3: 'Ejecución', text: 'Un párrafo real de ejemplo para el cuarto paso.' },
				{ h3: 'Entrega', text: 'Un párrafo real de ejemplo para el quinto paso.' },
			],
		},
		// Mismo shape que produce Payload para un campo `hasMany` de pasos — el
		// número de cada paso (`step-num`) lo calcula el propio componente por
		// índice, no es un campo del CMS. El control 'repeater' deja
		// agregar/quitar pasos sin límite desde el preview mismo (botón "+
		// Agregar paso" / "×" por ítem) — no un número fijo de slots.
		buildProps: (v) => {
			const items = (v.items as { h3: string; text: string }[] | undefined) ?? [];
			return {
				id: 'process-steps',
				data: {
					saludo: v.saludo || undefined,
					h2: v.h2 || undefined,
					items: items.map((it) => ({ h3: it.h3 || undefined, text: lexicalRichText('', it.text) })),
				},
			};
		},
		usageExample: `<ProcessSteps id="process-steps" data={data} />\n\n// data: { saludo, h2, items: [{ h3, text: richText }] } — mismo shape que\n// un campo \`processSteps\` en un global (ej. PageHome). El número de cada\n// paso lo calcula el propio componente por índice, no es un campo del CMS.\n// Este Master Clone no trae ese campo montado hoy (ver Notas técnicas) —\n// hay que agregarlo para usar el feature en un proyecto real.`,
	},

	'quote-grid': {
		name: 'Quote Grid',
		component: () => import('../../../sitio-cms-mongo/site/src/_library/quote-grid/QuoteGrid.astro'),
		cssFiles: [resolveMongoPath('site/src/_library/quote-grid/QuoteGrid.css')],
		controls: [
			{ name: 'saludo', label: 'Saludo (etiqueta pequeña arriba del grid)', type: 'text' },
			{
				name: 'items',
				label: 'Frases',
				type: 'repeater',
				itemLabel: 'frase',
				fields: [{ name: 'text', label: 'Texto (richText)', type: 'textarea' }],
			},
		],
		initialControlValues: {
			saludo: 'Lo que nos define',
			items: [
				{ text: 'Calidad sin atajos.' },
				{ text: 'Hecho para durar.' },
				{ text: 'Cercanía real, no de manual.' },
				{ text: 'Simple no es poco.' },
				{ text: 'Cada detalle cuenta.' },
			],
		},
		// Mismo shape que produce Payload para un campo `hasMany` de frases. El
		// control 'repeater' deja agregar/quitar frases sin límite desde el
		// preview mismo — no un número fijo de slots.
		buildProps: (v) => {
			const items = (v.items as { text: string }[] | undefined) ?? [];
			return {
				id: 'quote-grid',
				data: {
					saludo: v.saludo || undefined,
					items: items.map((it) => ({ text: lexicalRichText('', it.text) })),
				},
			};
		},
		usageExample: `<QuoteGrid id="quote-grid" data={data} />\n\n// data: { saludo, items: [{ text: richText }] } — mismo shape que un\n// campo \`quoteGrid\` en un global (ej. PageHome). Este Master Clone no trae\n// ese campo montado hoy (ver Notas técnicas) — hay que agregarlo para usar\n// el feature en un proyecto real.`,
	},

	'stats-panel': {
		name: 'Stats Panel',
		component: () => import('../../../sitio-cms-mongo/site/src/_library/stats-panel/StatsPanel.astro'),
		cssFiles: [resolveMongoPath('site/src/_library/stats-panel/StatsPanel.css')],
		controls: [
			{ name: 'saludo', label: 'Saludo (etiqueta pequeña arriba del título)', type: 'text' },
			{ name: 'h2', label: 'Título', type: 'text' },
			{
				name: 'introText',
				label: 'Texto de introducción (una línea = un párrafo — richText real)',
				type: 'textarea',
			},
			{
				name: 'checks',
				label: 'Checklist',
				type: 'repeater',
				itemLabel: 'ítem del checklist',
				// `item?.text` se usa como string plano en el componente real
				// (no pasa por renderLexicalToHTML) — por eso 'text', no
				// 'textarea'/richText, a diferencia de otros repeaters.
				fields: [{ name: 'text', label: 'Texto', type: 'text' }],
			},
			{ name: 'resultado', label: 'Resultado destacado (opcional)', type: 'text' },
			{ name: 'ctaText', label: 'Texto del botón', type: 'text' },
			{ name: 'ctaLink', label: 'Link del botón', type: 'text' },
			{ name: 'dashboardLabel', label: 'Panel — etiqueta superior', type: 'text' },
			{
				name: 'dashboard',
				label: 'Panel — filas',
				type: 'repeater',
				itemLabel: 'fila',
				fields: [
					{ name: 'label', label: 'Etiqueta', type: 'text' },
					{ name: 'value', label: 'Valor', type: 'text' },
					{ name: 'status', label: 'Estado', type: 'select', options: ['good', 'warn', 'bad'] },
				],
			},
		],
		initialControlValues: {
			saludo: 'Resultados reales',
			h2: 'Números que respaldan el trabajo',
			introText: 'Sube contenido real en el checklist y el panel para ver el layout completo.',
			checks: [
				{ text: 'Entrega a tiempo' },
				{ text: 'Soporte post-lanzamiento' },
				{ text: 'Código documentado' },
			],
			resultado: '',
			ctaText: '',
			ctaLink: '',
			dashboardLabel: 'Estado del proyecto',
			dashboard: [
				{ label: 'Uptime', value: '99.9%', status: 'good' },
				{ label: 'Tiempo de carga', value: '1.2s', status: 'warn' },
				{ label: 'Errores 500', value: '3', status: 'bad' },
			],
		},
		// Mismo shape que produce Payload para dos campos `hasMany` separados
		// (checklist y filas del panel) — ambos usan el control 'repeater', sin
		// límite de cantidad desde el preview.
		buildProps: (v) => {
			const checks = (v.checks as { text: string }[] | undefined) ?? [];
			const dashboard = (v.dashboard as { label: string; value: string; status: string }[] | undefined) ?? [];
			return {
				id: 'stats-panel',
				data: {
					saludo: v.saludo || undefined,
					h2: v.h2 || undefined,
					text: lexicalRichText('', String(v.introText ?? '')),
					items: checks.map((c) => ({ text: c.text })),
					resultado: v.resultado || undefined,
					cta_text: v.ctaText || undefined,
					cta_link: (v.ctaText && v.ctaLink) || undefined,
					dashboard_label: v.dashboardLabel || undefined,
					dashboard: dashboard.map((row) => ({ label: row.label, value: row.value, status: row.status })),
				},
			};
		},
		usageExample: `<StatsPanel id="stats-panel" data={data} />\n\n// data: { saludo, h2, text: richText, items: [{ text }], resultado,\n// cta_text, cta_link, dashboard_label, dashboard: [{ label, value,\n// status: 'good'|'warn'|'bad' }] } — mismo shape que un campo\n// \`statsPanel\` en un global (ej. PageHome). Este Master Clone no trae ese\n// campo montado hoy (ver Notas técnicas) — hay que agregarlo para usar el\n// feature en un proyecto real.`,
	},

	'announcement-banner': {
		name: 'Announcement Banner',
		component: () =>
			import('../../../sitio-cms-mongo/site/src/_library/announcement-banner/ElementListBanners.astro'),
		cssFiles: [resolveMongoPath('site/src/_library/announcement-banner/ElementListBanners.css')],
		// El CSS real está scopeado a `footer .anuncio` (pensado para vivir
		// dentro del <footer> del sitio) — el canvas del preview no envuelve el
		// componente en un <footer> real, así que se duplican las mismas reglas
		// sin ese ancestro para que se vea igual acá. Nunca se muestra en la
		// pestaña "CSS" de la doc (ver readOwnCss) — es de layout del preview,
		// no del componente.
		extraCss: `
			.anuncio { margin-top: 32px; text-align: center; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; font-family: 'Aleo'; }
			.anuncio button { appearance: none; border: 0px none transparent; background-color: inherit; font-family: 'Cormorant Garamond'; padding: 4px 14px; border-radius: 12px; cursor: pointer; transition: color 0.3s ease-in-out, background-color 0.3s ease-in-out; }
			.anuncio button:hover { color: var(--ida-color-links-over); background-color: var(--ida-color-fifth); }
		`,
		controls: [
			{ name: 'textButton', label: 'Texto del botón/link (visible)', type: 'text' },
			{ name: 'title', label: 'Título del Modal', type: 'text' },
			{ name: 'info', label: 'Contenido del Modal (una línea = un párrafo — richText real)', type: 'textarea' },
			{ name: 'callToAction', label: 'Texto del botón de acción dentro del Modal (opcional)', type: 'text' },
		],
		initialControlValues: {
			textButton: 'Aviso de privacidad',
			title: 'Aviso de privacidad',
			info: 'Usamos cookies para mejorar tu experiencia.\nPodés ajustar tus preferencias en cualquier momento.',
			callToAction: '',
		},
		// `data` es el documento completo de la collection `banners` (no un
		// objeto anidado con `id`) — ver ElementListBanners.astro línea 7.
		buildProps: (v) => ({
			data: {
				title: v.title,
				textButton: lexicalRichText('', String(v.textButton ?? '')),
				info: lexicalRichText('', String(v.info ?? '')),
				callToAction: v.callToAction || undefined,
			},
		}),
		usageExample: `<ElementListBanners data={bannerDoc} />\n\n// bannerDoc: documento real de la collection \`banners\` (ya resuelto por\n// Payload al locale actual) — { title, info: richText, callToAction,\n// textButton: richText, slug, type, active }. En el sitio real se monta\n// un <ElementListBanners> por documento activo, dentro de MainFooter.astro\n// — necesita Modal (_library/modal/) montado en la misma página para que\n// el clic tenga efecto visual.`,
	},

	'contact-section': {
		name: 'Contact Section',
		component: () => import('../../../sitio-cms-mongo/site/src/_library/contact-section/Contacto.astro'),
		cssFiles: [resolveMongoPath('site/src/_library/contact-section/Contacto.css')],
		controls: [
			{ name: 'sectionLabel', label: 'Etiqueta pequeña arriba del título', type: 'text' },
			{ name: 'h2', label: 'Título', type: 'text' },
			{
				name: 'introText',
				label: 'Texto de introducción (una línea = un párrafo — richText real)',
				type: 'textarea',
			},
			{ name: 'logoImage', label: 'Logo (opcional)', type: 'image' },
			{
				name: 'contacts',
				label: 'Métodos de contacto',
				type: 'repeater',
				itemLabel: 'método de contacto',
				fields: [
					{ name: 'type', label: 'Tipo', type: 'select', options: ['email', 'phone', 'whatsapp'] },
					{ name: 'text', label: 'Etiqueta (ej. "Escríbenos")', type: 'text' },
					{ name: 'value', label: 'Valor (ej. hola@ejemplo.com)', type: 'text' },
				],
			},
		],
		initialControlValues: {
			sectionLabel: 'Contacto',
			h2: 'Hablemos de tu proyecto',
			introText: 'Sube un logo para verlo en la columna izquierda.',
			logoImage: null,
			contacts: [
				{ type: 'email', text: 'Escríbenos', value: 'hola@ejemplo.com' },
				{ type: 'whatsapp', text: 'WhatsApp', value: '+52 55 0000 0000' },
			],
		},
		// El formulario (`form`) viene de una relación real a la collection del
		// plugin form-builder — no es contenido que se edite campo por campo
		// desde este componente, así que se deja como un fixture fijo (nombre/
		// correo/mensaje) para mostrar el layout real, no editable desde acá.
		// El envío real POSTea a /api/submit-form/, que no existe en este
		// catálogo (sin backend) — ver Notas técnicas de la doc.
		buildProps: (v) => {
			const contacts = (v.contacts as { type: string; text: string; value: string }[] | undefined) ?? [];
			const logo = v.logoImage as UploadedImage | null;
			return {
				data: {
					section_label: v.sectionLabel || undefined,
					h2: v.h2 || undefined,
					text: lexicalRichText('', String(v.introText ?? '')),
					images: { logo_footer: logo ? { ...logo, alt: 'Logo' } : undefined },
					contacts: contacts.map((c) => ({ type: c.type, text: c.text, value: c.value })),
					form: {
						id: 'preview-form',
						submitButtonLabel: 'Enviar mensaje',
						confirmationMessage: lexicalRichText('', '¡Gracias! Te contactaremos pronto.'),
						fields: [
							{ id: 'f1', blockType: 'text', label: 'Nombre', name: 'name', required: true },
							{ id: 'f2', blockType: 'email', label: 'Correo', name: 'email', required: true },
							{ id: 'f3', blockType: 'textarea', label: 'Mensaje', name: 'message', required: false },
						],
					},
				},
			};
		},
		usageExample: `<Contacto data={data} />\n\n// data: { section_label, h2, text: richText, images: { logo_footer },\n// contacts: [{ type: 'email'|'phone'|'whatsapp', text, value }], form: {\n// id, fields, submitButtonLabel, confirmationMessage }, privacyNote /\n// privacyNotice }. \`form\` es una relación real a la collection del plugin\n// @payloadcms/plugin-form-builder — no texto plano. Montado en\n// MainFooter.astro, con toggle en UIElements.contactSection.enabled.`,
	},

	branches: {
		name: 'Branches / Locations',
		component: () => import('../../../sitio-cms-mongo/site/src/_library/branches/Branches.astro'),
		cssFiles: [resolveMongoPath('site/src/_library/branches/Branches.css')],
		controls: [
			{
				name: 'branches',
				label: 'Sucursales',
				type: 'repeater',
				itemLabel: 'sucursal',
				fields: [
					{ name: 'name', label: 'Nombre', type: 'text' },
					{ name: 'address', label: 'Dirección (una línea = un párrafo — richText real)', type: 'textarea' },
					{ name: 'mapUrl', label: 'URL de mapa embebido (opcional)', type: 'text' },
				],
			},
			{ name: 'contactsLabel', label: 'Etiqueta sobre los contactos de cada sucursal', type: 'text' },
		],
		initialControlValues: {
			branches: [
				{ name: 'Sucursal Centro', address: 'Av. Ejemplo 123\nCol. Centro, CDMX', mapUrl: '' },
				{ name: 'Sucursal Norte', address: 'Blvd. Ejemplo 456\nCol. Norte, CDMX', mapUrl: '' },
			],
			contactsLabel: 'Contacto',
		},
		// `data` en el componente real es el ARRAY de sucursales directo (no un
		// objeto envolvente) — la collection completa (`branche`), no un campo
		// hasMany anidado dentro de otro doc. `contacts[]` por sucursal es a su
		// vez otro `hasMany` (relación a la collection `Contacts`) — el control
		// 'repeater' de este catálogo solo soporta un nivel de anidamiento, así
		// que se deja como fixture fijo por sucursal (2 contactos de ejemplo) en
		// vez de editable — NO es una limitación real de Payload (el admin real
		// sí permite editar hasMany-dentro-de-hasMany sin problema), es nada más
		// de este preview. Ver Notas técnicas.
		buildProps: (v) => {
			const branches = (v.branches as { name: string; address: string; mapUrl: string }[] | undefined) ?? [];
			return {
				data: branches.map((b) => ({
					name: b.name || undefined,
					address: lexicalRichText('', String(b.address ?? '')),
					mapUrl: b.mapUrl || undefined,
					contacts: [
						{ type: 'email', text: 'Escríbenos', value: 'sucursal@ejemplo.com' },
						{ type: 'phone', text: 'Teléfono', value: '+52 55 0000 0000' },
					],
				})),
				contactsLabel: v.contactsLabel || undefined,
			};
		},
		usageExample: `<Branches data={data} contactsLabel={contactsLabel} />\n\n// data: sucursales[] — el array completo de la collection 'branche'\n// (físicamente 'branches' en Mongo), no un campo anidado. Cada item:\n// { name, address: richText, mapUrl, contacts: [{ type, text, value }] }.\n// contactsLabel viene del global footer (branchesContactsLabel). Montado\n// en MainFooter.astro vía Footer.astro — se auto-oculta si no hay\n// sucursales.`,
	},

	'whatsapp-fab': {
		name: 'WhatsApp Floating Action Button',
		component: () => import('../../../sitio-cms-mongo/site/src/_library/whatsapp-fab/WhatsAppFab.astro'),
		cssFiles: [resolveMongoPath('site/src/_library/whatsapp-fab/WhatsAppFab.css')],
		// El CSS real usa `position: fixed` (a propósito — flota sobre TODO el
		// sitio, sin importar el scroll). `position:relative` en el canvas (ver
		// LivePreview.astro) NO crea un "containing block" para elementos
		// `fixed` — solo transform/filter/contain/etc. lo hacen — así que sin
		// este override el botón se saldría del preview y quedaría flotando
		// sobre la página real del catálogo (confuso, no refleja el componente,
		// solo una limitación de mostrar "fixed" dentro de una caja chica).
		// Nunca se muestra en la pestaña "CSS" de la doc (ver readOwnCss).
		extraCss: `#whats { position: absolute !important; right: 1rem !important; bottom: 1rem !important; }`,
		controls: [
			{ name: 'phone', label: 'Número de WhatsApp (con código de país, solo dígitos)', type: 'text' },
			{ name: 'iconImage', label: 'Ícono (opcional — sin esto usa el SVG genérico de WhatsApp)', type: 'image' },
		],
		initialControlValues: {
			phone: '525500000000',
			iconImage: null,
		},
		// `icon` se pasa TAL CUAL viene del campo `upload` de Payload (el doc de
		// Media completo) — ver Layout.astro línea ~110. TagPicture ya sabe leer
		// { url, width, height, alt } directo, mismo shape que produce nuestro
		// control 'image'.
		buildProps: (v) => {
			const icon = v.iconImage as UploadedImage | null;
			return {
				phone: v.phone || '',
				icon: icon ? { ...icon, alt: 'WhatsApp' } : undefined,
			};
		},
		usageExample: `<WhatsAppFab phone={dataUiElements.whatsappFab.phone} icon={dataUiElements.whatsappFab.icon} />\n\n// phone: string (solo dígitos, con código de país) — arma el link a\n// wa.me/{phone}. icon: Media opcional (fallback: SVG de WhatsApp\n// genérico incluido). Montado sitio-completo en Layout.astro, condicional\n// a UIElements.whatsappFab.enabled + que haya un phone cargado.`,
	},
};

// La Container API no recoge automáticamente los renderers de framework
// configurados en astro.config.mjs (a diferencia de un build/dev normal) —
// hay que cargarlo a mano y pasarlo a `AstroContainer.create()`. Necesario
// para Gallery (envuelve a Gallery.svelte); sin esto: "NoMatchingRenderer:
// Unable to render... No valid renderer was found for the .svelte file
// extension." Se cachea la promesa — cargar el renderer no depende de qué
// entry se esté renderizando.
let svelteRendererPromise: ReturnType<typeof loadSvelteRenderer> | null = null;
async function loadSvelteRenderer() {
	const { getContainerRenderer } = await import('@astrojs/svelte/container-renderer');
	const spec = getContainerRenderer();
	const mod = await import(/* @vite-ignore */ spec.serverEntrypoint);
	return { ...spec, ssr: mod.default };
}

export async function renderEntry(
	entry: RegistryEntry,
	props: Record<string, unknown>,
): Promise<string> {
	const { experimental_AstroContainer: AstroContainer } = await import('astro/container');
	const { default: Component } = await entry.component();
	svelteRendererPromise ??= loadSvelteRenderer();
	const container = await AstroContainer.create({ renderers: [await svelteRendererPromise] });
	return container.renderToString(Component, { props });
}

/**
 * CSS completo para el Shadow Root de este componente: el reset/tokens reales
 * de main.css + la paleta de ejemplo + el/los .css propios del componente.
 * Se re-lee del disco en cada llamada (no hay hot-reload de otra forma para
 * archivos fuera del proyecto de Astro) — sin costo real para un preview.
 *
 * `:root` NUNCA aplica dentro de un Shadow Root — ese selector solo matchea el
 * <html> del documento externo, jamás el árbol interno de un shadow tree. Sin
 * esto, CUALQUIER `:root{...}` (el propio main.css define ahí --color-orange,
 * --text-lg, etc.; swiper-bundle.css define ahí --swiper-theme-color; mi
 * propia paleta de ejemplo también usaba :root) queda completamente inerte —
 * las variables custom nunca se resuelven, sin error visible, solo caen a sus
 * fallbacks (o a nada si no tienen fallback). Bug real y grave encontrado
 * 2026-09-14 con la extensión de Chrome — confirmado con getComputedStyle
 * devolviendo string vacío para --spaceSection, --marginGlobal, etc. dentro
 * del shadow root, pese a estar "definidas". `:host` es el equivalente
 * correcto para un shadow root — se reemplaza a nivel de texto en vez de
 * exigir que cada fuente de CSS (main.css, swiper, la propia) use `:host` a
 * mano, ya que ninguna de esas fuentes fue escrita pensando en Shadow DOM.
 */
export function readEntryCss(entry: RegistryEntry): string {
	const mainCss = readFileSync(MAIN_CSS, 'utf-8');
	const full = `${mainCss}\n${SAMPLE_PALETTE_CSS}\n${REVEAL_ON_SCROLL_RESET_CSS}\n${readOwnCss(entry)}\n${entry.extraCss ?? ''}`;
	return full.replace(/:root(?![\w-])/g, ':host');
}

/** Solo el/los .css propios del componente — para mostrar en la pestaña de código (main.css es reset genérico, no aporta a entender ESTE componente). */
export function readOwnCss(entry: RegistryEntry): string {
	return entry.cssFiles.map((f) => readFileSync(f, 'utf-8')).join('\n');
}
