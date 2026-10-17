# Core module — business description

[← System documentation](../../README.md) · **1. Business description** · [2. How it works](2-how-it-works.md) · [3. Technical documentation](3-technical-documentation.md) · [Polski](../../../moduly/core/1-opis-biznesowy.md)

## Why this module exists

Core is the shared part of the chpc-web application, independent of the device kind. It lets one application handle several controllers of different kinds (today a heat pump, photovoltaics, a water pressure tank, a switch and a pellet boiler), switch between them and add new kinds without rebuilding everything.

The module is responsible for:

- **the list of controllers** (tiles) and choosing the one the user works with;
- **self-registration of controllers**: a new controller shows up in the application by itself once it is on the internet; nothing has to be typed in;
- **controller names**, the tile layout and weather tiles;
- **user accounts**: login by e-mail and code, account data, sharing a controller with another person with a choice of tabs;
- **the shared look**: the controller bar with tabs, the bottom navigation on a phone, the light and dark theme, dialogs, the "Sterownik" card and the operations log;
- **menus and screens that depend on the controller kind** (the heat pump has schedules, the water pressure tank and photovoltaics do not);
- **shared services**: outdoor temperature (IMGW), the Polish public holiday calendar, fast notifications to the controller and the browser (WebSocket).

## Who uses it

- **The installation owner** — logs in, chooses a controller, names it, arranges the tiles, shares a controller with household members. Uses the application on a computer and on a phone.
- **The installer** (usually the same person) — connects a new controller; it is enough to give the controller Wi-Fi, the rest happens automatically.
- **The system user** — the administrative account (login "system" with a password): sees all controllers, manages the firmware of controller kinds and sees the database usage.

## What the user can do

| Action | Where |
|---|---|
| Log in | login screen: e-mail → code from the mail (or a link from the mail); after login the question "Zapamiętać?" (remember?) — a remembered session lasts 14 days |
| See all controllers and choose one | the "Sterowniki" tile list (`/devices`); the application always starts there |
| Give or change a controller name | pencil on the tile (on hover) or the pencil in the "Sterownik" card in Settings |
| Arrange tiles, hide a tile, add a weather tile for any town | grid icon in the bar → "Zmień układ" (change layout) mode: arrows (move, swap), eye (hide), "+ kafelek pogody" (weather tile) in an empty field, "Gotowe" (done) |
| Switch to another controller | the back arrow in the bar (to the list) or, on a phone, "Więcej" (more) → "Lista sterowników" (controller list) |
| See the Root ID, SN, IP address and firmware of a controller | the "Dane sterownika" dialog and the "Sterownik" card in Settings |
| Share a controller with another person (selected tabs) | the "Udostępnianie" (sharing) card in Settings → "Udostępnij" |
| Browse the controller's operations log | the "Operacje" tab (all kinds except photovoltaics) |
| Change the theme | the moon / sun icon in the bar (light ↔ dark) or the account menu: Jasny / Ciemny / Jak system (light / dark / as system) |
| Change account data, log out, delete the account | the account menu (avatar in the bar) → "Moje dane" (my data) |

The user interface is in Polish; the screenshots below show it as is.

![Controller list](../../../moduly/core/img/lista-sterownikow.png)

*Controller list (computer, light theme): the home weather strip at the top, tiles in a fixed layout — the icon and the left edge in the kind's colour (sun — photovoltaics, waves — heat pump, drop — water pressure tank, flame — pellet boiler, toggle — switch), the name, an Online / Offline chip, a big value with a caption, fact fields, a warning and the "dane sprzed …" (data from …) footer; the switch shows its relays with toggles. Below, weather tiles; at the bottom, the status bar with database usage (system user only). The pencil and the firmware cog appear when hovering a tile.*

![Controller list on a phone](../../../moduly/core/img/lista-sterownikow-telefon.png)

*The same list on a phone (360 px): one column, tiles one after another.*

![Change layout](../../../moduly/core/img/zmien-uklad.png)

*"Zmień układ" mode (grid icon in the bar): arrows move a tile, the eye hides it, an empty field can take a weather tile, "Gotowe" saves the layout. Hidden tiles are visible only here, greyed out with an "Ukryty" (hidden) chip.*

![Controller data](../../../moduly/core/img/dane-sterownika.png)

*The "Dane sterownika" dialog: the name can be changed; the kind, SN (Device ID) and Root ID are read-only; below, the fields of the controller kind (here the heat pump configuration with the piping diagram).*

| Phone — bar and bottom navigation | Phone — "Więcej" |
|---|---|
| ![Controller bar on a phone](../../../moduly/core/img/nawigacja-pompa-telefon.png) | !["Więcej" sheet](../../../moduly/core/img/nawigacja-wiecej-telefon.png) |

*The controller bar: a back arrow to the list, the name, below it an Online / Offline chip and a kind-dependent description (mode and SN, number of panels, last run, relays and firmware, regulator and read interval), the theme icon and the account avatar. On a computer (from 900 px) the tabs form a side menu on the left; on a phone the bottom navigation shows the first four views and "Więcej" — a sheet with the remaining views and "Lista sterowników". The tabs depend on the kind: the heat pump has six (HP, Dane, Wykres, Harmonogram, Operacje, Ustawienia), the tank and the switch five, the boiler seven (with Alarmy), photovoltaics four.*

![Login](../../../moduly/core/img/logowanie.png)

*Login: a card with the e-mail address; the code and the link arrive by mail. The theme icon already works on this screen.*

![Firmware of a controller kind](../../../moduly/core/img/firmware.png)

*The firmware page of a controller kind (cog on the tile, system user only): the cards "Aktualna wersja" (current version; the plus opens the "Dodaj wersję" card), "Sterowniki tego rodzaju" (controllers of this kind, with the version from the last report) and "Poprzednie wersje" (previous versions).*

![Operations](../../../moduly/core/img/operacje.png)

*The "Operacje" tab: the day (arrows or calendar), the filter Wszystkie / Użytkownik / System (all / user / system) and a timeline of events: time, who and from where, what changed and a state chip (done, delivered, pending, error). The log keeps 5 days.*

## Typical scenarios

1. **A new controller.** The installer connects the controller and sets its Wi-Fi. The controller registers itself with the cloud and appears on the list — without a name, with its identifier (SN) only. The user names it with the pencil.
2. **Everyday use.** When opened, the application shows the tile list with the current state of every controller (temperature, power, water, relays). Clicking a tile opens the controller's screens; the arrow in the bar goes back to the list.
3. **Several controllers.** The user switches through the list (back arrow or "Więcej" on a phone). The selected controller stays in the browser after a page reload, but a new browser session starts from the list again.
4. **Replacing a controller or wiping its memory.** The controller registers again with the same SN and gets the same record back — the data history stays.
5. **A controller with several roles.** One physical controller may appear in the application as several devices with the same identifier (SN), each with its own Root ID, menu and data history. That was the case on 2026-10-01–02, when `co` served the heat pump and the pellet boiler; since 2026-10-03 the boiler has its own boiler controller, and the role mechanism stays in the application.
6. **A household member.** The owner shares a controller with a household member's e-mail and selected tabs; after logging in, the member sees the controller's tile and only those tabs.

## Limitations and risks

- **The API key stays disabled.** The application requires login (user accounts), but the API key check on the server is disabled and the controller endpoints accept the bare SN. The Root ID should not be published (the screenshots in this documentation use made-up identifiers).
- **A controller cannot be deleted in the application.** Deleting it requires a change in the database.
- **Some data lives in server memory** (latest telemetry, manual operations, device info). A server restart clears it; the controller restores it with its next report.
- **The outdoor temperature** comes from a single IMGW station (Zakopane) — for an installation elsewhere the station has to be changed in the code.

## Glossary

| Term | Meaning |
|---|---|
| **Controller** (sterownik) | the device at the installation that talks to the cloud: `co` (heat pump), the tank controller, the boiler controller (pellet boiler) or the switch |
| **Controller kind** (`deviceType`) | `heat_pump`, `water-pressure-tank`, `pellet-boiler-pelux200` or `switch`; decides the menu, screens and data handling |
| **Controller role** | one task of a physical controller (e.g. `co` as the heat pump or, on 2026-10-01–02, as the boiler); each role is a separate device in the application |
| **SN** (`deviceId`) | the controller serial number — the factory MAC address of the ESP32, 12 hex characters; shared by all roles of the same controller |
| **Root ID** (`rootId`) | the device (role) identifier in the database; the application and the controller send it with every request |
| **Controller registration** (zgłoszenie) | the request a controller sends at start; creates the device or returns the existing one |
| **Account** | an application user: e-mail, first and last name, location; own controllers, own tile layout and weather tiles |
| **Share** (udostępnienie) | another account's access to a controller with selected tabs; the owner can change or revoke it |
| **Tile** (kafelek) | a field on the controller list: a controller with its current state or the weather of a town |
| **Settings** (`properties`) | controller settings stored in the cloud (e.g. heat pump temperatures, the tank compressor time) |
| **Controller kind registry** | the place in the code where each kind describes its menu, screens and default settings |
| **Theme** (motyw) | the light or dark look ("Instrument"); light without a choice, "Jak system" follows the device setting |
