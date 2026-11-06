# Azes Game

Juegos de cartas para dos personas en línea. Hoy hay dos:

- **Azes**: escaleras de A a K en el centro, con mazo propio, tres montones de descarte y comodines.
- **Chinchón**: mazo de póker con 2 comodines, mano de 7, se cierra con menos de 5 puntos sueltos y se juega por rondas hasta 100.

El servidor es el que decide: el cliente pide una acción (robar, jugar, descartar, cerrar) y el servidor la valida, la aplica y le manda a cada jugador su vista del estado. Así, aunque la conexión sea mala, no se pierden cartas.

## Piezas

| Parte | Dónde | Con qué |
|---|---|---|
| Frontend | `src/` | Angular 20 (sin zone.js), socket.io-client. Se despliega en Vercel. |
| Backend | `server/` | Node + socket.io, TypeScript. Se despliega en Render. |
| Juegos del servidor | `server/games/<juego>/` | Un módulo por juego (reglas, acciones, vista por jugador, invariante de cartas). |
| Pantallas | `src/app/components/board/` (Azes) y `src/app/components/chinchon/` | Cada juego tiene su pantalla; la barra superior es común. |

Los dos se despliegan solos desde `main`.

## Levantarlo en local

```
.\start-dev.bat          # backend :3000 + frontend :4200, en dos ventanas
.\start-dev.ps1 -Stop    # cierra lo que quede escuchando en 3000 y 4200
.\start-dev.ps1 -Legacy  # backend sin modo autoritativo (solo Azes, como la fase 1)
```

A mano:

```
cd server && npm install && npm run dev     # backend
npm install && ng serve                     # frontend, http://localhost:4200
```

El backend no se recarga solo: si cambiás algo en `server/`, hay que reiniciarlo. En desarrollo el frontend apunta a `http://localhost:3000` y en producción a Render (`src/enviroments/`).

## Pruebas

```
cd server && npm test        # reglas, acciones, vistas y estado de ambos juegos
ng build                     # compila el frontend
```

## Para sumar un juego

1. Crear `server/games/<id>/` con su `GameModule` (ver `server/games/types.ts`) y registrarlo en `server/games/registry.ts`.
2. Crear su pantalla en `src/app/components/` y mostrarla desde `board.html` según `viewGame`.
3. Agregarlo a `src/app/games/game-registry.ts` (el nombre del desplegable, de hasta 10 letras).

## Diagnóstico de conexión

El servidor escribe líneas `[net] event=...` con las conexiones, caídas (con el motivo), reconexiones y jugadas rechazadas. Se pueden filtrar en los logs de Render; ver el detalle en [ROADMAP.md](ROADMAP.md).

## Más

- [ROADMAP.md](ROADMAP.md): estado, pendientes y decisiones.
- [CHANGELOG.md](CHANGELOG.md): qué trae cada versión.
- Regla de base: **no se cambian las reglas de Azes**; cuando se mueve código, se mueve tal cual.
