---
title: "Product Menu"
description: "Catálogo de productos (restaurante/bar/cafetería) — pendiente de decisión de diseño, no listo para usar en un proyecto nuevo sin antes resolverlo."
---

:::caution[Pendiente de decisión — no usar todavía sin resolver esto primero]
A diferencia del resto del catálogo, este feature **no tiene un diseño único** — hay dos
implementaciones conviviendo sin reconciliar. Léelo completo antes de activarlo en un
proyecto nuevo.
:::

## ¿Qué es?

Catálogo de productos con atributos, variantes, descuentos y filtrado por categoría —
genérico para restaurantes, bares, cafeterías, panaderías, etc. Collection slug: `menu`.

## El problema: dos diseños sin reconciliar

1. **`legacy/*.astro`** — 5 componentes (`Antojo`, `Menu`, `Destacados`, `Ofertas`, `Extras`),
   verificados vía triangulación real contra el proyecto `sitio-cms-demo` (su
   `Layout.compiled.mjs` usa `data.menu`/`data.extra`/`data.destacados` tal cual). Consumen la
   collection `menu` completa (`attributes`/`variants`/`discount`).
2. **`components/MenuSection.astro`** — rediseño genérico v2.0.0, un solo componente
   reusable con prop `areas`, pero espera una collection `product-menu` simplificada
   (`name`/`mainImage`/`price`/`shortDescription`/`isActive`) que **nunca se construyó** del
   lado CMS. No triangulado contra ningún proyecto real.

**Ninguno de los dos está montado en ninguna página hoy.** No asumas que `MenuSection` es la
opción correcta solo por ser más nueva — no tiene evidencia real detrás, a diferencia de
`legacy/`.

## Antes de usarlo en un proyecto de cliente

Decide explícitamente (o construye el puente entre ambos) antes de activar `product-menu` en
`library.config.json`:

- Si el proyecto se parece a `sitio-cms-demo` (categorías con destacados/ofertas/extras) →
  `legacy/` tiene evidencia real de funcionar así.
- Si se prefiere el modelo simplificado de `MenuSection` → falta construir la collection
  `product-menu` completa del lado CMS antes de que sirva de algo.

## Campos disponibles (collection `menu`, diseño `legacy`)

| Campo | Descripción |
|---|---|
| **name** | Nombre del producto |
| **category** | Categoría (agrupa en Antojo/Menu/Destacados/Ofertas/Extras) |
| **attributes** | Grupos de atributos configurables (ej. temperatura, nivel de picante) |
| **variants** | Variantes del producto (ej. tamaños, precios distintos) |
| **discount** | Descuento aplicado |
| **mainImage** | Imagen principal |

## Notas técnicas

- Requiere la collection `Responsive` (imágenes).
- `pnpm payload generate:types` después de activarlo.
