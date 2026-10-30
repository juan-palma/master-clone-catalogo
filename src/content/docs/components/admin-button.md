---
title: "Admin Button (botón Panel Admin)"
description: "Botón opcional en el menú de navegación que enlaza al panel del CMS. Pensado para sitios demo; nunca se carga por defecto."
---

:::tip[Base reutilizable, no un contrato]
Esto es un punto de partida genérico y probado — en la práctica, la mayoría de proyectos de cliente ajustan diseño y/o campos antes de usarlo. Sirve para decidir con qué arrancar, no para asumir que se va a usar tal cual.
:::

**Última actualización:** 2026-10-30
**Versión:** 1.0.0
**Estado:** ⏳ Inactivo por defecto (`library.config.json` → `"admin-button": false`) — solo lado site, sin campos de CMS

---

## ¿Qué es?

Un botón "Panel Admin" dentro del menú de navegación que abre el panel del CMS en otra pestaña. Nació en el sitio demo, donde el visitante puede entrar al panel con un usuario de prueba.

---

## ¿Cuándo usarlo?

- ✅ Sitios demo o de pruebas donde quieres que el visitante entre al panel con un clic
- ❌ Sitios de cliente en producción: normalmente no se quiere un acceso visible al panel

---

## Cómo activarlo

1. `pnpm library:add admin-button`
2. En `Nav.astro`, calcular la URL en runtime (no en build): `const adminHref = \`${(process.env.PAYLOAD_PUBLIC_SERVER_URL ?? '').replace(/\/$/, '')}/admin\``
3. Pasarla a `<NavMenu {adminHref} ... />`
4. En `NavMenu.svelte`: `export let adminHref`, importar `AdminButton` y poner `<AdminButton href={adminHref} />` donde se quiera.

No toca ningún core file por defecto: un clon que no lo instala nunca lo carga.

---

## Parámetros

| Parámetro | Tipo | Descripción | Default |
|---|---|---|---|
| **href** | string | URL del panel | `/admin` |
| **label** | string | Texto del botón | `Panel Admin` |

---

## Notas técnicas

- Componente: `site/src/_library/admin-button/AdminButton.svelte`.
- La versión anterior tenía el dominio del demo escrito en el componente; ahora la URL siempre se pasa por prop desde `PAYLOAD_PUBLIC_SERVER_URL`.
