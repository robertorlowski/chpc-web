# Switch module — business description

[← System documentation](../../README.md) · **1. Business description** · [2. How it works](2-how-it-works.md) · [3. Technical documentation](3-technical-documentation.md) · [Polski](../../../moduly/switch/1-opis-biznesowy.md)

## Why this module exists

The module handles the **switch** (*włącznik*) in the application: an ESP32 controller with a relay (or several) that turns a 230 V load on and off, e.g. a water heater element, a garden pump or lighting. It works like the heat pump schedule, but without temperatures: a relay is on during time windows or on the user's command.

The module lets the user:

- **turn a relay on right away**: for a time (e.g. 30 min) or without a limit;
- **turn it off and block the schedule** until the user goes back to the schedule;
- **set a schedule** for each relay: days (every day, working days, days off with Polish public holidays, a day of the week or a single date) and hours, also across midnight;
- **see the activation history**: when and how long a relay was on, with the daily total and a CSV export;
- **name the relays** ("Bojler" — water heater, "Oświetlenie" — lighting).

The first switch has been running since 2026-10-03 and controls the heating element of a water heater (relay "Bojler").

## Who uses it

**The home owner** who wants to control a 230 V load from the phone and by a schedule. The controller registers with the cloud by itself; after installation it is enough to name the relay and add a schedule.

## Screens

The user interface is in Polish; the screenshots show it as is.

![Main view](../../../moduly/switch/img/glowny.png)

*Main view (data from the simulator with two relays): for each relay a state switch on the right (like "CO pompa" of the heat pump; the state reported by the controller), the mode description (here "Wyłączony · harmonogram zablokowany" — off, schedule blocked — in red), the buttons "Włącz" (on), "Wyłącz" (off) and "Harmonogram" (schedule; the selected mode has an outline) and the "Czas włączenia" (on time) field. Below the cards the "Dziś" (today) table with today's activations and the "Razem" (total) sum. The view refreshes every 5 s.*

| Phone | Description |
|---|---|
| ![Main view on a phone](../../../moduly/switch/img/glowny-telefon.png) | On a phone (360 px) the cards are full width and the menu shows icons only. When a relay is on for a time or within a schedule window, a large countdown to switch-off is shown under the mode description. When the controller has not reported for more than 5 min, the card shows "Sterownik offline od …" (controller offline since …), and when the relay state does not match the command yet — "Czeka na sterownik…" (waiting for the controller). |

![Data](../../../moduly/switch/img/dane.png)

*Data: activations of the selected day (on, off, duration), a relay filter (with more than one relay), "Razem w dniu" (daily total) and CSV export. An activation that started the day before has a date next to the time. "≈" before the switch-off time means an approximate time: the controller lost power or connectivity.*

![Schedule](../../../moduly/switch/img/harmonogram.png)

*Schedule: entries grouped by relay. A red bar on the left marks the entry active now; "(+1 dzień)" — a window across midnight. The plus icon opens the form (relay, day or a one-off date, from–to, active). Below the list a note says which relays are in a manual mode and do not follow the schedule.*

![Settings](../../../moduly/switch/img/ustawienia.png)

*Settings: relay names, the default "Czas włączenia" (on time) in minutes (0 = no limit) and the "Sterownik" (controller) card with the number of relays, the IP address, the firmware version and the update status.*

## Relay modes

| Mode | Button | What it does |
|---|---|---|
| **Schedule** | "Harmonogram" | the relay is on during schedule windows and off outside them; the default mode |
| **On for a time** | "Włącz" with a time > 0 | on until the time runs out, then back to the schedule |
| **On without a limit** | "Włącz" with 0 h 0 min | on until the user changes the mode |
| **Off** | "Wyłącz" | off; **the schedule will not turn it on** until the user selects "Harmonogram" |

The same choice is on the controller's own page (local network), so the switch can be operated without the internet as well.

## First start

1. Install the controller and enter the Wi-Fi network on its `/install` page ([switch firmware](../../../../devices/switch/docs/en/1-business-description.md)).
2. The controller registers with the cloud by itself; a tile with a switch icon and the name "Włącznik" appears on the controller list.
3. In Settings name the relays and, if needed, change the default on time (30 min).
4. Add the on windows on the Schedule tab.
5. Optionally star the switch as the default controller.

## Limitations

- **The cloud evaluates the schedule.** Without the internet the controller finishes the current activation (it knows the switch-off time) and turns off, but it will not start the next window.
- **After a controller restart** (e.g. a power cut) the relays stay off until the controller connects to the cloud.
- **The state is refreshed every 5 s.** A change in the application reaches the controller immediately (WebSocket), or within 5 s when the WebSocket is down.
- **On and off times in the history** come from the controller (to the second); after a power loss the end of an activation is the last report before it (approximate time, "≈").
- **The default on time** changed in the application reaches the controller page only after the controller restarts (the application uses the new value at once).
- **The controller page has no login**: in the home network (and in the controller's open network after start) anyone can switch the relay.
- The longest timed activation: 7 days.

## Glossary

| Term | Meaning |
|---|---|
| **Switch** (*włącznik*) | an ESP32 controller with relays (`deviceType: switch`) |
| **Relay** | a controller output, numbered from 1; may have a name |
| **Mode** | schedule, on for a time, on without a limit, or off |
| **Schedule window** | an entry "day + from–to"; a window across midnight belongs to the day it starts on |
| **Activation** | one period from switching a relay on to switching it off in the history |
| **Approximate time** (≈) | the end of an activation was estimated because the controller lost power or connectivity |
| **Offline** | the controller has not reported for more than 5 min |
