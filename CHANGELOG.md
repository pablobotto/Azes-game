# Changelog

Qué trae cada versión. Las fechas son las del commit que la subió.

## 1.5.0 — 2026-11-03
- **Chinchón** completo y jugable de a dos: robar del mazo o del descarte, descartar, cerrar con menos de 5 puntos sueltos, −10 por cerrar sin sueltas, chinchón gana la partida, rondas hasta 100, revancha.
- Pantalla propia con arrastrar para acomodar la mano, fin de ronda con las combinaciones de cada uno y efecto de vuelo de cartas en los dos clientes.
- El estado de sala es genérico (`RoomState` + `GameModule<S>`): cada juego define el suyo. El servidor ya usa `minPlayers`/`maxPlayers` del módulo y el turno pasa al siguiente asiento (preparado para 3 o 4 jugadores).
- Registro de conectividad en el servidor (`[net] event=...`): conexiones, caídas con motivo, reconexiones con el tiempo que estuvo fuera, jugadas rechazadas y resincronizaciones.
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
