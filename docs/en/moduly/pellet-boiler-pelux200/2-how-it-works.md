# Module pellet-boiler-pelux200 — how it works

[← System documentation](../../README.md) · [1. Business description](1-business-description.md) · **2. How it works** · [3. Technical documentation](3-technical-documentation.md) · [Polski](../../../moduly/pellet-boiler-pelux200/2-zasada-dzialania.md)

## Diagram

```mermaid
flowchart LR
    ECO["Pellux 200 boiler<br/>ecoMAX controller<br/>(module A)"] -- "RS-485 115200 baud<br/>SensorData frames,<br/>receive only" --> CO["co (ESP32)<br/>UART2, second role"]
    CO -- "POST /devices/register<br/>(after the first valid frame)" --> SRV["chpc-web"]
    CO -- "POST /pellet-boiler-pelux200/add<br/>every poll_interval_seconds" --> SRV
    SRV -- "{poll_interval_seconds}" --> CO
    SRV --> DB[("MongoDB:<br/>devices,<br/>pellet_boiler_pelux200")]
    WEB["web application"] <--> SRV
```

The controller side (wiring, frame parser, pins, protocol) is described in [piec-pellux200.md](../../../../devices/co/docs/piec-pellux200.md) (Polish). This document describes the cloud and application side. The boiler is **only a data source**: the server has no scheduler, no operations and no control replies for it (the only value sent back to the controller is the polling interval).

## Stages

| Stage | Scope | Status |
|---|---|---|
| 1 | `co` receives `SensorData` frames from the boiler bus and sends readings to the cloud | implemented; frame format from PyPlumIO **not verified on a boiler** |
| 2 | `co` answers the controller's device-presence query (`CheckDevice`) and transmits on the bus, boiler control | **not implemented** |

## Two roles of one controller

The same physical `co` controller is two devices in the cloud with the same `deviceId` (SN) but a different kind and a different `rootId`.

```mermaid
flowchart TB
    CO["co controller<br/>SN = AABBCC000001"]
    CO -- "role 1: deviceType = heat_pump<br/>rootId = A" --> HP["device: heat pump"]
    CO -- "role 2: deviceType = pellet-boiler-pelux200<br/>rootId = B (NVS: pellet_root)" --> PB["device: Piec Pellux 200"]
    HP -. "POST /hp/add, /pv/add" .-> CO
    PB -. "POST /pellet-boiler-pelux200/add" .-> CO
```

- The boiler has its own Root ID in the controller memory (key `pellet_root`), independent of the pump's Root ID.
- The server tells the roles apart by the **endpoint path**: `device-context` has a `controllerPaths` map (endpoint → kind) and looks the device up by the pair `{deviceId, deviceType}`. Registration also uses that pair. So `POST /pellet-boiler-pelux200/add?deviceId=SN` reaches the boiler and `POST /hp/add?deviceId=SN` reaches the pump.
- A `rootId` of the other role gives **409**: a pump `rootId` sent to the boiler endpoint (and the other way round) is rejected, so the controller drops the Root ID of that role and registers again.

## Registration: only after the first valid frame

```mermaid
sequenceDiagram
    participant K as boiler (ecoMAX)
    participant C as co controller
    participant R as POST /devices/register
    participant A as POST /pellet-boiler-pelux200/add
    participant M as MongoDB
    K->>C: SensorData frames (continuously, to the panel)
    Note over C: no valid frame yet — the boiler does not register
    C->>R: {deviceId: SN, deviceType: "pellet-boiler-pelux200", name: "Piec Pellux 200"}
    R->>M: create the device (properties.poll_interval_seconds = 300) or return the existing one
    R-->>C: {rootId, ..., settings: {poll_interval_seconds}}
    C->>C: store rootId (pellet_root) and the interval (pellet_poll) in NVS
    loop every poll_interval_seconds
        C->>A: the last valid reading (younger than 60 s)
        A->>M: save the reading
        A-->>C: 201 {poll_interval_seconds}
        C->>C: store the new interval in NVS
    end
    Note over C,A: 404 or 409 → the controller drops the boiler Root ID<br/>and retries registration every 60 s
```

- A controller with no boiler (no valid frame at all) does not create the boiler device.
- The name "Piec Pellux 200" goes only to a **new** device; a known device keeps its name.
- The controller may also send a reading with `deviceId` only (no `rootId`) if a device with that SN and kind `pellet-boiler-pelux200` already exists.

## Saving a reading in the cloud

```mermaid
flowchart TD
    B["POST /pellet-boiler-pelux200/add<br/>{state, heating_temp, ..., fan, alarm}"] --> V{"body is an object,<br/>numeric fields are finite numbers,<br/>logical fields are boolean,<br/>at least one measurement field?"}
    V -- no --> E400["400: Nieprawidłowy odczyt kotła."]
    V -- yes --> S["save to pellet_boiler_pelux200<br/>(rootId, deviceType, deviceId + fields);<br/>time from the server clock"]
    S --> C["last reading in server memory (per rootId)"]
    S --> W["WebSocket: update → browsers"]
    S --> R["201 reply:<br/>{poll_interval_seconds}"]
```

- All measurement fields are optional: the controller sends what it managed to read. A single field of the wrong type rejects the whole reading (400).
- The `time` field and unknown keys are **ignored**: the record time (`createdAt`) is set by the server when it accepts the reading.
- The reply carries the current `poll_interval_seconds`, so a change in the application reaches the controller with the next send, without a new registration.

## Polling interval: application ↔ controller

```mermaid
sequenceDiagram
    participant U as application (Settings)
    participant S as server
    participant C as controller
    U->>S: PUT /device/properties {poll_interval_seconds: minutes × 60}
    S->>S: validation: whole seconds 30–3600 (otherwise 400)
    Note over C: the next reading send
    C->>S: POST /pellet-boiler-pelux200/add
    S-->>C: 201 {poll_interval_seconds: new value}
    C->>C: store in NVS, apply the new interval
```

The application form takes minutes (0.5–60) and saves `round(minutes × 60)` seconds. `PUT /device/properties` replaces the whole `properties`, so the application sends the loaded object with the new value of the field.

## Application screens

| Screen | Data | Refresh |
|---|---|---|
| **Kocioł** (`/`) | `GET /pellet-boiler-pelux200/last`, `GET /device/properties` (the interval, to judge freshness) | last reading every 30 s |
| **Dane** (`/data`) | `GET /pellet-boiler-pelux200/list?date=YYYY-MM-DD`, CSV in the browser | on entry and on date change |
| **Ustawienia** (`/settings`) | `GET/PUT /device/properties`; the "Sterownik" section with `DeviceEditModal` | on entry |

- **Data freshness.** A reading is stale when it is older than `3 × poll_interval_seconds` (or has no time): the view then shows "Dane nieaktualne". The default interval used for the judgement is 300 s until the properties are loaded.
- **Alarm state.** The title of the Kocioł view is red when `alarm` is `true` or `state` = 8 (Alarm).
- **No data.** An `{}` reply from `/last` gives the message "Brak danych od sterownika" (no data from the controller).
- Paths outside the boiler menu (`/schedules`, `/chart`, `/hp`) redirect to `/`.
