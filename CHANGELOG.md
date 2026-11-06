# Changelog

Qué trae cada versión. Las fechas son las del commit que la subió.

## 1.5.1 — 2026-11-06
- Registro de conectividad en el servidor (`[net] event=...`): conexiones, caídas con motivo, reconexiones con el tiempo que estuvo fuera, jugadas rechazadas y resincronizaciones.
- **Chinchón: colada manual.** Después del cierre, quien no cerró arrastra sus cartas sueltas a las combinaciones de quien cerró para restar puntos; la carta colada se marca con borde dorado. El servidor comprueba que la combinación siga siendo válida. El resultado de la partida se decide cuando los dos confirman el fin de ronda (así la colada puede evitar llegar a 100); un chinchón sigue ganando al instante y no admite colada.
- Chinchón: las combinaciones con comodín se muestran ordenadas (el comodín en el hueco que rellena).
- Chinchón: al robar o descartar, las demás cartas de la mano se deslizan a su nuevo lugar en vez de saltar, y la carta que vuela aparece en el mismo cuadro en que sale de su lugar.
- Chinchón: una carta colada ya no tapa a su vecina dentro de la combinación.
- Desarrollo: `start-dev.ps1` apaga el modo "seleccionar" de la consola de Windows (hacer clic en la ventana del backend lo congelaba hasta apretar Enter) y ya no da error al poner el título de las ventanas.

## 1.5.0 — 2026-11-03
- **Chinchón** completo y jugable de a dos: robar del mazo o del descarte, descartar, cerrar con menos de 5 puntos sueltos, −10 por cerrar sin sueltas, chinchón gana la partida, rondas hasta 100, revancha.
- Pantalla propia con arrastrar para acomodar la mano, fin de ronda con las combinaciones de cada uno y efecto de vuelo de cartas en los dos clientes.
- El estado de sala es genérico (`RoomState` + `GameModule<S>`): cada juego define el suyo. El servidor ya usa `minPlayers`/`maxPlayers` del módulo y el turno pasa al siguiente asiento (preparado para 3 o 4 jugadores).
- Azes: el tablero ya no reacciona a los efectos de otros juegos.

## 1.4.0 — 2026-11-01
- **Efecto de vuelo** en Azes: cuando el rival juega, descarta o roba, se ve la carta moverse hasta su lugar. No se anima al reconectar, con la pestaña oculta ni con movimiento reducido.

## 1.3.1 — 2026-10-31
- Desplegable de juegos en la barra superior (Azes por defecto), a la derecha de **Unirse**.

## 1.3.0 — 2026-10-31
- **Refresh persistente**: recargar la pestaña vuelve a la partida (el `playerId`, la sala y el nombre viven en `sessionStorage`).
- `server/node_modules` sale del control de versiones.
- El servidor se organiza en módulos por juego (`server/games/`).

## 1.2.0 — 2026-10-31
- **Servidor autoritativo** para Azes: el cliente pide acciones y el servidor valida y aplica. Estado versionado, chequeo de las 108 cartas tras cada acción y vista por jugador (sin la mano del rival ni el mazo central).
- Se enciende por defecto; `AUTHORITATIVE=0` vuelve al modo anterior.
- Pruebas del servidor.

## 1.1.1 — 2026-10-31
- Mejoras de cliente y servidor previas al modo autoritativo.

## 1.1.0 — 2026-10-27
- **Conectividad y reconexión**: `playerId` estable, margen de gracia de 90 s, turnos idempotentes, detección de caídas más rápida, reconexión al volver internet.
- La versión se muestra junto a la sala.
- Se elimina el modo contra la computadora.
- La URL del backend depende del entorno; `skipLibCheck` para que compile en Render.
