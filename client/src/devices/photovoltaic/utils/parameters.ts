// Parametry DTU Hoymiles i mikrofalowników do zakładki Ustawienia (tylko podgląd). Źródła, adresy i
// uzasadnienia ocen: docs/moduly/photovoltaic/parametry-i-wykresy.md, część B (zmieniać razem).
// read = sterownik co już je czyta (rekord portu od 0x1000).

export type PvParameter = {
  name: string;
  description: string;
  /** dostęp: „odczyt”, „odczyt i zapis (Modbus)”, „tylko S-Miles” … */
  access: string;
  read?: boolean;
  rating?: string;
};

export const PV_PARAMETER_GROUPS: { label: string; parameters: PvParameter[] }[] = [
  {
    label: 'Pomiary czytane co 60 s (rekord portu, 0x1000…)',
    parameters: [
      { name: 'Moc portu (PV Power)', description: 'Moc panelu po stronie stałoprądowej (DC), 0,1 W. Mapa Modbus Hoymiles nie ma mocy AC oddanej do sieci ani sprawności.', access: 'odczyt', read: true },
      { name: 'Napięcie i prąd PV', description: 'Napięcie [V] i prąd [A] panelu.', access: 'odczyt', read: true },
      { name: 'Napięcie i częstotliwość sieci', description: 'Napięcie [V] i częstotliwość [Hz] sieci na wyjściu mikrofalownika.', access: 'odczyt', read: true },
      { name: 'Produkcja dziś / całkowita', description: 'Liczniki energii portu [Wh]; suma daje produkcję instalacji.', access: 'odczyt', read: true },
      { name: 'Temperatura mikrofalownika', description: 'Temperatura wnętrza mikrofalownika, 0,1 °C.', access: 'odczyt', read: true },
      { name: 'Stan pracy, kod i licznik alarmów', description: 'Operating Status, Alarm Code, Alarm Count. Producent nie opisuje kodów; u nas 3, 0, 0 (hipoteza: 3 = praca normalna, kody alarmów jak w dzienniku zdarzeń OpenDTU).', access: 'odczyt', read: true },
      { name: 'Łącze z DTU (Link Status)', description: 'Łączność radiowa mikrofalownika z DTU; ≠ 0 = aktywne (u nas 1). Aplikacja pokazuje 0 jako „brak łączności”.', access: 'odczyt', read: true },
    ],
  },
  {
    label: 'Do dodania w odczycie',
    parameters: [
      { name: 'Numer seryjny DTU (0x2000)', description: '3 rejestry, 6 bajtów BCD. Identyfikacja bramki w Ustawieniach.', access: 'odczyt (Modbus 0x03)', rating: 'Bezpieczny.' },
      { name: 'Lista mikrofalowników w DTU (0x2056…)', description: 'Mikrofalowniki skonfigurowane w DTU — porównanie z portami w odczycie wykryje brakujący.', access: 'odczyt (Modbus 0x03)', rating: 'Bezpieczny (tylko odczyt).' },
      { name: 'Tryb i adres portu RS-485 (0x2503, 0x2504)', description: 'Diagnostyka: tryb Hoymiles Modbus i adres bramki (u nas 0x69 = 105).', access: 'odczyt (Modbus 0x03)', rating: 'Bezpieczny (tylko odczyt).' },
      { name: 'Stan ON/OFF i limit mocy portu (0xC006…)', description: 'Czy ktoś wyłączył port albo ograniczył moc (np. w S-Miles). Kod funkcji niepotwierdzony.', access: 'odczyt (Modbus 0x01/0x02)', rating: 'Bezpieczny, do sprawdzenia na DTU.' },
      { name: 'Moc znamionowa paneli (Wp)', description: 'Wpis ręczny w aplikacji — z niego wskaźnik „nasłonecznienia” portu (moc / Wp) i mapa paneli.', access: 'ustawienie w aplikacji', rating: 'Bezpieczny.' },
    ],
  },
  {
    label: 'Sterowanie przez Modbus DTU (osiągalne, niesprawdzone)',
    parameters: [
      { name: 'Włącz / wyłącz wszystkie mikrofalowniki (0xC000)', description: '0 = wyłączone, 1 = włączone. Instalacja stoi, dopóki nie wyślemy włączenia; trwałość stanu nieznana.', access: 'zapis (Modbus 0x05)', rating: 'Ostrożnie: tylko po teście, z potwierdzeniem.' },
      { name: 'Limit mocy wszystkich (0xC001)', description: 'Ograniczenie mocy czynnej, 2–100 %. Np. przy ujemnych cenach albo braku odbioru. Kod funkcji niepotwierdzony (źródła podają 0x05, 0x06 i 0x0F); nieznany wpływ na pamięć EEPROM mikrofalownika.', access: 'zapis (Modbus)', rating: 'Ostrożnie: rzadko, po teście.' },
      { name: 'Włącz / wyłącz i limit portu (0xC006/0xC007, 0xC00C/0xC00D, …)', description: 'To samo dla pojedynczego portu; porty jednego mikrofalownika muszą mieć to samo ustawienie. Adresy kolejnych portów (+6) niepotwierdzone.', access: 'zapis (Modbus)', rating: 'Ostrożnie.' },
    ],
  },
  {
    label: 'Nie ruszać',
    parameters: [
      { name: 'Tryb portu RS-485 (0x2503)', description: 'Export Management albo Hoymiles Modbus — zmiana odcina odczyt sterownika co.', access: 'odczyt i zapis (Modbus)', rating: 'Nie ruszać.' },
      { name: 'Adres Modbus DTU (0x2504)', description: '101–254, po zmianie restart DTU i brak odczytu do zmiany adresu w co.', access: 'odczyt i zapis (Modbus)', rating: 'Nie ruszać.' },
      { name: 'Lista mikrofalowników w DTU (zapis)', description: 'Zmiana listy urządzeń bramki — możliwa utrata odczytu.', access: 'zapis (Modbus)', rating: 'Nie ruszać.' },
      { name: 'Rejestry zarezerwowane (0xC002–0xC005 …, 0x9D9C/0x9D9D)', description: 'Nieopisane albo niejasne w nocie producenta.', access: '—', rating: 'Nie ruszać.' },
    ],
  },
  {
    label: 'Tylko w S-Miles (aplikacja Hoymiles)',
    parameters: [
      { name: 'Profil sieci (grid profile)', description: 'Parametry przyłączenia: progi napięć i częstotliwości, czasy. Zgodność z wymaganiami operatora sieci.', access: 'tylko S-Miles (instalator)', rating: 'Nie ruszać.' },
      { name: 'Limit mocy instalacji w chmurze', description: 'Active power control z S-Miles; nie wiadomo, czy wygrywa z limitem z Modbus.', access: 'tylko S-Miles', rating: 'Ostrożnie.' },
      { name: 'Wi-Fi / Ethernet DTU', description: 'Połączenie bramki z chmurą Hoymiles; dane do chmury co 15 min.', access: 'tylko S-Miles', rating: 'Nie ruszać z naszej aplikacji.' },
      { name: 'Aktualizacja firmware DTU i mikrofalowników', description: 'Zdalnie z chmury Hoymiles.', access: 'tylko S-Miles', rating: 'Nie ruszać z naszej aplikacji.' },
      { name: 'Restart mikrofalownika, ograniczenie oddawania do sieci', description: 'Restart — tylko OpenDTU/S-Miles; zero export wymaga trybu Export Management z licznikiem na tym samym porcie RS-485.', access: 'nieosiągalne u nas', rating: 'Nie dotyczy.' },
    ],
  },
];
