# TV Hub V6, Teacher Reference

Proyecto de clase con Node.js, Express, TypeScript, MongoDB y Mongoose. Esta versión docente incluye las implementaciones completas de Watch y Channel Reports.

TV Hub V6 agrega operaciones de soporte sobre Reports: correo con Nodemailer, escalación programada con node-cron, sincronización en tiempo real con Socket.IO, cierre administrativo y métricas de atención. Los usuarios ven sus propios Reports; el rol `ADMIN` usa `/support-reports.html` y `/support-metrics.html`. Consulte [la guía de operaciones de V6](docs/tv-hub-v6-operations.md).

## Session 15: TODOs V6 implementados

Se implementaron los siete puntos de trabajo para Session 15. Los TODOs históricos de V4 y V4.5 no forman parte de esta lista.

| TODO | Archivo | Actividad |
| --- | --- | --- |
| TODO V6 CRON 1 | `src/jobs/report-escalation.job.ts` | Escalar Reports `OPEN` vencidos, persistirlos y emitir su actualización. |
| TODO V6 CRON 2 | `src/jobs/report-escalation.job.ts` | Programar el job periódico con `node-cron` y manejar sus errores. |
| TODO V6 CRON 3 | `src/server.ts` | Iniciar el job después de conectar MongoDB. |
| TODO V6 MAIL 1 | `src/notifications/report-email.ts` | Construir el email de creación de un Report. |
| TODO V6 MAIL 2 | `src/notifications/report-email.ts` | Construir el email de resolución de un Report. |
| TODO V6 MAIL 3 | `src/controllers/report.controller.ts` | Intentar el email de creación después de persistir, sin revertir el Report ante un fallo. |
| TODO V6 MAIL 4 | `src/controllers/report.controller.ts` | Intentar el email de resolución después de persistir, sin revertir el cierre ante un fallo. |

## Práctica Integradora 1

- El registro, login, refresh y logout de V1 siguen funcionando.
- `Channel` es un modelo de Mongoose alimentado por playlists M3U locales.
- `GET /api/channels` devuelve los canales activos; acepta `search`, `category`, `country` y `sort=country` de forma opcional.
- La página Home usa `fetch('/api/channels')` y muestra tarjetas con logo, nombre, país y categorías.
- Home agrupa canales por país, muestra hasta cinco por país y permite filtrar por categoría.
- Favorites permite buscar y ordenar canales guardados; Country muestra todos los canales de un país.
- Watch obtiene un canal por HTTP y usa Shaka Player para intentar reproducción HLS y DASH.
- Favorites está completo: permite crear, consultar y quitar favoritos, con estado visual sincronizado en Home y My Favorites.
- Los ejercicios guiados están en `docs/session-10-student-checkpoints.md`.
- Los ejercicios de Favorites están en `docs/session-12-student-checkpoints.md`.
- Las playlists M3U locales se importan con `npm run import:channels` o `npm run import:all-channels`.

## Session 14: Channel Reports

La actividad agrega un flujo de reportes para que una persona autenticada pueda enviar un problema de un canal, adjuntar hasta cinco evidencias de imagen, editar el reporte y eliminarlo junto con sus archivos locales. La arquitectura mantiene Route, Middleware, Controller, Model y View.

## Requirements

- Node.js 20 o superior
- Docker y Docker Compose

## Installation and environment

```bash
npm install
docker compose up -d
npm run build
npm run import:all-channels
npm run dev
```

La aplicación queda disponible en `http://localhost:3000`.

## Cargar canales desde las playlists

Para cargar todos los canales de los archivos con sufijo `_playlist.m3u` dentro de `docs/`, ejecute:

```bash
docker compose up -d
npm run build
npm run import:all-channels
```

El script encuentra las playlists locales, elimina los documentos existentes de `channels` y `favorites`, e inserta los canales importados. Conserva las colecciones de usuarios y sesiones.

Para importar o actualizar solamente una playlist, indique el archivo y el país:

```bash
npm run import:channels -- docs/japon_playlist.m3u Japan
```

La importación individual usa país más `tvgId` o, si falta, país más `streamUrl`, por lo que se puede ejecutar otra vez sin crear duplicados.

Las ramas históricas `tv-hub-v5-final` y `tv-hub-v5-base` corresponden al material de V5. Este workspace contiene la referencia docente actual de TV Hub V6.

Un clon nuevo usa `.env.example` automáticamente en desarrollo, por lo que no requiere crear un `.env` para empezar la clase. Si se necesita personalizar la configuración local, crear el archivo ignorado por Git:

```bash
cp .env.example .env
```

Las variables requeridas están documentadas en `.env.example`: `PORT`, `NODE_ENV`, `MONGO_URI`, secretos JWT y los TTL de ambos tokens. En producción se debe proporcionar un `.env` seguro o variables de entorno equivalentes; los secretos de ejemplo no son válidos para producción.

## Commands

```bash
npm run dev
npm run build
npm start
npm test
npm run test:watch
npm run import:channels -- docs/argentina_playlist.m3u Argentina
npm run import:all-channels
docker compose config
docker compose up -d
```

## Architecture

El flujo usa Route, Controller, Mongoose Model y MongoDB. Para canales intervienen `channel.routes.ts`, `channel.controller.ts`, `channel.model.ts`, MongoDB, JSON y `src/public/js/home.js`. Las rutas aplican middleware cuando hace falta; los controladores validan y coordinan; los modelos definen persistencia. El frontend es HTML, CSS y JavaScript vanilla con `fetch` nativo.

Para favoritos intervienen `home.js`, `favorite.routes.ts`, `authenticate`, `favorite.controller.ts`, `favorite.model.ts` y MongoDB. Un índice único en `userId` y `channelId` evita que un usuario guarde el mismo canal dos veces.

Para Reports intervienen `reports.js`, `report.routes.ts`, `authenticate`, Multer, `report.controller.ts`, `report.model.ts`, MongoDB y `uploads/reports`. El POST acepta hasta cinco imágenes. PATCH solo modifica `reason`, `description` y `status`; DELETE elimina el Report propio y procura borrar sus evidencias locales. Los estados disponibles son `OPEN`, `IN_PROGRESS` y `RESOLVED`.

## API

| Method | Endpoint               | Description                    |
| ------ | ---------------------- | ------------------------------ |
| GET    | `/health`              | Express health check           |
| GET    | `/ready`               | MongoDB readiness check        |
| POST   | `/api/auth/register`   | Creates a USER and signs in    |
| POST   | `/api/auth/login`      | Signs in and creates a session |
| POST   | `/api/auth/refresh`    | Rotates refresh token          |
| POST   | `/api/auth/logout`     | Revokes current session        |
| POST   | `/api/auth/logout-all` | Revokes all user sessions      |
| GET    | `/api/users/me`        | Current authenticated user     |
| GET    | `/api/admin/demo`      | ADMIN-only demonstration       |
| GET    | `/api/channels`        | Active channels from MongoDB   |
| GET    | `/api/channels/:id`    | One active channel for Watch   |
| GET    | `/api/favorites`       | Current user's favorite channels |
| POST   | `/api/favorites/:channelId` | Adds an active channel to the current user's favorites |
| DELETE | `/api/favorites/:channelId` | Removes a channel from the current user's favorites |
| GET | `/api/reports` | Current user's reports, newest first |
| POST | `/api/reports` | Creates a report with up to five optional image evidences |
| PATCH | `/api/reports/:id` | Updates reason, description and status of the current user's report |
| DELETE | `/api/reports/:id` | Deletes the current user's report and its local evidence files |

Las rutas de favoritos están completas en esta versión de referencia. Consulte `docs/session-12-student-checkpoints.md` para la secuencia didáctica de la funcionalidad.

Access and refresh tokens are sent as HttpOnly cookies. MongoDB only stores a SHA-256 hash of the refresh token (bcrypt is used for passwords; it truncates long JWT values). Refreshing replaces that hash, so the previous refresh token cannot be reused.

## Importación M3U local

Los archivos M3U se procesan únicamente en backend; el navegador nunca los lee:

```bash
npm run build
npm run import:channels -- docs/argentina_playlist.m3u Argentina
npm run import:all-channels
```

El importador individual lee metadatos de la playlist y actualiza por país más tvg-id o stream URL. La importación completa limpia Channels y Favorites antes de cargar todas las playlists de docs. La reproducción depende de que el stream remoto permita CORS y acceso directo desde navegador.
