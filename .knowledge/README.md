# Base de conocimiento — errores técnicos y soluciones

Documenta errores difíciles ya resueltos al construir este catálogo, para no repetirlos al
agregar los componentes que faltan. **No es un changelog** — si un patrón descrito acá deja de
aplicar (Starlight cambia de versión y ya no tiene el bug, por ejemplo), se corrige o se borra
la entrada, no se acumula historial. El historial real vive en `git log`.

**Consultar antes de construir el preview de un componente nuevo, en especial**
[`css-gotchas.md`](css-gotchas.md) **§ `:root` no aplica en Shadow DOM** — es la causa raíz que
más tiempo costó encontrar hasta ahora, afecta a cualquier componente de la Familia A, y ya está
resuelta de forma genérica (no hace falta releerla componente por componente, pero si algo de
layout/color se ve raro sin razón aparente, es el primer sospechoso). También:
- Es un componente Svelte/framework (ver `live-preview-architecture.md`)
- Necesita mostrarse dentro de `<Tabs>` de Starlight (ver `astro-starlight-gotchas.md`)
- Toca rutas cross-repo hacia `sitio-cms-mongo` (ver `astro-build-gotchas.md`)

## Índice

- [`css-gotchas.md`](css-gotchas.md) — **`:root` no aplica en Shadow DOM (usar `:host`)**, `currentColor` auto-cancelante, `<textarea>` con contenido fantasma
- [`live-preview-architecture.md`](live-preview-architecture.md) — por qué Container API para Astro puro, Astro Islands para framework, Shadow DOM en vez de iframe
- [`astro-starlight-gotchas.md`](astro-starlight-gotchas.md) — Tabs rompe `<template>`, `isolation:isolate` atrapa z-index, ancho/centrado de columnas
- [`astro-build-gotchas.md`](astro-build-gotchas.md) — `import.meta.url` se rompe en build para módulos SSR, versiones de dependencias cross-repo
