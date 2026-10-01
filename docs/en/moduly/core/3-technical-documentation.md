# Core module — technical documentation

[← System documentation](../../README.md) · [1. Business description](1-business-description.md) · [2. How it works](2-how-it-works.md) · **3. Technical documentation** · [Polski](../../../moduly/core/3-dokumentacja-techniczna.md)

## Files — server (`server/src`)

| File | Role |
|---|---|
| `server.ts` | entry point: MongoDB, heat pump scheduler, PV panel cleanup, weather, HTTP and WebSocket listening |
| `core/app.ts` | Express application: CORS, JSON, `device-context` and routes under `/api` |
| `core/routes.ts` | assembles the routes: devices and `/temperature` from core plus each module's `routes.ts` |
| `core/types.ts` | `DeviceType`, `Device`, `DeviceProperties` (one settings field for all kinds), `DeviceTypeModule` |
| `core/device-types.ts` | controller kind registry: `DeviceType` → module description (`device-type.ts`) |
| `core/time.ts` | `TIME_ZONE = Europe/Warsaw`, Warsaw day boundaries as a UTC range |
| `core/websocket.ts` | WebSocket server (`/ws?rootId=`), `sendMessage(type, rootId)` with a 1 s delay |
| `core/middleware/device-context.ts` | resolves the device from `rootId` or (for controller paths in the `controllerPaths` map) from the pair `{deviceId, deviceType}`; 400/404/409 |
| `core/middleware/auth.ts` | `verifyApiKey` — **unused** (disabled in `app.ts`) |
| `core/middleware/mock-response.ts` | leftover, unused |
| `core/models/device.model.ts` | Mongoose model `devices`: device schema, `properties`, embedded schedules and legacy `settings` |
| `core/controllers/device.controller.ts` | device routes; the registration reply includes `settings` from the registry |
| `core/controllers/meteo.controller.ts` | `GET /temperature` |
| `core/controllers/firmware.controller.ts` | `/firmware/:kind...`: state, file upload, offer, download; only kinds with `firmwareUpdates` |
| `core/models/firmware.model.ts` | `firmware_images` (`.bin` file, size, SHA-256) and `firmware_offers` (offered and previous version, `enabled`) |
| `core/services/firmware.service.ts` | image validation and storage (ESP32 header, ≤ 1,310,720 B), offer for the controller, pruning to the current and one previous version |
| `core/services/device.service.ts` | list, create, register, name, default, read and write `properties` |
| `core/services/device-info.service.ts` | device kind and `deviceId` cached in memory (for module data records) |
| `core/services/calendar.service.ts` | Polish holidays, day of the week in Warsaw |
| `core/services/meteo.service.ts` | temperature from the IMGW Zakopane station |

## Files — client (`client/src`)

| File | Role |
|---|---|
| `index.tsx` | entry point: `DeviceProvider` + `App` |
| `style.css` | global styles (layout, header, footer, phone rules `@media (max-width: 560px)`) |
| `core/App.tsx` | routing, `DeviceGuard` (forces a controller choice, switches to the default one), `DeviceRoute`, footer |
| `core/device-types.tsx` | registry: `DeviceType` → `DeviceTypeView` (tile icon, menu screens, extra routes) |
| `core/types.ts` | `DeviceType`, `Device`, `DeviceProperties`, `DeviceView`, `DeviceTypeView` |
| `core/http.ts` | API and WebSocket addresses, requests with the selected controller's `rootId` and `deviceId` |
| `core/api.ts` | `DeviceRequests`: list, name, default, `properties` |
| `core/context/DeviceContext.tsx` | selected controller (state + `localStorage` `chpc.selectedDevice`), `deviceLabel` |
| `core/components/Header.tsx` | menu from the registry |
| `core/components/DeviceEditModal.tsx` | "Dane sterownika" popup (rename) |
| `core/components/Notification.tsx` | short message at the top of the screen |
| `core/components/icons.tsx` | shared menu icons (Data, Chart, Settings) and action icons (add, delete, restore, back, edit) |
| `core/components/IconButton.tsx`, `iconButton.css` | icon button template (icon only in the accent colour, a danger variant for deletion, label as tooltip and aria-label); used in the tank Settings, the pump Schedules and the firmware page |
| `core/pages/Devices/` | controller choice screen: tiles, default star, pencil |
| `core/pages/Firmware/` | `/firmware/:deviceType`: current version with description, previous versions (restore, delete), adding a version with a description in a popup (plus icon on the bar), offer switch; outside the device context |
| `core/components/FirmwareStatus.tsx` | controller firmware version, "waiting for update" state and report time in the controller Settings |
| `core/pages/_404.tsx` | leftover, unused |

## API

All paths are prefixed with `/api`. Except for the public paths a request needs `?rootId=` (the client adds it automatically, together with `deviceId`). Exception: the controller endpoints in the `controllerPaths` map (below) also accept `?deviceId=` alone.

### The `controllerPaths` map (`core/middleware/device-context.ts`)

The same SN may be registered under several controller kinds (roles of one physical controller), so a controller endpoint has to know which device kind it is looking for. The `controllerPaths` map assigns a kind to a path:

| Path (relative to `/api`) | Kind |
|---|---|
| `/hp/add`, `/pv/add` | `heat_pump` |
| `/water-pressure-tank/add`, `/water-pressure-tank/settings` | `water-pressure-tank` |
| `/pellet-boiler-pelux200/add` | `pellet-boiler-pelux200` |

Behaviour for a path in the map:

- no `rootId`, `deviceId` alone: `DeviceModel.findOne({deviceId, deviceType})`; unknown — 404;
- with `rootId` (and possibly `deviceId`): the device by `rootId`; **409** when its `deviceId` differs from the one given or its `deviceType` differs from the path kind (e.g. a pump `rootId` on `/pellet-boiler-pelux200/add`);
- neither `rootId` nor `deviceId` — 400.

Paths outside the map (application, `GET`s, `/device/properties`) require `rootId` and do not check the kind.

| Method and path | Context | Description | Replies |
|---|---|---|---|
| `GET /devices` | public | device list: `rootId`, `deviceType`, `deviceId`, `name`, `isDefault` | 200 |
| `POST /devices` | public | manual creation (not used by the client; used by the E2E test) | 201; 400 if the SN exists |
| `POST /devices/register` | public | controller registration `{deviceId, deviceType?, name?}`; `deviceType` defaults to `heat_pump` | 201 new, 200 known (+ `settings` for kinds with `controllerSettings`); 400 missing SN / unknown kind |
| `PUT /devices/:rootId` | public | rename `{name}` (empty allowed) | 200; 400; 404 |
| `PUT /devices/:rootId/default` | public | default controller `{isDefault}` (no field: set); clears the flag on the others | 200; 404 |
| `GET /device/properties` | `rootId` | device settings | 200; 404 |
| `PUT /device/properties` | `rootId` | save the whole settings object (Mongoose schema validation) | 200; 400 |
| `GET /temperature` | `rootId` | latest IMGW temperature (number or `null`) | 200 |

WebSocket: `ws(s)://<server>/ws?rootId=<rootId>`. The server sends `{"type":"operation"|"update","rootId":"…"}`; a connection without `rootId` is closed with code 1008.

## Data model — `devices` collection

| Field | Type | Description |
|---|---|---|
| `_id` | ObjectId | Root ID |
| `deviceType` | `heat_pump` \| `water-pressure-tank` \| `pellet-boiler-pelux200` | controller kind (role) |
| `deviceId` | string | controller SN (ESP32 MAC, 12 hex characters); devices of different kinds may share an SN (roles of one controller), no unique index |
| `name` | string | user-given name, empty by default |
| `isDefault` | boolean | default controller, at most one |
| `firmwareVersion`, `firmwareSeenAt` | string, Date | firmware version from the registration `version` field and its time; older controllers do not send them |
| `properties` | object | settings; heat pump: `co_min`, `co_max`, `cwu_min`, `cwu_max`, `work_mode` (default `CWU`); tank: `compressor_seconds` (1–3600), `pressure_low`, `pressure_high`, `tanks[]`; pellet boiler: `poll_interval_seconds` (integer 30–3600, default 300; seconds between boiler readings sent by the controller) |
| `schedules[]` | object | heat pump schedules (heat-pump module) |
| `settings` | object | legacy heat pump time settings (not used by the scheduler) |
| `createdAt`, `updatedAt` | Date | timestamps |

The device document is shared by all kinds, so `core/models/device.model.ts` imports part schemas from the modules (schedule, tank).

## Controller kind registry

**Server** — `core/types.ts`, `DeviceTypeModule`:

```ts
{
  type: DeviceType;
  initialProperties?: DeviceProperties;                       // settings of a new device
  controllerSettings?: (properties: DeviceProperties) => unknown; // settings field in the registration reply
}
```

**Client** — `core/types.ts`, `DeviceTypeView`:

```ts
{
  type: DeviceType;
  tileIcon: ReactNode;                                    // tile icon on the list
  views: { path, label, icon, element }[];                // screens in menu order; '/' = home page
  extraRoutes?: { path, element }[];                      // routes outside the menu (e.g. the heat pump's /hp)
}
```

### Adding a new controller kind

1. A value in `DeviceType` — in `server/src/core/types.ts` and `client/src/core/types.ts` (the same one).
2. Server: a `server/src/modules/<kind>/` folder with `controllers/`, `services/`, `models/`, `types.ts`, `routes.ts`, `device-type.ts`; an entry in `server/src/core/device-types.ts`; `routes.ts` added in `server/src/core/routes.ts`; paths the controller calls with the SN only — in `controllerPaths` in `device-context.ts`, together with the kind (without an entry the path requires `rootId` and the kind is not checked).
3. Client: a `client/src/devices/<kind>/` folder with `pages/`, `api.ts`, `types.ts`, `device-type.tsx`; an entry in `client/src/core/device-types.tsx`.
4. If the kind has its own settings in `properties`: fields in `DeviceProperties` (both `types.ts`) and in the schema in `device.model.ts`.
5. Firmware: registration with the new `deviceType`.
6. Documentation: `docs/moduly/<kind>/` (three parts, plus `docs/en/`) and an entry in `docs/README.md`.

## Configuration

| Variable (server) | Meaning |
|---|---|
| `MONGODB_URI` | MongoDB connection; required, the server stops without it |
| `PORT` | HTTP and WebSocket port (default 3001) |
| `API_KEY` | key for `verifyApiKey` (currently unused) |

Values live only in environment variables: on Render in the service Environment, locally in `server/.env` (outside git, template `server/.env.example`).

In development the client talks to the server on port 4001 of the same host the page was opened from; in production to `https://chpc-web.onrender.com`. The addresses are in `client/src/core/http.ts`.

## Local environment and demo data

```bash
npm run local                    # database (27027, .local-db/), server (4001), application (5173)
node scripts/seed-local.mjs      # clears the local database and loads demo data
```

`scripts/seed-local.mjs` writes to the local database only. From production it reads (public GET) the heat pump telemetry and PV of the last days and replaces the identifiers with made-up ones; it generates the tank data (several months of runs and water meter readings). After loading, restart the local server, because it keeps data in memory.

## Tests

- `server/test/app.test.ts` — devices (registration, name, default, unknown rootId) and the heat pump API; `mongodb-memory-server` database.
- `server/test/water-pressure-tank.test.ts` — among others tank registration with settings, default controller, context 404/409.
- `server/test/pellet-boiler-pelux200.test.ts` — among others two roles of the same SN (two `rootId`s, routing by endpoint kind, 409 for a `rootId` of the other role), boiler registration with `settings`, `poll_interval_seconds` validation in `PUT /device/properties`.
- The heat pump's `pv.test.ts` and `scheduler.test.ts` live in the same `server/test/` folder; the server has 81 tests in total.
- The client has no unit tests; the checks are `tsc` and `vite build`.

```bash
npx tsc -p server/tsconfig.tests.json --noEmit
npm test -w server -- --run
npm run build -w client
```

## Deployment

The server and the client are deployed together from the `main` branch to Render (build started manually). A core change that alters the API needs the server to be deployed before the firmware.

## Known issues

- **No API protection.** `app.use(verifyApiKey)` is commented out; the `x-api-key` key is compiled into the client (`core/http.ts`), so it would be public anyway. `verifyApiKey` checks `/api/operation/set` and `/hp/clear` — inconsistently (one with the prefix, one without).
- **Data in server memory** (`device-info.service.ts`, latest telemetry, manual operations) is lost on restart; after changing `deviceId` in the database the server has to be restarted.
- **The IMGW station** is hard-coded (`meteo.service.ts`, Zakopane).
- **SN and kind.** Registration, `POST /devices` and `device-context` for paths in `controllerPaths` look a device up by the pair (kind, SN), so the same SN may have several devices of different kinds (`co` roles). A controller path missing from `controllerPaths` gets 400 for a `deviceId` alone and does not check the kind for a `rootId`; a new controller endpoint has to be added there.
- **`PUT /device/properties` replaces the whole `properties`** — omitted keys disappear. The client always sends the full set of its kind's fields.
- **The device kind is checked only on controller endpoints** (`controllerPaths`: a mismatched kind gives 409). The other module endpoints (e.g. `GET /hp` with a tank's `rootId`) do not check it.
- **A new heat pump gets no `properties`** on registration (the pump's `initialProperties` is empty); the `CWU` mode comes from a fallback in the scheduler.
- **The WebSocket** accepts a connection on any path and does not check that `rootId` exists; a message reaches every connection of that `rootId` (browsers also get `operation`, `co` gets `update`).
- **Client error handling (`core/http.ts`)**: `get` returns `null`, `post` swallows the error (with `json = false` it returns the `Response`), `put` and `delete` throw — so screens show save errors differently.
- **Page styles end up in one CSS bundle** — unprefixed rules (e.g. `button`, `img`, `span.label` in `devices/heat-pump/pages/Settings/style.css`) apply to the whole application.
- `mock-response.ts` and `_404.tsx` are unused.
