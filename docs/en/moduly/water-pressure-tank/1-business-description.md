# Water-pressure-tank module — business description

[← System documentation](../../README.md) · **1. Business description** · [2. How it works](2-how-it-works.md) · [3. Technical documentation](3-technical-documentation.md) · [Polski](../../../moduly/water-pressure-tank/1-opis-biznesowy.md)

## Why this module exists

The module handles the **water pressure tank system** (*hydrofor*) in the application: a household well-water installation in which a pump fills pressure tanks and a pressure switch starts it when pressure drops and stops it once pressure is restored. In a tank with an air cushion the air slowly dissolves in the water, so at every pump start the tank controller runs an **air compressor** for a while to top the air up.

The module lets the user:

- **set the compressor run time** and describe the installation (pressure switch thresholds, tanks);
- **see every pump run**: when it happened and how long the pump and the compressor ran;
- **estimate water consumption** without an electronic water meter — from physics (Boyle's law), based on pressures and tank volumes;
- **compare the estimate with the water meter** — the user enters readings and the application suggests how to correct the estimate.

## Who uses it

**The home owner** with a water pressure tank system and the tank controller (ESP32-C3). The controller is powered only while the pump runs — it needs no attention.

## Screens

The user interface is in Polish; the screenshots show it as is.

![Main view](../../../moduly/water-pressure-tank/img/glowny.png)

*Hydrofor: settings (compressor time, pressure switch thresholds, water per run), tanks with the water estimate and today's runs. A run in progress is highlighted ("pracuje", "…"); the view refreshes every 5 s. Below the heading, switch icons (like "CO pompa" of the heat pump) show whether the water pump and the air compressor are running.*

| Data — pump runs | Data — water meter readings |
|---|---|
| ![Runs](../../../moduly/water-pressure-tank/img/dane-uruchomienia.png) | ![Meter readings](../../../moduly/water-pressure-tank/img/dane-odczyty-wodomierza.png) |

*Data: the "Uruchomienia pompy" tab (runs of the selected month and CSV export; "≈" marks an approximate time — a run sent later because the network was missing) and the "Odczyty wodomierza" tab (adding and deleting readings, consumption between readings).*

| Chart — day | Chart — month |
|---|---|
| ![Day](../../../moduly/water-pressure-tank/img/wykres-dzien.png) | ![Month](../../../moduly/water-pressure-tank/img/wykres-miesiac.png) |

![Year with the water meter](../../../moduly/water-pressure-tank/img/wykres-rok-wodomierz.png)

*The year chart with "Pokaż odczyty z wodomierza" on: water meter consumption and the estimate for each month; below, the suggested `k` factor of the air-cushion tank (here 0.81 — the estimate is about 5% too high).*

![Settings with the calculator](../../../moduly/water-pressure-tank/img/ustawienia-kalkulator.png)

*Settings: compressor time, pressure switch thresholds, tanks (add ⊕, delete with the bin, enabled/disabled) and the water-per-cycle calculator of the air-cushion tank: from the tank circumference and the drop of the water column, "Wstaw" picks `k`.*

## First start

1. After its first start the controller registers with the cloud by itself and receives default settings (30 s, 2–4 bar, a 300 l air-cushion tank and a 300 l membrane tank).
2. In Settings enter the **real pressure switch thresholds** — read from the manometer when the pump starts and stops.
3. Enter the **membrane tank pre-charge `p0`** — measured at the air valve with the water drained.
4. Add **water meter readings** (at least two, ideally every few weeks) — the application will then suggest `k`. Alternatively measure the water level drop in the air-cushion tank and use the calculator.
5. Optionally mark the tank with the star as the default controller.

A settings change in the application reaches the controller **at the next pump run** (the controller is powered only while the pump runs). The compressor time can also be changed on the controller's `/install` page — it is then sent to the cloud.

## Limitations

- **The water estimate is approximate.** It assumes full filling between the thresholds and known amounts of air; that is why the `k` correction from the water meter exists.
- **The estimate is stored when the run happens** — a later tank change does not alter history.
- **Without a network** a run reaches the cloud at the next start, with an approximate time.
- **Run times** are accurate to about 1 s (the controller has no clock; the server computes the times).
- The controller supports at most 4 tanks.

## Glossary

| Term | Meaning |
|---|---|
| **Hydrofor** (water pressure tank system) | pump + pressure tanks + pressure switch |
| **Pressure switch** (presostat) | starts the pump at the lower threshold, stops it at the upper one |
| **Air-cushion tank** | a tank (e.g. galvanised) in which water touches air; air is lost, hence the compressor |
| **Membrane tank** | a tank with a bladder; the amount of air is set by the pre-charge `p0` |
| **Run** (uruchomienie) | one pump cycle from start to stop by the pressure switch |
| **`k`** | correction factor of the air-cushion tank: how much of the theoretical cushion really works |
| **Water meter** (wodomierz) | water counter; readings are entered by the user |
