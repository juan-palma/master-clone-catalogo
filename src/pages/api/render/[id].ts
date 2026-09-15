import type { APIRoute } from 'astro';
import { registry, renderEntry } from '../../../lib/component-registry';

export const prerender = false;

// Re-renderiza el componente REAL (cross-repo) server-side con props nuevas —
// así los controles del preview quedan "en vivo" de verdad, no una simulación:
// es literalmente el mismo componente que corre en sitio-cms-mongo.
export const POST: APIRoute = async ({ params, request }) => {
	const id = params.id ?? '';
	const entry = registry[id];
	if (!entry) {
		return new Response(`Feature "${id}" no está en el registro de previews.`, { status: 404 });
	}

	const controlValues = (await request.json().catch(() => ({}))) as Record<string, unknown>;
	const html = await renderEntry(entry, entry.buildProps(controlValues));

	return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
