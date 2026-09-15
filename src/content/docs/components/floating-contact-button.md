---
title: "Floating Contact Button (genérico)"
description: "Campo de CMS heredado para un botón flotante de contacto genérico (no WhatsApp) — sin componente de sitio construido todavía."
---

:::tip[Base reutilizable, no un contrato]
Esto es un punto de partida genérico y probado — en la práctica, la mayoría de proyectos de cliente ajustan diseño y/o campos antes de usarlo. Sirve para decidir con qué arrancar, no para asumir que se va a usar tal cual.
:::

**Última actualización:** 2026-09-01
**Versión:** 1.0.0
**Estado:** ⏳ Inactivo por defecto (`library.config.json` → `"floating-contact-button": false`) — solo lado CMS, sin componente de sitio

---

## ¿Qué es?

Un campo en el CMS que guarda una relación a un método de contacto para un botón flotante genérico (no específico a WhatsApp). Es schema heredado del Master Clone original — existe la relación, pero nunca se construyó la interfaz visual que la usa.

---

## ¿Cuándo usarlo?

- ✅ Solo si necesitas un **segundo** botón flotante además de WhatsApp (ej. un botón de "llamar" separado)
- ❌ Para el caso normal de WhatsApp, usa **WhatsApp Floating Action Button** — ya está completo y probado

---

## Cómo activarlo

⚠️ Este feature no tiene componente de sitio construido — activar el campo en el CMS no hace aparecer nada visualmente todavía.

1. En `cms/library.config.json`, cambia `"floating-contact-button": false` a `"floating-contact-button": true`
2. `pnpm payload generate:types`
3. Construir un componente de sitio nuevo que lea `general-site.features.floatingContactButton` (no existe ejemplo real que triangular — hay que diseñarlo desde cero si se necesita)

---

## Campos disponibles (global `general-site` → `features`)

| Campo | Descripción | Requerido |
|---|---|---|
| **floatingContactButton** | Relación a un documento de `contacts` | ❌ No |

---

## Notas técnicas

- Confirmado como campo real del Master Clone original (aparece en el dump de la base de datos de aceigro), pero sin uso real en ningún proyecto con frontend recuperado (`demo`, `bysantik`) — schema heredado sin UI nunca construida.
- Se mantiene disponible por si algún cliente futuro lo necesita, sin inventar un diseño sin evidencia real que lo respalde.
