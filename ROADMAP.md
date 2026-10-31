# Azes – Análisis, pendientes y hoja de ruta

Documento de trabajo con el resultado del análisis de bugs, lo ya corregido en la fase 1 (rama `feature/inprovments`) y lo que sigue.
Restricción de base: **no se cambian las reglas del juego**. Cuando se mueva código se mueve tal cual, nunca se reescribe.

## Estado actual (v1.2.0)

| Etapa | Estado |
|---|---|
| Fase 1 – conectividad y reconexión | Mergeada a `main` y desplegada (front en Vercel, back en Render). Prueba manual de partida completa OK; **cortes de conexión aún sin probar en producción**. |
| URL del backend por entorno | Hecho (`environment.ts` / `environment.prod.ts` + `fileReplacements`). |
| Fix de build del backend en Render | Hecho (`skipLibCheck` en `server/tsconfig.json`). |
| Versión visible junto a la sala | Hecho (se toma de `package.json`). |
| Modo Vs CPU y su lógica | Eliminado. |
| Fase 2 – servidor autoritativo | En curso. (a) reglas en `server/games/azes/rules.ts`. (b) hecho: acciones `draw`/`play`/`discard` en `server/games/azes/actions.ts`, con el interruptor `AUTHORITATIVE` (variable de entorno del servidor): **encendido por defecto**; con `AUTHORITATIVE=0` vuelve al modo de la fase 1 sin tocar código. `start-dev -Legacy` también lo apaga. Revancha probada local OK; reconexiones se prueban en producción. (c) hecho: estado con `version` y chequeo de las 108 cartas tras cada acción (si falla, se deshace y se registra `INVARIANTE ROTO`). (d) hecho: cada jugador recibe su vista (`server/games/azes/view.ts`): sin la mano del rival ni el mazo central. Pruebas: `cd server; npm test` (42). Falta (e) y la persistencia ante refresh, ver sección 5. |
| Fase 3 – varios juegos | Pendiente (ver sección 6). |
| Panel de admin (solo lectura) | Pendiente (ver sección 7). |

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
| Media | Información oculta | Ambos clientes reciben el estado completo (mano del rival y mazo central). Se puede hacer trampa mirando la red. **Resuelto en modo autoritativo** (paso (d)); sigue así en el modo viejo. |
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

## 7. Panel de admin (solo lectura, sin base de datos)

Objetivo: ver **en vivo** qué salas hay y quién juega en cada mesa. Todo sale de la memoria del servidor (`rooms`, `roomMeta`), así que no hace falta base de datos. No depende de la fase 2 ni de la 3.

**Decisiones tomadas**

- **El panel va en el frontend** (Angular, rutas `/admin` y `/administracion`): una pantalla de login y una pantalla de **solo lectura** con las salas en un sidebar.
- **Restricción por IP en el backend:** el servidor tiene una lista de IPs permitidas (se lee `X-Forwarded-For`, porque Render pone un proxy delante). La página de Angular es pública, pero sin permiso la API contesta 403 y no muestra nada. Una restricción solo en el front no protegería nada.
- El servidor expone `/admin/api/login` y `/admin/api/rooms` (JSON); socket.io sigue en `/socket.io`.

**Qué muestra** (nada de cartas ni manos)

| Dato | Detalle |
|---|---|
| Sala | id, juego (`azes`), estado: esperando / jugando / terminada, hora de inicio, número de partida (`matchId`) |
| Jugadores | nombre de cada uno, si está conectado o en período de gracia, de quién es el turno |
| Totales | salas activas, jugadores conectados, partidas en curso |

Se actualiza sola cada pocos segundos (sondeo). Sin botones para cerrar salas ni expulsar, al menos al principio. El servidor hoy no guarda los nombres (solo los reenvía con `displayOpponentName`): hay que guardarlos en `roomMeta`. Los nombres los escribe cualquiera, así que se muestran como texto, nunca como HTML (evita XSS).

**Seguridad**

1. Solo HTTPS (Render ya lo da).
2. **Clave guardada como hash, no en texto:** `scrypt` con sal, comparado con `crypto.timingSafeEqual`. El hash va en una constante del código (por ahora) y el texto de la clave nunca se escribe en el repo. Un script `npm run admin:hash` genera el hash.
3. **Clave larga:** una frase de 5 o 6 palabras al azar (20+ caracteres). Es lo que protege si el repo es público, porque el hash se puede intentar romper sin conexión.
4. **Sesión:** token aleatorio de 32 bytes guardado en memoria del servidor, vence a los 30 minutos sin uso. Como el front está en otro dominio, viaja en la cabecera `Authorization` y el front lo guarda solo en memoria (no en `localStorage`). CORS abierto únicamente para el dominio del front en estas rutas.
5. **Contra fuerza bruta:** máximo 5 intentos fallidos por IP, después bloqueo de 15 minutos; mismo mensaje de error exista o no el usuario.
6. **Cabeceras:** `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; el front con `Content-Security-Policy` estricta.
7. **Sin datos de más:** no se muestran los `playerId` completos; cada login (ok o fallido) queda en el log con la IP.
8. **Cuando se pueda:** mover el hash a la variable de entorno `ADMIN_PASSWORD_HASH` en Render para sacarlo del repo.

**Límite a tener presente:** una clave fija en el código es cómoda pero débil frente a una filtración del repo; el hash retrasa a un atacante, no lo frena. Por eso la clave larga (3) y la variable de entorno (8) son lo más importante a mediano plazo.

**Pasos sugeridos:** (1) guardar nombres en `roomMeta`; (2) endpoints con login, sesión, lista de IPs y límite de intentos; (3) pantallas de login y de salas en Angular; (4) pruebas de seguridad (clave mala, bloqueo, sesión vencida, IP no permitida); (5) pasar el hash a variable de entorno.

## 8. Pendientes de proceso

- ~~Merge de `feature/inprovments` a `main`~~ hecho. Las ramas viejas ya se borraron en local y en origen.
- ~~URL del backend por entorno~~ hecho.
- Subir el tag de la version actual: `git push origin v1.1.0` (hoy solo existe en local).
- Probar en producción los cortes de conexión (modo avión durante turno, robo, descarte y turno del rival).
- Sacar `server/node_modules` del repositorio (está versionado) y agregarlo al `.gitignore`.
