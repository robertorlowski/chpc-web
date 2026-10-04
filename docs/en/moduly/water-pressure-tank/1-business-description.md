# Water-pressure-tank module — business description

[← System documentation](../../README.md) · **1. Business description** · [2. How it works](2-how-it-works.md) · [3. Technical documentation](3-technical-documentation.md) · [Polski](../../../moduly/water-pressure-tank/1-opis-biznesowy.md)

## Why this module exists

The module handles the **water pressure tank system** (*hydrofor*) in the application: a household well-water installation in which a pump fills pressure tanks and a pressure switch starts it when pressure drops and stops it once pressure is restored. In a tank with an air cushion the air slowly dissolves in the water, so at every pump start the tank controller runs an **air compressor** for a while to top the air up.

The module lets the user:

- **set the compressor run time**;
- **see every pump run**: when it happened and how long the pump and the compressor ran;
- **calculate water consumption** without an electronic water meter: from the pump run time and the pump flow, which the application derives from manual water meter readings;
- **compare the water from pump time with the water meter** month by month.

## Who uses it

**The home owner** with a water pressure tank system and the tank controller (ESP32). The controller is powered only while the pump runs, so it needs no attention.

## Screens

The user interface is in Polish; the screenshots show it as is. They were taken before version 1.3.0, when water was estimated from tank volumes. The layout of the views is the same; the captions describe the differences.

![Main view](../../../moduly/water-pressure-tank/img/glowny.png)

*Hydrofor (screenshot from before 1.3.0): the "Ustawienia" card with the compressor time and the pump flow (what it was computed from or, without two water meter readings, what to do) and today's runs with the columns Kompresor, Pompa (e.g. "4 min 10 s"; the tooltip shows the subtracted manual compressor time) and Woda. A run in progress is highlighted ("pracuje", "…"); the view refreshes every 5 s. Below the heading, switch icons (like "CO pompa" of the heat pump) show whether the water pump and the air compressor are running. The screenshot still shows the former "Zbiorniki" card.*

| Data — pump runs | Data — water meter readings |
|---|---|
| ![Runs](../../../moduly/water-pressure-tank/img/dane-uruchomienia.png) | ![Meter readings](../../../moduly/water-pressure-tank/img/dane-odczyty-wodomierza.png) |

*Data: the "Uruchomienia pompy" tab (runs of the selected month, pump time in minutes and seconds, water, "Razem: X l, pompa Y", CSV export; "≈" marks an approximate time, i.e. a run sent later because the network was missing) and the "Odczyty wodomierza" tab (adding and deleting readings, consumption between readings).*

| Chart — day | Chart — month |
|---|---|
| ![Day](../../../moduly/water-pressure-tank/img/wykres-dzien.png) | ![Month](../../../moduly/water-pressure-tank/img/wykres-miesiac.png) |

*Chart: water bars per hour, day or month. Until the flow is known, the bars show the pump run time in minutes, with a hint about two water meter readings below the chart.*

![Year with the water meter](../../../moduly/water-pressure-tank/img/wykres-rok-wodomierz.png)

*The year chart with "Pokaż odczyty z wodomierza" on (screenshot from before 1.3.0): water meter consumption and water "z czasu pompy" (from pump time) for each month, and below the chart the flow used to compute it. The former suggested `k` factor no longer exists.*

**Settings** has the "Kompresor" card (compressor run time), the "Przepływ pompy" card (the flow in l/min and how many periods between water meter readings it was computed from, or instructions on how to get it) and the "Sterownik" card (among others the firmware version and the "Aktualizuj" (update) button when a newer version exists).

## First start

1. After its first start the controller registers with the cloud by itself and receives the default setting: compressor 30 s.
2. Add **water meter readings** (Dane → Odczyty wodomierza): at least two with pump runs between them, ideally every few weeks. From the second reading on the application knows the pump flow and shows water also for past runs.
3. Optionally mark the tank with the star as the default controller.

A compressor time change in the application reaches the controller **at the next pump run** (the controller is powered only while the pump runs). The compressor time can also be changed on the controller's `/install` page; it is then sent to the cloud.

## Limitations

- **Water is approximate.** It assumes a constant pump flow. The flow is the average over all periods between water meter readings, weighted by pump run time.
- **There is no water before two water meter readings** ("---" in the application). The pump run time is shown from the start.
- **Every new water meter reading changes the flow**, and therefore the water in the whole history, because water is not stored but computed on read.
- **Manual compressor operation** ("Włącz" on the controller page) is subtracted from the pump run time, because the pump does not deliver water to consumers during it.
- **Without a network** a run reaches the cloud at the next start, with an approximate time.
- **Run times** are accurate to about 1 s (the controller has no clock; the server computes the times).

## Glossary

| Term | Meaning |
|---|---|
| **Hydrofor** (water pressure tank system) | pump + pressure tanks + pressure switch |
| **Pressure switch** (presostat) | starts the pump at the lower threshold, stops it at the upper one |
| **Air-cushion tank** | a tank (e.g. galvanised) in which water touches air; air is lost, hence the compressor |
| **Run** (uruchomienie) | one pump cycle from start to stop by the pressure switch |
| **Pump time** | the pump run time of a run without manual compressor operation |
| **Pump flow** (przepływ pompy) | litres per minute: total water from the meter divided by total pump time over the periods between readings |
| **Water meter** (wodomierz) | water counter; readings are entered by the user |
