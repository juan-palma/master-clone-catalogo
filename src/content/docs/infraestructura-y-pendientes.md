---
title: Infraestructura y pendientes
description: Patrones que no son (ni van a ser) features independientes de _library/ — infraestructura transversal, instancias de otro feature, o construcción pendiente.
---

No todo patrón útil del sitio es un feature de `_library/` independiente. Esta página junta
los casos que quedaron fuera del catálogo de **Componentes** a propósito, para no perder el
registro de por qué.

## Instancias de otro feature (no requieren su propia página)

- **CTA Banner** (banner intermedio) — no es un componente propio, es literalmente el
  feature **Slider** reusado con `settings.areas: "cta-intermedio"`. Ver la página de
  **Slider**.

## Infraestructura transversal (vive en `_core`/`fx`, no en `_library/`)

Estos no se mueven a `_library/` porque no son un feature que un proyecto activa/desactiva —
los usa casi todo lo demás por debajo:

- **Word Rotator** (`site/src/components/fx/WordCycler.astro`) — cicla una palabra objetivo
  dentro de un texto, soporta multilínea. Ya genérico y central.
- **Scroll Reveal** (`FadeOnScrollUtil.svelte` / `fadeOnScroll.js`) — utilidad de animación al
  hacer scroll. Soporta `[data-reveal]` (convención nueva) y `.idaAniFade`/`data-direccion`
  (convención vieja) al mismo tiempo. La usan casi todas las secciones.

## Pendiente de construir (sin evidencia real todavía)

- **Parallax Decorative Background** (`BackgroundFx`) — asset decorativo con
  parallax/scale/rotate. Existe el campo `backgroundFxField` en
  `cms/src/fields/animationConfig.ts` (sin usar), y hay una versión real recuperada de
  `silental` (`Layout.compiled.mjs`) que sirve de referencia, pero no se ha construido acá
  todavía. No inventar el diseño sin volver a triangular contra esa referencia primero.

## Diseño no resuelto (sí es un feature de `_library/`, pero bloqueado)

- **Product Menu** — tiene su propia página en **Componentes**, marcada explícitamente como
  pendiente: hay dos implementaciones sin reconciliar. Ver esa página antes de tocarlo.
