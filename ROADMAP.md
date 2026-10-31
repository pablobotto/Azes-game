# Azes – Análisis, pendientes y hoja de ruta

Documento de trabajo con el resultado del análisis de bugs, lo ya corregido en la fase 1 (rama `feature/inprovments`) y lo que sigue.
Restricción de base: **no se cambian las reglas del juego**. Cuando se mueva código se mueve tal cual, nunca se reescribe.

## Estado actual (v1.1.0)

| Etapa | Estado |
|---|---|
| Fase 1 – conectividad y reconexión | Mergeada a `main` y desplegada (front en Vercel, back en Render). Prueba manual de partida completa OK; **cortes de conexión aún sin probar en producción**. |
| URL del backend por entorno | Hecho (`environment.ts` / `environment.prod.ts` + `fileReplacements`). |
| Fix de build del backend en Render | Hecho (`skipLibCheck` en `server/tsconfig.json`). |
| Versión visible junto a la sala | Hecho (se toma de `package.json`). |
| Modo Vs CPU y su lógica | Eliminado. |
| Fase 2 – servidor autoritativo | En curso. (a) reglas en `server/games/azes/rules.ts`. (b) hecho: acciones `draw`/`play`/`discard` en `server/games/azes/actions.ts`, detrás del interruptor `AUTHORITATIVE=1` (variable de entorno del servidor; sin ella todo funciona como en la fase 1). Pruebas: `cd server; npm test` (35). `start-dev` lo activa por defecto (`-Legacy` lo apaga). Siguen (c) a (e), ver sección 5. |
| Fase 3 – varios juegos | Pendiente (ver sección 6). |

## Levantar el proyecto

```
.\start-dev.bat          # backend :3000 + frontend :4200 en dos ventanas
.\start-dev.ps1 -Stop    # cierra lo que quede escuchando en 3000 y 4200
```

Recordatorio: [socket.service.ts](src/app/services/socket.service.ts) apunta a `http://localhost:3000`. Volver a la URL de Render antes de publicar.

---

## 1. Qué hace el diseño actual y por qué se perdían cartas

El juego era **cliente-autoritativo**: cada `playCard` mandaba el estado entero y el servidor lo pisaba (último en llegar gana). Con conexiones inestables eso pierde cartas. Causas encontradas:

1. **Reconexión con id nuevo.** El `socket.id` cambia al reconectar. El servidor renombraba las claves de mano/mazo/pilas pero el rival no se enteraba; su siguiente `playCard` volvía a pisar el estado con el id viejo y la mano del que se reconectó quedaba `undefined`. Además el pase de turno apuntaba a un id fantasma.
2. **Snapshots atrasados.** Un mensaje del rival que llegaba a mitad del robo reemplazaba `deck`/`playerHand` locales; el bucle de robo seguía con arrays viejos.
3. **Doble robo.** `rejoined` y `BehaviorSubject.next(Drawing)` podían disparar dos `draw` concurrentes (cartas de más, empate prematuro).
4. **Orden de envío.** Al descartar se pasaba el turno (`changePlayers`) antes de enviar la carta descartada (`playCard`).

## 2. Hecho en la fase 1 (sin cambiar reglas)

| Área | Cambio |
|---|---|
| Identidad | `playerId` estable generado por el cliente (auth del handshake). El servidor lo usa como id del jugador; no se renombra nada al reconectar. |
| Escrituras | El servidor solo toma del snapshot lo que ese jugador puede modificar: sus zonas siempre; mazo central y escaleras solo si es el jugador de turno. Si algo no cuadra, responde `stateSync` con el estado correcto. |
| Reconexión | Margen de gracia de 90 s (`GRACE_MS`). El rival ve "perdió la conexión, esperando…" y no el modal de abandono. Al volver: `rejoined`, el cliente conserva sus cartas y reenvía su estado. |
| Turnos | Contador `turn` en el servidor; `changePlayers` lleva `fromTurn` y es idempotente (un reenvío no se aplica dos veces). |
| Resultado | Si el rival ganó o empató mientras uno estaba offline, el resultado se reenvía al volver. |
| Detección | `pingInterval` 5 s / `pingTimeout` 8 s; reconecta al volver internet o al despertar la pestaña; quien está en la sala de espera se vuelve a anotar solo. |
| Orden | El descarte se envía antes de pasar el turno (`GameStepService.canDiscard` + `discard`). |
| Robo | Candado `drawing` contra el doble `draw`. |
| Servidor | Ids de sala con contador (antes podían pisar una sala activa); handlers con try/catch y validación de payload; limpieza de colas y salas. |
| Plataforma | `joinRoom(gameId)` y salas separadas por juego (hoy solo `azes`). |
| Seguridad | `rejoin` valida con el `playerId` del handshake, no con lo que mande el cliente. |

Prueba de humo ya hecha contra el servidor real: snapshot malo no pisa al rival, corte y vuelta recupera la mano, intruso rechazado, cambio de turno reenviado se aplica una sola vez.

## 3. Checklist de prueba manual (dos pestañas)

- [ ] Partida normal completa: robar, jugar en escaleras, descartar, pasar turno, ganar.
- [ ] Cortar el wifi de una pestaña a mitad de **su turno** (jugando) y volver antes de 90 s.
- [ ] Cortar durante el **robo** (primeras 650 ms y entre cartas).
- [ ] Cortar justo al **descartar**.
- [ ] Cortar durante el **turno del rival** y volver después de que cambió el turno.
- [ ] Cortar más de 90 s: el rival debe ver el modal de abandono.
- [ ] Cortar a quien está en "Esperando rival…" y volver.
- [ ] Ganar / empatar mientras el rival está offline y que reciba el resultado al volver.
- [ ] Revancha.
- [ ] Verificar siempre: nadie pierde ni duplica cartas (suman 108 entre mazo, manos, mazos de jugador, pilas y escaleras).
- [ ] Botón de sincronizar (hoy comentado en `board.html`): reactivarlo y comprobar que corrige un desfase.

## 4. Bugs y deudas que siguen abiertos

| Gravedad | Dónde | Detalle |
|---|---|---|
| Media | Refrescar la pestaña | No recupera la partida: el `playerId` se genera en cada carga y el tablero no se reconstruye. Hay que persistirlo (sessionStorage) y restaurar el estado desde `rejoined`. |
| Media | Información oculta | Ambos clientes reciben el estado completo (mano del rival y mazo central). Se puede hacer trampa mirando la red. Se cierra en la fase 2. |
| Media | Rematch | `rematchAccepted` reparte de nuevo pero no resetea `currentPlayerId` ni los pasos del cliente; hereda turno y paso de la partida anterior. Decidir si es intencional. |
| Media | Revancha perdida | `requestRematch` no se reenvía si el rival estaba offline. |
| Baja | `ngOnDestroy` | Hace `socket.disconnect()` sobre un singleton y nunca reconecta. |
| Baja | Reglas | `canPlaceOnStair` muta `numericValue` del comodín; la IA lo usa en simulaciones con rollback y deja valores residuales. |
| Baja | Nombre del rival | Si se recarga la página se pierde el nombre del rival (solo vive en el cliente). |
| Baja | Deprecaciones | `*ngIf` / `*ngFor` en `board.html` (migrar a `@if` / `@for`). |
| Aviso | Config | URL del backend en `socket.service.ts` está en `localhost`. |

## 5. Fase 2 – Servidor autoritativo

Objetivo: que sea **imposible** perder una carta, aunque el cliente falle.

1. **Acciones en vez de snapshots.** El cliente envía intenciones (`play {cardId, stairIdx}`, `discard {cardId, pileIdx}`, `endTurn`). El servidor valida turno, paso, posesión de la carta y reglas, aplica y difunde el resultado.
2. **Reglas solo en el servidor** (`server/games/azes/`), copiando `GameRulesService` y el flujo de `GameStepService` sin modificar su lógica. El cliente manda la acción y el servidor responde ok / no permitido; no hace falta compartir código. Si más adelante molesta la latencia del aviso, se agrega una validación rápida solo visual en el cliente.
3. **Robo en el servidor.** Al empezar el turno el servidor roba hasta 5 y resuelve el reshuffle de escaleras completas (13 cartas terminadas en K o comodín). Desaparece el bucle con `await` del cliente.
4. **Estado versionado.** Cada cambio incrementa `version`. El cliente ignora versiones viejas y pide `resync` si detecta un hueco.
5. **Invariante anti-pérdida.** Tras cada acción, el servidor comprueba que haya 108 cartas (2 mazos de 52 + 4 comodines) sin ids repetidos. Si no, rechaza la acción y lo registra: una carta perdida pasa a ser un error visible.
6. **Vista por jugador.** Al rival solo se le manda la cantidad de cartas en mano y la carta superior de su mazo. El mazo central se manda como cantidad.
7. **Persistencia de sesión.** `playerId` en `sessionStorage` + restauración del tablero → sobrevive al refresh.
8. **Pruebas.** Casos de caracterización del comportamiento actual (jugadas válidas/ inválidas, comodín, reshuffle, victoria, empate) que deben pasar idénticos antes y después de mover las reglas. Más una simulación de corte/reconexión en cada paso del turno.

Orden sugerido: (a) mover reglas + pruebas de caracterización, (b) acciones y robo en servidor detrás de un flag, (c) estado versionado + invariante, (d) vista por jugador, (e) quitar el camino viejo.

## 6. Fase 3 – Plataforma de varios juegos

Idea: un lobby con la lista de juegos en la barra superior; cambiar de juego = cambiar el tablero.

**Servidor**

```ts
interface GameModule<State, Action> {
  id: string;                 // 'azes'
  name: string;
  minPlayers: number; maxPlayers: number;
  createState(playerIds: string[]): State;
  applyAction(state: State, playerId: string, action: Action):
      { state: State } | { error: string };
  viewFor(state: State, playerId: string): unknown;   // oculta lo privado
  isFinished(state: State): { winnerId?: string } | null;
}
```

- Registro `GAMES: Record<string, GameModule>`; `joinRoom(gameId)` ya existe y separa las salas por juego.
- Infraestructura común (salas, cola por sala, gracia/reconexión, `playerId`, resync, rematch) vive fuera del módulo y se reutiliza.

**Cliente**

- Registro de juegos: `{ id, name, icon, component: () => import('./games/azes/azes-board') }`, con carga diferida.
- `LobbyComponent` / barra superior con la lista; al elegir, llama a `joinRoom(gameId)` y monta el componente del juego.
- `SocketService` pasa a ser genérico (conexión, sala, reconexión, estado); cada juego tiene su `GameStore` y su tablero.
- El tablero actual se mueve a `games/azes/` sin cambiar su lógica.

Prerrequisito: la fase 2, porque un `GameModule` con `applyAction` es lo que hace que agregar un juego no implique reescribir la red.

## 7. Pendientes de proceso

- ~~Merge de `feature/inprovments` a `main`~~ hecho. Las ramas viejas ya se borraron en local y en origen.
- ~~URL del backend por entorno~~ hecho.
- Subir el tag de la version actual: `git push origin v1.1.0` (hoy solo existe en local).
- Probar en producción los cortes de conexión (modo avión durante turno, robo, descarte y turno del rival).
- Sacar `server/node_modules` del repositorio (está versionado) y agregarlo al `.gitignore`.
