// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import node from '@astrojs/node';
import svelte from '@astrojs/svelte';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// Misma ruta que src/content.config.ts — leída en vivo, nunca copiada.
const LIBRARY_DIR = fileURLToPath(new URL('../sitio-cms-mongo/cms/src/_library', import.meta.url));
const DOCS_COMPONENTS_DIR = fileURLToPath(new URL('./src/content/docs/components', import.meta.url));

const CATEGORY_LABELS = {
	content: 'Contenido',
	media: 'Media',
	ui: 'UI',
	location: 'Ubicaciones',
	communication: 'Comunicación',
	navigation: 'Navegación',
};

// Agrupa la sidebar de "Componentes" por categoría real del manifest.json de cada
// feature — se genera en cada build/dev, así que nunca queda desincronizada de
// _library/ (mismo principio que la tabla de "Estado en vivo").
function buildComponentSidebarGroups() {
	/** @type {Record<string, string[]>} */
	const byCategory = {};

	for (const featureId of readdirSync(LIBRARY_DIR)) {
		const manifestPath = join(LIBRARY_DIR, featureId, 'manifest.json');
		const hasDoc =
			existsSync(join(DOCS_COMPONENTS_DIR, `${featureId}.md`)) ||
			existsSync(join(DOCS_COMPONENTS_DIR, `${featureId}.mdx`));
		if (!existsSync(manifestPath) || !hasDoc) continue;

		const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
		const category = manifest.category ?? 'sin-categoria';
		(byCategory[category] ??= []).push(featureId);
	}

	return Object.keys(byCategory)
		.sort()
		.map((category) => ({
			label: CATEGORY_LABELS[category] ?? category,
			items: byCategory[category].sort().map((id) => `components/${id}`),
		}));
}

// https://astro.build/config
export default defineConfig({
	// Server output: los previews con controles en vivo re-renderizan el
	// componente real vía la Container API de Astro en un endpoint (ver
	// src/pages/api/render/[id].ts) — necesita ejecutarse por request, no
	// se puede pre-generar como HTML estático.
	output: 'server',
	adapter: node({ mode: 'standalone' }),
	integrations: [
		starlight({
			title: 'Master Clone — Catálogo de Componentes',
			description:
				'Catálogo técnico para developers: qué features de _library/ existen en el Master Clone (sitio-cms-mongo), cuándo usar cada una, y su estado real (leído en vivo del propio repo, no una copia).',
			customCss: ['./src/styles/custom.css'],
			locales: {
				root: { label: 'Español', lang: 'es' },
			},
			sidebar: [
				{
					label: 'Empezar aquí',
					items: [
						{ label: 'Qué es este catálogo', slug: 'index' },
						{ label: 'Estado en vivo de _library/', link: '/estado-en-vivo/' },
					],
				},
				{
					label: 'Componentes',
					items: buildComponentSidebarGroups(),
				},
				{
					label: 'Infraestructura y pendientes',
					items: [{ label: 'Infraestructura y pendientes', slug: 'infraestructura-y-pendientes' }],
				},
			],
		}),
		// Solo para previews de features que son componentes de framework
		// (Modal, Gallery) — el resto de _library/ es Astro puro, sin islas.
		svelte(),
	],
});
