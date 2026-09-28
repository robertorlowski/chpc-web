# Heat-pump module — business description

[← System documentation](../../README.md) · **1. Business description** · [2. How it works](2-how-it-works.md) · [3. Technical documentation](3-technical-documentation.md) · [Polski](../../../moduly/heat-pump/1-opis-biznesowy.md)

## Why this module exists

The module handles the **heat pump** in the application: a pump driven by the CHPC controller and connected to the cloud through the `co` controller. From a phone or a computer the user can:

- decide **what the pump heats and when**: central heating (CO, *centralne ogrzewanie*), domestic hot water (CWU, *ciepła woda użytkowa*) or nothing;
- set **temperatures** and **schedules** (hours, working days and days off including Polish holidays, specific dates, breaks);
- give a **manual command**: forced start, circulation pumps, the expansion valve (EEV), the power limit;
- see the **live pump state**, the **history** of readings, **charts** of energy and temperatures and the **energy cost** in the G12w tariff;
- see **pump controller errors**, unlock it and restart it remotely;
- follow the **photovoltaic production**, because surplus PV is worth using for heating.

Every minute the server works out from the schedules what the pump should do. The application does not have to be open.

## Who uses it

**The home owner** with a CHPC heat pump and a `co` controller — a single person, no user accounts.

## Operating modes

| Mode | In the application | What the pump does |
|---|---|---|
| `A` | **CO Harmonogram** (heating schedule) | heating (CO) schedules and breaks apply; outside them the pump heats hot water (CWU) |
| `CWU` | **CWU Harmonogram** (hot water schedule) | hot water schedules and breaks apply; outside them the default setting |
| `M` | **manual** | schedules do not apply, the default setting does; at midnight the mode returns to `A` |
| `OFF` | **off** | the compressor does not start |

## Screens

The user interface is in Polish; the screenshots show it as is.

![Main view](../../../moduly/heat-pump/img/glowny.png)

*Main view (HP): operating mode, temperature in the middle of the tank (T), CO and CWU pump state, PV power, outdoor temperature, pump parameters (temperatures, power, EEV, power limit), circuit and compressor state, current cycle data (run time, energy, COP) and photovoltaics. It refreshes by itself after every controller report.*

| Phone | Schedules on a phone |
|---|---|
| ![Main view on a phone](../../../moduly/heat-pump/img/glowny-telefon.png) | ![Schedules on a phone](../../../moduly/heat-pump/img/harmonogramy-telefon.png) |

![Data](../../../moduly/heat-pump/img/dane.png)

*Data: readings of the selected day (every 10–30 s), a filter in every column; "Wszystkie dane" also shows compressor idle time, "Pobierz dane" saves a CSV file.*

![Day chart](../../../moduly/heat-pump/img/wykres-dzien.png)

*Day chart: temperatures (before and after the evaporator, outgoing water, target) and power drawn; above the chart the day's energy use and cost.*

![Month chart](../../../moduly/heat-pump/img/wykres-miesiac.png)

*Month chart: energy drawn per day and the estimated cost in the G12w tariff; optionally PV production. The year view shows the same per month.*

![Settings](../../../moduly/heat-pump/img/ustawienia.png)

*Settings: operating mode and temperatures for now, pump parameters (EEV, power limit), forced start and circulation pumps, controller errors with "Odblokuj" (unlock) and "Restart sterownika" (restart) buttons, controller data.*

![Schedules](../../../moduly/heat-pump/img/harmonogramy.png)

*Schedules: operating mode and default temperatures, the schedule list grouped into CWU / CO / breaks. A red line under a group name means the group is active in the chosen mode; a red bar on the left marks the entry in force right now (here: the default setting).*

## Typical scenarios

1. **Winter, cheap night tariff.** "CO Harmonogram" mode, CO schedule 21:30–5:30 (G12w night) and 12:30–15:00; at other hours the pump heats CWU.
2. **Summer.** "CWU Harmonogram" mode, CWU schedules during PV production hours with forced start.
3. **Holidays.** `OFF` mode or an `off` break for specific dates.
4. **A fault.** A red bell appears in the main view; Settings show the error description and date. After five errors the pump controller locks — "Odblokuj" removes the lock, "Restart sterownika" restarts it.
5. **Cost control.** The month chart shows use and cost; comparing it with PV production shows how much energy came from photovoltaics.

## Limitations

- **No range validation in the application.** An out-of-range value is "set" in the application, but the `co` controller or the pump rejects it. What the pump really uses is visible in the data (power limit, EEV, temperatures).
- **Ordinary commands reach the pump within 10–30 s** (at the controller's next report); only "Odblokuj" and "Restart" act immediately — and only when `co` is in CLOUD mode.
- **Manual commands live in server memory** — a server restart clears them; they also expire when a schedule ends.
- **The error time is approximate** (to 10–30 s), because the pump has no clock.
- **The energy cost is an estimate** based on the G12w tariff written into the code.
- **The pump has one sensor in the tank** — "T" in the main view is the temperature in the middle of the tank, not the target temperature.

## Glossary

| Term | Meaning |
|---|---|
| **CO** | central heating |
| **CWU** | domestic hot water |
| **CHPC** | heat pump controller (Arduino Pro Mini): compressor, circulation pumps, EEV valve, protections |
| **co** | ESP32 controller between the pump, photovoltaics and the cloud |
| **Telemetry** | pump state sent by `co` every 10 s (compressor running) or 30 s (idle) |
| **Operation** | what the pump should do (mode, temperatures, forced start…); the server returns it in the reply to telemetry |
| **Schedule** | a range of hours on chosen days in which `co` / `cwu` work or an `off` break applies |
| **Default setting** | mode and temperatures in force outside schedules |
| **Forced start** (`force`) | compressor start without waiting for the temperature to drop; the pump accepts it only when idle |
| **HPS** | compressor state (running / idle) |
| **EEV** | electronic expansion valve; "EEV temp." is the target superheat |
| **COP** | coefficient of performance: heat delivered / energy drawn (estimate for the 300 l tank) |
| **G12w** | two-zone electricity tariff with cheaper nights, weekends and part of the day |
| **PV** | photovoltaics; read from Hoymiles microinverters (DTU) |
