"""Rozkodowuje ustawienia kotła odczytane przez sterownik pieca (etap 3) kodem PyPlumIO.

Wejście: log konsoli z liniami „SETTINGS <nazwa> <ms> <hex>” albo /boiler-settings.json ze
strony sterownika. Wyjście: archiwum JSON (jak docs/ustawienia-kotla-2026-10-03.json) i tabele
Markdown (jak punkt 4 docs/kociol-ustawienia.md). Nazwy parametrów według PyPlumIO dla ecoMAX P
(ecoMAX 860P2), opisy po polsku orientacyjne.

    pip install pyplumio            # sprawdzone z 0.6.8
    python dekoduj_ustawienia.py wejscie.log|boiler-settings.json archiwum.json tabela.md [data]
"""
import json
import sys

from pyplumio.const import ProductType
from pyplumio.parameters import SwitchDescription, unpack_parameter
from pyplumio.parameters.ecomax import PARAMETER_TYPES as ECOMAX_TYPES
from pyplumio.parameters.mixer import PARAMETER_TYPES as MIXER_TYPES
from pyplumio.structures.regulator_data_schema import RegulatorDataSchemaStructure
from pyplumio.structures.schedules import SCHEDULES, SchedulesStructure

PL = {
    'airflow_power_100': 'Nadmuch przy mocy 100%',
    'airflow_power_50': 'Nadmuch przy mocy 50%',
    'airflow_power_30': 'Nadmuch przy mocy 30%',
    'cycle_duration': 'Czas cyklu (podawanie + przerwa)',
    'h2_hysteresis': 'Histereza H2 (zmniejszenie mocy do 50%)',
    'h1_hysteresis': 'Histereza H1 (zmniejszenie mocy do 30%)',
    'heating_hysteresis': 'Histereza kotła',
    'fuzzy_logic': 'Tryb regulacji (1 = Fuzzy Logic)',
    'min_fan_power': 'Minimalna moc nadmuchu',
    'max_fan_power': 'Maksymalna moc nadmuchu',
    'kindling_airflow_power': 'Rozpalanie: nadmuch',
    'kindling_test_time': 'Rozpalanie: czas testu',
    'kindling_time': 'Rozpalanie: czas rozpalania',
    'warming_up_time': 'Rozpalanie: czas nagrzewania',
    'kindling_finish_threshold_temp': 'Rozpalanie: przyrost temperatury spalin / próg zakończenia',
    'kindling_min_power_time': 'Rozpalanie: czas pracy na mocy minimalnej',
    'stabilization_airflow_power': 'Stabilizacja: nadmuch',
    'supervision_time': 'Nadzór: czas nadzoru (0 = wyłączony)',
    'supervision_cycle_duration': 'Nadzór: czas cyklu',
    'supervision_airflow_power': 'Nadzór: nadmuch',
    'burning_off_max_time': 'Wygaszanie: czas maksymalny',
    'burning_off_min_time': 'Wygaszanie: czas minimalny',
    'burning_off_airflow_power': 'Wygaszanie: nadmuch',
    'burning_off_fan_work': 'Wygaszanie: praca nadmuchu',
    'burning_off_fan_pause': 'Wygaszanie: przerwa nadmuchu',
    'start_burning_off': 'Wygaszanie: start',
    'stop_burning_off': 'Wygaszanie: stop',
    'cleaning_begin_time': 'Czyszczenie: czas na początku',
    'cleaning_airflow_power': 'Czyszczenie: nadmuch',
    'warming_up_pause_time': 'Nagrzewanie: przerwa',
    'max_fuel_flow': 'Maksymalna wydajność podajnika',
    'fuel_tank_capacity': 'Pojemność zasobnika paliwa',
    'fuel_calorific_value': 'Kaloryczność paliwa',
    'fuel_detection_time': 'Czas detekcji paliwa',
    'heating_target_temp': 'Temperatura zadana kotła',
    'min_heating_target_temp': 'Minimalna temperatura kotła',
    'max_heating_target_temp': 'Maksymalna temperatura kotła',
    'heating_pump_enable_temp': 'Temperatura załączenia pompy CO',
    'pause_heating_for_water_heater': 'Postój pompy CO przy ładowaniu CWU',
    'increase_heating_temp_for_water_heater': 'Podwyższenie temperatury kotła od CWU',
    'weather_control': 'Sterowanie pogodowe kotła',
    'heating_curve': 'Krzywa grzewcza kotła',
    'heating_curve_shift': 'Przesunięcie krzywej grzewczej kotła',
    'weather_factor': 'Współczynnik temperatury pokojowej',
    'thermostat_mode': 'Wybór termostatu (0 wył., 1 uniwersalny, 2 ecoSTER)',
    'thermostat_decrease_target_temp': 'Termostat pokojowy kotła (obniżenie zadanej)',
    'disable_pump_on_thermostat': 'Wyłączenie pomp od termostatu',
    'boiler_alert_temp': 'Temperatura alarmowa kotła (STB)',
    'external_boiler_temp': 'Temperatura zewnętrzna wyłączenia kotła / parametr zewn.',
    'water_heater_target_temp': 'Temperatura zadana CWU',
    'min_water_heater_target_temp': 'Minimalna temperatura CWU',
    'max_water_heater_target_temp': 'Maksymalna temperatura CWU',
    'water_heater_work_mode': 'Tryb pracy pompy CWU (0 wył., 1 priorytet, 2 bez priorytetu)',
    'water_heater_hysteresis': 'Histereza zasobnika CWU',
    'water_heater_disinfection': 'Dezynfekcja CWU',
    'summer_mode': 'Tryb LATO (0 wył., 1 wł., 2 auto)',
    'summer_mode_enable_temp': 'Temperatura załączenia trybu LATO',
    'summer_mode_disable_temp': 'Temperatura wyłączenia trybu LATO',
    'water_heater_work_extension': 'Wydłużenie pracy pompy CWU',
    'mixer_target_temp': 'Temperatura zadana mieszacza',
    'min_target_temp': 'Minimalna temperatura mieszacza',
    'max_target_temp': 'Maksymalna temperatura mieszacza',
    'work_mode': 'Obsługa mieszacza (0 wył., 1 CO, 2 podłogowe, 3 tylko pompa)',
    'mixer_input_dead_zone': 'Strefa nieczułości mieszacza',
}
PL_MIXER = {
    'thermostat_decrease_target_temp': 'Obniżenie zadanej mieszacza od termostatu',
    'weather_control': 'Sterowanie pogodowe mieszacza',
    'heating_curve': 'Krzywa grzewcza mieszacza',
    'heating_curve_shift': 'Przesunięcie krzywej grzewczej mieszacza',
    'weather_factor': 'Współczynnik temperatury pokojowej mieszacza',
    'thermostat_mode': 'Wybór termostatu mieszacza (0 wył.)',
    'disable_pump_on_thermostat': 'Wyłączenie pompy mieszacza od termostatu',
}
UNCERTAIN = {'airflow_power_100', 'airflow_power_50', 'airflow_power_30', 'stabilization_airflow_power',
             'supervision_airflow_power', 'burning_off_airflow_power', 'kindling_airflow_power'}
# potwierdzone na panelu 2026-10-03
CONFIRMED = {'heating_target_temp', 'heating_hysteresis', 'water_heater_target_temp', 'water_heater_hysteresis',
             'heating_pump_enable_temp'}
DAYS = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota']


def read_input(path):
    if path.endswith('.json'):
        data = json.load(open(path, encoding='utf-8'))
        return {name: entry['hex'] for name, entry in data.items() if isinstance(entry, dict) and 'hex' in entry}
    raw = {}
    for line in open(path, encoding='utf-8'):
        if line.startswith('SETTINGS '):
            _, name, _ms, hexdata = line.split()
            raw[name] = hexdata  # ostatni odczyt wygrywa
    return raw


def describe(description, values, mixer=False):
    """Parametr: wartości po przeliczeniu (krok, przesunięcie), przełączniki surowo."""
    raw = [values.value, values.min_value, values.max_value]
    entry = {'name': description.name, 'raw': raw}
    if isinstance(description, SwitchDescription):
        entry['value'], entry['min'], entry['max'] = raw
        entry['unit'] = None
    else:
        step = getattr(description, 'step', 1.0)
        offset = getattr(description, 'offset', 0)
        entry['value'], entry['min'], entry['max'] = (round((v - offset) * step, 6) for v in raw)
        unit = getattr(description, 'unit_of_measurement', None)
        entry['unit'] = getattr(unit, 'value', unit)
    entry['opis'] = (PL_MIXER.get(description.name) if mixer else None) or PL.get(description.name)
    if description.name in CONFIRMED and not mixer:
        entry['zgodne_z_panelem'] = True
    if description.name in UNCERTAIN:
        entry['uwaga'] = 'jednostka niepewna (wartości > 100 przy %)'
    return entry


def decode(raw):
    out = {}
    # parametry kotła: [0, pierwszy, liczba] + liczba × (wartość, min, max)
    message = bytearray.fromhex(raw['ecomax_parameters'])
    start, count = message[1], message[2]
    types = ECOMAX_TYPES[ProductType.ECOMAX_P]
    params = []
    for i in range(count):
        index = start + i
        values = unpack_parameter(message, 3 + 3 * i)
        if values is None:
            continue
        if index < len(types):
            params.append({'index': index, **describe(types[index], values)})
        else:
            params.append({'index': index, 'name': None, 'raw': [values.value, values.min_value, values.max_value]})
    out['ecomax_parameters'] = params

    # mieszacze: [0, pierwszy, liczba, mieszacze] + mieszacze × liczba × 3
    message = bytearray.fromhex(raw['mixer_parameters'])
    start, count, mixers = message[1], message[2], message[3]
    types = MIXER_TYPES[ProductType.ECOMAX_P]
    offset, mixer_list = 4, []
    for mixer in range(mixers):
        entries = []
        for i in range(count):
            values = unpack_parameter(message, offset)
            offset += 3
            if values is not None and start + i < len(types):
                entries.append({'index': start + i, **describe(types[start + i], values, mixer=True)})
        if entries:
            mixer_list.append({'mixer': mixer + 1, 'parameters': entries})
    out['mixers'] = mixer_list

    # harmonogramy (dekoder PyPlumIO): przełącznik = indeks × 2, obniżenie = indeks × 2 + 1
    data, _ = SchedulesStructure(None).decode(bytearray.fromhex(raw['schedules']))
    out['schedules'] = {
        'list': [
            {'name': SCHEDULES[index] if index < len(SCHEDULES) else index,
             'days': {DAYS[d]: ''.join('1' if bit else '0' for bit in schedule[d]) for d in range(len(schedule))}}
            for index, schedule in data.get('schedules', [])
        ],
        'parameters': [
            {'index': index, 'raw': [v.value, v.min_value, v.max_value]} for index, v in data.get('schedule_parameters', [])
        ],
    }

    message = bytearray.fromhex(raw['thermostat_parameters'])
    out['thermostat_parameters'] = {
        'start': message[1], 'count': message[2], 'bytes': len(message),
        'note': 'nierozkodowane: podział wymaga liczby termostatów z SensorData; surowe dane w raw_hex',
    }

    data, _ = RegulatorDataSchemaStructure(None).decode(bytearray.fromhex(raw['regulator_data_schema']))
    out['regulator_data_schema'] = [[pid, type(dt).__name__] for pid, dt in data.get('regdata_schema', [])]
    out['raw_hex'] = raw
    return out


def fmt(value):
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).replace('.', ',') if value is not None else '—'


def table(decoded):
    lines = ['| Nr | Parametr (PyPlumIO) | Opis | Wartość | Zakres |', '|---|---|---|---|---|']
    for e in decoded['ecomax_parameters']:
        if not e['name']:
            lines.append(f"| {e['index']} | `?` | — | — | surowo {e['raw']} |")
            continue
        unit = f" {e['unit']}" if e['unit'] else ''
        value = f"{fmt(e['value'])}{unit}"
        value = f'**{value}**' if e.get('zgodne_z_panelem') else value
        note = ' (jednostka niepewna)' if e.get('uwaga') else ''
        lines.append(f"| {e['index']} | `{e['name']}` | {e['opis'] or '—'}{note} | {value} | "
                     f"{fmt(e['min'])}–{fmt(e['max'])} |")
    lines += ['', '| Mieszacz | Nr | Parametr | Opis | Wartość | Zakres |', '|---|---|---|---|---|---|']
    for m in decoded['mixers']:
        for e in m['parameters']:
            unit = f" {e['unit']}" if e['unit'] else ''
            lines.append(f"| {m['mixer']} | {e['index']} | `{e['name']}` | {e['opis'] or '—'} | "
                         f"{fmt(e['value'])}{unit} | {fmt(e['min'])}–{fmt(e['max'])} |")
    return '\n'.join(lines) + '\n'


def main():
    source, out_json, out_md = sys.argv[1:4]
    date = sys.argv[4] if len(sys.argv) > 4 else ''
    decoded = decode(read_input(source))
    archive = {
        'opis': 'Kopia ustawień regulatora kotła Pellux 200 Touch (ecoMAX 860P2) odczytana przez sterownik '
                'pieca jako ecoNET. Punkt odniesienia do przywrócenia po awarii. Nazwy parametrów według '
                'PyPlumIO (ecoMAX P), opisy po polsku orientacyjne; raw = [wartość, min, max] z ramki. '
                'Narzędzie: devices/pellet-boiler-pelux200/tools/dekoduj_ustawienia.py.',
        'odczyt': date,
        **decoded,
    }
    json.dump(archive, open(out_json, 'w', encoding='utf-8', newline='\n'), ensure_ascii=False, indent=1)
    open(out_md, 'w', encoding='utf-8', newline='\n').write(table(decoded))
    print(len(decoded['ecomax_parameters']), 'parametrów kotła,',
          sum(len(m['parameters']) for m in decoded['mixers']), 'parametrów mieszaczy')


if __name__ == '__main__':
    main()
