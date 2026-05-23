@AGENTS.md

# Permisos y autorización

El usuario ha dado autorización total para operar de forma autónoma en este proyecto:
- Ejecutar cualquier comando Bash (git, curl, npm, etc.)
- Leer y escribir en la base de datos de Supabase (usando las claves en `.env.local`)
- Hacer push a GitHub (rama `master`)
- Desplegar en Vercel (si se requiere vía CLI)
- Crear, modificar y eliminar cualquier archivo del proyecto

No es necesario pedir confirmación para ninguna de estas acciones.

# Política de versionado

La versión de la aplicación se actualiza con cada cambio significativo. Cambiar en [lib/version.ts](lib/version.ts):

```ts
export const APP_VERSION = 'v2.0'  // Incrementar en cada PR/cambio
```

La versión se muestra en:
- **Cajero** ([app/cajero/page.tsx](app/cajero/page.tsx)) — pie de página, debajo del resumen
- **TV pública** ([app/tv/page.tsx](app/tv/page.tsx)) — esquina arriba a la derecha
- **Cliente final** ([app/turno/page.tsx](app/turno/page.tsx)) — pie de página

Esto permite verificar rápidamente que el navegador está cargando la versión más reciente.

# Sistema de Turnos — Reglas del cálculo de tiempo

## Concepto clave: `prep_minutes` (piso del tiempo)

Cada turno guarda dos valores de tiempo en la tabla `turns`:

- `estimated_wait_minutes` — tiempo total estimado de espera del cliente desde que se registra hasta que su pedido está listo. Incluye los turnos que tiene delante.
- `prep_minutes` — **tiempo de preparación del propio plato con colchón** (`tiempoProducto * (1 + buffer%)`). Es el piso absoluto: el contador del cliente **nunca** puede mostrar menos que esto mientras tenga turnos delante, porque hasta que no se procesen los anteriores su plato no se empieza a preparar.

## Regla del piso

En cualquier flujo que modifique `estimated_wait_minutes`, **`remainingSeconds` ≥ `prep_minutes * 60`** mientras el turno tenga otros turnos en `waiting`/`called` creados antes que él.

Como `remainingSeconds = estimated_wait_minutes * 60 - elapsedSeconds`, el piso aplicado al guardar es:

```
nuevoTiempo ≥ ceil(prep_minutes + elapsedSeconds / 60)
```

Ejemplo: plato de 5 min + 20% colchón = 6 min (`prep_minutes = 6`). Si hay un turno delante, `estimated_wait_minutes = 12`. Pasan 8 min, el turno delante se completa. El cálculo natural daría `12 - 8 = 4 min`, pero el piso es 6 min → se guarda `estimated_wait_minutes = 14` para que `remaining = 14*60 - 8*60 = 6 min`.

## Puntos donde se aplica el piso

| Archivo | Función | Qué hace |
|---|---|---|
| [app/cajero/page.tsx](app/cajero/page.tsx) | `handleSubmit` | Al crear turno: `estimated ≥ prep_minutes`, y se guarda `prep_minutes`. |
| [app/cajero/page.tsx](app/cajero/page.tsx) | `recalcAfterRemoval` | Al **completar o cancelar** un turno: recalcula todos los siguientes aplicando piso `ceil(prep_minutes + elapsed/60)`. |
| [app/cajero/page.tsx](app/cajero/page.tsx) | `adjustTurnTime` | Botones −5 / +5 / +10: nunca baja de `prep_minutes`. Cascade a turnos posteriores con su propio piso. |
| [app/api/turno/route.ts](app/api/turno/route.ts) | `GET` | Al servir al cliente: si el turno aún tiene otros delante, `remainingSeconds = max(prep_minutes*60, calculadoNatural)`. |

## Migración necesaria

La columna `prep_minutes` se agregó al esquema. Para que turnos nuevos funcionen en una base existente, ejecutar una vez en Supabase:

```sql
-- db/migrations/add_prep_minutes.sql
alter table turns add column if not exists prep_minutes integer;
update turns set prep_minutes = 0 where prep_minutes is null;
```

Turnos antiguos sin `prep_minutes` (= 0) ignoran el piso (fallback: derivar de `estimated_wait_minutes / (origSlots+1)` en `recalcAfterRemoval`).

## Reglas de capacidad

- `parallel_capacity` = cuántos platos se preparan a la vez.
- `turnosEsperando = floor(turnosEnCola / capacity)` = cuántos "slots" hay delante del nuevo turno.
- `estimated_wait_minutes` inicial = `prep_minutes * (turnosEsperando + 1)`.

## Anti-bugs a recordar

- **No derivar `tiempoBase` de `estimated_wait_minutes / (slots+1)`** salvo como fallback. Después de uno o más recálculos (`recalcAfterRemoval`) o ajustes manuales (`adjustTurnTime`), `estimated_wait_minutes` ya no es múltiplo limpio de `prep_minutes`. Usar siempre `turn.prep_minutes` directo.
- `recalcAfterRemoval` se llama tanto al **completar** como al **cancelar**. Un cancel también libera la cola y debe recalcular los siguientes.
- El timer del cliente ([app/turno/page.tsx](app/turno/page.tsx)) cuenta localmente entre fetches. Si el cajero no actúa durante mucho tiempo, el timer puede bajar de `prep_minutes`; el siguiente fetch (visibility / online / realtime UPDATE) lo corrige.
