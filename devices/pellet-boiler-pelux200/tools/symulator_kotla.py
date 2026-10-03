"""Symulator kotła na biurku: odtwarza nagranie magistrali (test/fixtures/kociol-*.txt) przez
przejściówkę USB-RS485 podłączoną do A/B modułu HW-519 sterownika pieca.

- Ramki regulatora i paneli (RX w nagraniu) idą z oryginalnymi odstępami, w pętli.
- SensorData (0x35) dopiero po tym, jak sterownik odpowie DeviceAvailable (0xB0) na CheckDevice
  — jak prawdziwy regulator.
- Na zapytanie sterownika o ustawienia (0x31, 0x32, 0x5C, 0x36, 0x55) odsyła nagraną odpowiedź
  (typ | 0x80) po ok. 65 ms, do 0x00. Zapisu parametrów nie obsługuje.
Sprawdzone tylko na sucho (--dry-run), bez przejściówki — pierwsze użycie z płytką do
obejrzenia na konsoli sterownika.

Użycie (pyserial):
    python symulator_kotla.py COM4 [nagranie.txt] [--minutes 10]
"""
import argparse
import os
import time

import serial

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT = os.path.join(HERE, '..', 'test', 'fixtures', 'kociol-2026-10-03.txt')
ECONET = 0x56
SETTINGS = {0x31, 0x32, 0x5C, 0x36, 0x55}


def load(path):
    rx, responses = [], {}
    for line in open(path, encoding='utf-8'):
        if line.startswith('#'):
            continue
        ms, direction, hexdata = line.split()
        frame = bytes.fromhex(hexdata)
        if direction == 'TX':
            continue
        rx.append((int(ms), frame))
        if frame[4] == 0x45 and frame[7] & 0x80 and (frame[7] & 0x7F) in SETTINGS:
            responses.setdefault(frame[7] & 0x7F, frame)
    return rx, responses


class Reader:
    """Składa ramki z bajtów odebranych od sterownika."""

    def __init__(self):
        self.buffer = bytearray()

    def feed(self, data):
        self.buffer += data
        frames = []
        while True:
            start = self.buffer.find(0x68)
            if start < 0:
                self.buffer.clear()
                return frames
            del self.buffer[:start]
            if len(self.buffer) < 3:
                return frames
            length = self.buffer[1] | self.buffer[2] << 8
            if length < 10 or length > 1024:
                del self.buffer[:1]
                continue
            if len(self.buffer) < length:
                return frames
            frame = bytes(self.buffer[:length])
            bcc = 0
            for byte in frame[:-2]:
                bcc ^= byte
            if frame[-1] == 0x16 and frame[-2] == bcc:
                frames.append(frame)
                del self.buffer[:length]
            else:
                del self.buffer[:1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('port')
    parser.add_argument('recording', nargs='?', default=DEFAULT)
    parser.add_argument('--minutes', type=float, default=10)
    parser.add_argument('--dry-run', action='store_true', help='bez portu: tylko przegląd nagrania')
    args = parser.parse_args()

    rx, responses = load(args.recording)
    base_ms = rx[0][0]
    loop_s = (rx[-1][0] - base_ms + 300) / 1000
    print(f'{len(rx)} ramek, {loop_s:.0f} s nagrania, odpowiedzi na zapytania: '
          + ', '.join(f'0x{k:02x}' for k in sorted(responses)))
    if args.dry_run:
        return
    bus = serial.Serial(args.port, 115200, timeout=0)
    reader = Reader()
    econet_seen = False
    pending = []  # (czas wysłania, ramka)
    sent = answered = 0
    end = time.time() + args.minutes * 60
    lap_start = time.time()
    index = 0
    while time.time() < end:
        ms, frame = rx[index]
        if time.time() >= lap_start + (ms - base_ms) / 1000:
            # odpowiedzi regulatora na zapytania z nagrania pomijamy — idą tylko na żądanie
            replayed_answer = frame[4] == 0x45 and frame[7] & 0x80 and (frame[7] & 0x7F) in SETTINGS
            if (frame[7] != 0x35 or econet_seen) and not replayed_answer:
                bus.write(frame)
                sent += 1
            index += 1
            if index == len(rx):
                index = 0
                lap_start += loop_s
        for frame in reader.feed(bus.read(4096)):
            if frame[4] != ECONET:
                continue
            if frame[7] == 0xB0 and not econet_seen:
                econet_seen = True
                print('sterownik odpowiada jako ecoNET — wysyłam SensorData')
            if frame[7] in responses:
                pending.append((time.time() + 0.065, responses[frame[7]]))
                print(f'zapytanie 0x{frame[7]:02x} — odpowiedź {len(responses[frame[7]])} B')
        for item in list(pending):
            if item[0] <= time.time():
                bus.write(item[1])
                pending.remove(item)
                answered += 1
        time.sleep(0.001)
    print(f'wysłano {sent} ramek, odpowiedzi na zapytania: {answered}')


if __name__ == '__main__':
    main()
