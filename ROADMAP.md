# Azes – Estado, pendientes y hoja de ruta

Documento de trabajo. Reglas de base:
- **No se cambian las reglas de Azes.** Cuando se mueve código se mueve tal cual, nunca se reescribe.
- Los commits y los tags los hace el dueño del repo (`main` despliega solo: front en Vercel, back en Render). Los tags v1.1.0 a v1.4.0 existen solo en local.

## 1. Estado actual (v1.5.1)

| Área | Estado |
|---|---|
| Azes | Jugable en producción. Servidor autoritativo (encendido por defecto), refresh persistente y efecto de vuelo de cartas. |
| Chinchón | Jugable de a dos (v1.5.0), con colada manual desde la v1.5.1. Servidor y pantalla propios. Falta pulirlo (ver sección 4). |
| Conectividad | Fase 1 desplegada y registro `[net]` en el servidor (v1.5.0). **Hay jugadores con conexión pobre que siguen con problemas raros**; todavía no hay datos precisos (sección 3). |
| Fase 2 – servidor autoritativo | Hecha salvo el paso (e): borrar el camino viejo (sección 5). |
| Fase 3 – varios juegos | Servidor hecho (módulos, registro, estado de sala genérico). Cliente a medias (sección 6). |
| Panel de admin | Pendiente, diseñado (sección 7). |
| Pruebas | `cd server; npm test` → 79 pruebas (reglas, acciones, vistas y estado de los dos juegos). Del cliente solo se verifica que compile. |

Documentos: [README.md](README.md) (cómo levantarlo) y [CHANGELOG.md](CHANGELOG.md) (qué trae cada versión).

## 2. Cómo está armado

- **El servidor decide.** El cliente manda intenciones (`action`: `draw`, `play`, `discard`, `close`, `nextRound`) con un ack `{ok}` o `{error}`; el servidor valida turno, paso, posesión de la carta y reglas, aplica y difunde a cada jugador **su vista** del estado.
- **Un módulo por juego** (`server/games/<id>/`): `emptyState`, `addPlayer`, `startMatch`, `applyAction`, `viewFor`, `checkInvariant`. Registro en `server/games/registry.ts`.
- **Infraestructura común** en `server/server.ts`: salas, cola por sala, `playerId` estable, margen de gracia de 90 s, `rejoin`, versiones, resultado, revancha y el registro `[net]`.
- **Estado de sala**: sobre común `RoomState` (sala, juego, turno, partida, versión, fase) + campos propios de cada juego. El cliente descarta estados con versión menor que la que ya tiene. El servidor comprueba tras cada acción que no se pierdan ni se dupliquen cartas (Azes: 108; Chinchón: 54); si falla, deshace la acción y registra `INVARIANTE ROTO`.
- **Cliente**: `SocketService` guarda la conexión, la sala y el `playerId` (en `sessionStorage`, una por pestaña). Azes alimenta `GameService`; los demás juegos publican su estado en `table$` y sus movimientos en `tableMove$`. El `board` conserva la barra superior y cambia el cuerpo según el juego (`viewGame`).
- **Efectos de vuelo**: cada acción válida devuelve un `effect` con solo datos públicos; el cliente oculta la carta de destino, la hace volar (~0,45 s) y la muestra al llegar. No anima al reconectar, con la pestaña oculta ni con movimiento reducido.

## 3. Conexión pobre (lo que más duele)

**Hecho: registro `[net]` en el backend.** Una línea por evento, con claves fijas para filtrar en los logs de Render (por ejemplo, buscar `[net] event=disconnect`). Del `playerId` solo se ven 8 caracteres.

| Evento | Qué dice |
|---|---|
| `connect` | jugador, transporte, sala si ya estaba en una, `replaced=true` si el servidor aún no había notado la caída anterior, `offlineMs` desde que se cayó |
| `disconnect` | motivo (`transport close`, `ping timeout`, `transport error`…), sala, juego, si estaba esperando o jugando, `stale=true` si ya volvió con otro socket |
| `rejoin_ok` / `rejoin_failed` | tiempo que estuvo fuera y, si falló, por qué (`not_member`, `room_gone`) |
| `grace_expired` | se pasó de los 90 s y se lo dio por ido |
| `action_rejected` / `action_stale` | tipo de acción, error y versión; `offlineMs` si acababa de volver |
| `sync_sent` | el servidor forzó una resincronización |

Cómo leerlo: muchos `disconnect` con `ping timeout` de un mismo jugador = su red es inestable; `rejoin_ok` con `offlineMs` alto = tarda en volver; `action_rejected` con `wrong_step` o `not_your_turn` justo después de un `connect` = jugadas repetidas tras perder la confirmación.

**Pendiente (sin orden definido):**
- **Acciones con identificador.** Si el servidor aplica una jugada pero se pierde el ack, el cliente muestra "el servidor no respondió", la persona reintenta y el reintento sale como error de paso o de turno aunque el estado ya cambió. Con un id por acción el servidor reconoce el reintento y responde ok.
- **Transporte.** El cliente está forzado a `websocket`, sin plan B (polling). En redes o proxies problemáticos puede no recuperarse.
- **Tiempos.** `ACTION_TIMEOUT_MS` (8 s), `pingInterval` 5 s / `pingTimeout` 8 s y `GRACE_MS` 90 s fueron elegidos sin datos; ajustar con lo que muestre el registro.
- **Revancha perdida.** `requestRematch` no se reenvía si el rival estaba offline.
- **Pruebas de corte** (sección 9): hechas en local solo en parte; en producción, ninguna; Chinchón no se probó con cortes.

## 4. Chinchón

Decisiones del dueño: 2 jugadores por ahora (estructura lista para 2 a 4), un solo mazo de póker de 54 cartas (52 + 2 comodines), se cierra con menos de 5 puntos sueltos, cerrar sin sueltas resta 10, el chinchón gana la partida al instante, se juega por rondas hasta 100 (quien llega pierde).

**Reglas implementadas** (`server/games/chinchon/`): mano de 7; en el turno se roba (mazo o tope del descarte) y se descarta o se cierra; combinaciones = pierna (3 o 4 del mismo valor, palos distintos) y escalera (3 o más seguidas del mismo palo; el As vale solo 1); el comodín completa cualquier combinación y suelto vale 25; valor de las sueltas: As 1, 2 a 10 su número, J/Q/K 10; los rivales suman sus sueltas; **colada manual**: tras el cierre, quien no cerró arrastra sus cartas sueltas a las combinaciones de quien cerró (acción `attach {cardId, meldIdx}`; el servidor comprueba que la combinación siga siendo válida; la carta colada lleva borde dorado y baja los puntos al instante) hasta que confirma; no hay colada tras un chinchón; **el resultado de la partida se decide cuando los dos confirman** (así la colada puede evitar llegar a 100); mazo agotado = se mezcla el descarte menos el tope; después de cada ronda ambos confirman para repartir la siguiente y rota el repartidor.

**Pendiente:**
- **Colada con más de 2 jugadores:** hoy hay un solo borde dorado para todos; con 3 o 4 habría que distinguir quién coló cada carta.
- El comodín se muestra siempre como comodín, sin indicar qué carta representa (decisión del dueño: no se cambia).
- **Mostrar combinaciones durante la ronda** (hoy solo al final).
- **Chinchón con comodín:** hoy solo cierra con −10; decidir si cuenta como chinchón.
- **3 y 4 jugadores:** el servidor ya rota por asiento; falta arranque con rango (empezar con los presentes) y la pantalla con más rivales.
- **Cerrar arrastrando** y otros detalles de la mano (reordenar ya funciona).
- Eventual mejora visual con un canvas propio; el servidor no cambia.

## 5. Fase 2 – Servidor autoritativo (paso (e))

(a) reglas en el servidor, (b) acciones y robo detrás del interruptor `AUTHORITATIVE`, (c) estado versionado + invariante, (d) vista por jugador: **hechos**. Falta **(e): borrar el camino viejo**:
- servidor: los manejadores `playCard`, `changePlayers`, `win`, `tie`, `opponentPlayed`, el handshake de `handleRejoined` del cliente y el interruptor `AUTHORITATIVE`;
- cliente: `GameStepService` y el flujo por snapshots de `GameService`/`SocketService`.

Se hace **después de unas dos semanas de uso intensivo en producción** (hoy el servidor ya ignora esos mensajes en salas autoritativas, así que dejarlo no rompe nada). Al borrarlo se generalizan también `ActionOutcome` y `MoveEffect`, que siguen siendo de Azes.

## 6. Fase 3 – Plataforma de varios juegos

Hecho: `GameModule<S>` con `minPlayers`/`maxPlayers`, registro, estado de sala genérico, desplegable de juegos, `gameId` por sala, pantalla por juego.

Falta:
- registro de pantallas con **carga diferida** (`component: () => import(...)`) y mover el tablero de Azes a `games/azes/`;
- `SocketService` genérico (hoy tiene un camino para Azes y otro para el resto);
- arranque con rango de jugadores y lista de asientos/nombres de más de un rival (`displayOpponentName`, `opponentLeft`… asumen uno);
- barra superior: cuando haya más juegos, sacar **Unirse** y el desplegable una vez dentro de la sala;
- resultados más ricos que ganó/perdió/empate (puntajes finales).

## 7. Panel de admin (solo lectura, sin base de datos)

Objetivo: ver **en vivo** qué salas hay y quién juega en cada mesa, desde la memoria del servidor. Encaja con el registro de la sección 3. No depende de las fases 2 ni 3.

**Decisiones tomadas**
- El panel va en el **frontend** (Angular, rutas `/admin` y `/administracion`): login y una pantalla de **solo lectura** con las salas en un sidebar.
- **Restricción por IP en el backend** (lista de IPs permitidas, leyendo `X-Forwarded-For` porque Render pone un proxy). La página es pública, pero sin permiso la API contesta 403. Una restricción solo en el front no protegería nada.
- El servidor expone `/admin/api/login` y `/admin/api/rooms`; socket.io sigue en `/socket.io`.

**Qué muestra** (nada de cartas ni manos): por sala, id, juego, estado (esperando / jugando / terminada), hora de inicio y número de partida; por jugador, nombre, conectado o en gracia y de quién es el turno; totales de salas, jugadores y partidas en curso. Se actualiza sola cada pocos segundos. Sin botones para cerrar salas ni expulsar. Los nombres los escribe cualquiera: se muestran como texto, nunca como HTML.

**Seguridad:** solo HTTPS; clave guardada como hash (`scrypt` con sal, `timingSafeEqual`) con un script para generarlo y sin la clave en el repo; clave larga (frase de 5 o 6 palabras al azar); sesión con token aleatorio de 32 bytes en memoria que vence a los 30 minutos y viaja en `Authorization` (el front lo guarda solo en memoria); máximo 5 intentos fallidos por IP y bloqueo de 15 minutos; `Cache-Control: no-store` y `X-Content-Type-Options: nosniff`; sin `playerId` completos; cada login queda en el log con la IP; a mediano plazo, el hash en `ADMIN_PASSWORD_HASH` (variable de entorno). Una clave fija en el código retrasa a un atacante, no lo frena: por eso la clave larga y la variable de entorno son lo más importante.

**Pasos:** (1) guardar los nombres en `roomMeta` (hoy ya se guardan en `roomMeta.names`); (2) endpoints con login, sesión, lista de IPs y límite de intentos; (3) pantallas de login y de salas; (4) pruebas de seguridad (clave mala, bloqueo, sesión vencida, IP no permitida); (5) hash a variable de entorno.

## 8. Deudas y bugs conocidos

| Gravedad | Dónde | Detalle |
|---|---|---|
| Media | Revancha de Azes | `rematchAccepted` reparte de nuevo pero no resetea del todo turno y pasos del cliente (en modo autoritativo mejoró). Decidir si es intencional. |
| Media | Revancha perdida | `requestRematch` no se reenvía si el rival estaba offline (ver sección 3). |
| Baja | `ngOnDestroy` | El tablero hace `socket.disconnect()` sobre un singleton y nunca reconecta. |
| Baja | Reglas de Azes | `canPlaceOnStair` muta `numericValue` del comodín. Es el comportamiento original y se conserva. |
| Baja | Plantillas | `*ngIf` / `*ngFor` en `board.html` y `chinchon.html`: migrar a `@if` / `@for`. |
| Baja | Presupuesto | `board.scss` pasa el aviso de 4 kB (el límite que rompe el build es 8 kB). |
| Baja | Logs de diagnóstico | Quedan `console.debug('[fx]…')` en `socket.service.ts` y `board.ts` desde "logs de prueba"; ya no hacen falta. |
| Media (solo en desarrollo) | Consola de Windows | Hacer clic o seleccionar texto en la ventana del backend la pausa, y Node (que escribe los logs de forma síncrona) se congela sin dar error: el puerto sigue abierto pero nadie contesta, y los clientes muestran problemas de conexión. Se arregla apretando Enter en esa ventana. `start-dev.ps1` ahora apaga ese modo al abrir cada ventana. No pasa en Render. |
| Baja | Botón de sincronizar | Está comentado en `board.html`. |

## 9. Checklist de prueba manual (dos pestañas)

Para **Azes** y para **Chinchón** (en Chinchón, que el total siga siendo 54 cartas):
- [ ] Partida normal completa hasta ganar o perder.
- [ ] Cortar el wifi de una pestaña a mitad de **su turno** y volver antes de 90 s.
- [ ] Cortar durante el **robo** y justo al **descartar**.
- [ ] Cortar durante el **turno del rival** y volver después de que cambió el turno.
- [ ] Cortar más de 90 s: el rival debe ver el aviso de abandono.
- [ ] Cortar a quien está en "Esperando rival…" y volver.
- [ ] Ganar o empatar mientras el rival está offline y que reciba el resultado al volver.
- [ ] Recargar la pestaña a mitad de partida (vuelve a la partida con su mano).
- [ ] Revancha.
- [ ] Efecto de vuelo con las dos ventanas visibles; nada queda oculto después.
- [ ] Mirar los `[net]` del servidor durante las pruebas anteriores (que cada corte deje su `disconnect` y su `rejoin_ok`).

## 10. Pendientes de proceso

- Subir los tags si se quiere: `git push origin v1.1.0 v1.2.0 v1.3.0 v1.4.0` (hoy solo en local).
- Probar en producción los cortes de conexión (sección 9).
- Antes de publicar, confirmar que el frontend apunta a Render (`src/enviroments/environment.prod.ts`).

## 11. Qué sigue (a definir)

Bloques candidatos, sin orden fijado:
1. **Conexión pobre**: acciones con identificador, plan B de transporte, ajustar tiempos con los datos del registro, pruebas de corte en Chinchón (sección 3).
2. **Chinchón**: marcar combinaciones durante la ronda y lo demás de la sección 4.
3. **Cerrar la fase 2**: paso (e), cuando termine el período de prueba (sección 5).
4. **Plataforma**: carga diferida, `SocketService` genérico, más de dos jugadores (sección 6).
5. **Panel de admin** (sección 7).
6. **Deudas chicas** (sección 8).

## Anexo: por qué se perdían cartas (fase 1)

Antes del servidor autoritativo el juego era **cliente-autoritativo**: cada `playCard` mandaba el estado entero y el servidor lo pisaba (último en llegar gana). Causas encontradas y ya corregidas: (1) la reconexión cambiaba el `socket.id` y el rival seguía usando el id viejo; (2) un snapshot atrasado del rival pisaba mazo y mano locales en pleno robo; (3) `rejoined` y el cambio de paso disparaban dos robos en paralelo; (4) al descartar se pasaba el turno antes de enviar la carta. En la fase 1 se resolvió con `playerId` estable, escrituras acotadas por jugador, margen de gracia, turnos idempotentes, detección rápida de caídas y un candado contra el doble robo; en la fase 2, con el servidor autoritativo, el estado versionado y el chequeo de cartas.
