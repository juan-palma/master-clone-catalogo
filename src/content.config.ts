import { defineCollection, z } from 'astro:content';
import { docsLoader } from '@astrojs/starlight/loaders';
import { docsSchema } from '@astrojs/starlight/schema';
import { glob } from 'astro/loaders';
import { fileURLToPath } from 'node:url';

// Ruta absoluta al master-clone real (repo hermano) — se lee en vivo en cada
// build/dev, nunca se copia. Si el master-clone se mueve de ubicación, este
// es el único lugar que hay que actualizar.
const MASTER_CLONE_LIBRARY_DIR = fileURLToPath(
	new URL('../../sitio-cms-mongo/cms/src/_library', import.meta.url),
);

export const collections = {
	docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),

	// Metadata real de cada feature de _library/, leída en vivo del master-clone
	// (nunca copiada) — así el catálogo nunca queda desincronizado de lo que
	// library.mjs/registry.ts realmente instalan.
	libraryManifests: defineCollection({
		loader: glob({ pattern: '*/manifest.json', base: MASTER_CLONE_LIBRARY_DIR }),
		// Permisivo a propósito: hero-badge/manifest.json todavía usa un formato
		// viejo (requires: [], files/install-actions en vez de provides/postInstall)
		// que nunca se migró al formato actual — no ocultarlo forzando un shape
		// único, solo tolerarlo para que el build no truene. Ver nota en
		// docs/dev component-library-catalog (pendiente real, no de este catálogo).
		schema: z.object({
			id: z.string(),
			version: z.string(),
			name: z.string(),
			description: z.string(),
			category: z.string().optional(),
			tags: z.array(z.string()).optional(),
			author: z.string().optional(),
			license: z.string().optional(),
			requires: z
				.union([
					z.array(z.string()),
					z.object({
						collections: z.array(z.string()).optional(),
						globals: z.array(z.string()).optional(),
					}),
				])
				.optional(),
			recommends: z.object({ libraryFeatures: z.array(z.string()).optional() }).optional(),
			provides: z.any().optional(),
			files: z.any().optional(),
			configuration: z.any().optional(),
			postInstall: z.array(z.string()).optional(),
			notes: z.string().optional(),
		}),
	}),
};
