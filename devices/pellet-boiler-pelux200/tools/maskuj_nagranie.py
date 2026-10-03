"""Maskuje nagranie magistrali kotła (linie „RAW <ms> RX|TX <hex>” z konsoli sterownika pieca,
polecenie „r”) przed dodaniem do repozytorium (publiczne). Zostawia ruch i układ ramek, zeruje:

- dane ramek modułu internetowego ISM X-SMART (adres 0x59) — mogą nieść identyfikatory i sieć;
- odpowiedzi ProgramVersion regulatora (0xC0 od 0x45) — identyfikacja oprogramowania;
- w naszej DeviceAvailable (0xB0) adresy IP Wi-Fi i SSID (podmienione na 192.168.1.20 / „dom”);
- te same IP, bramę i SSID w każdej innej ramce — regulator przepisuje stan sieci ecoNET do
  RegulatorData (0x08, wtedy 324 B zamiast 313 B); tu zamiana na wartości tej samej długości
  (192.168.1.20, 192.168.1.1, „x” × długość SSID), żeby układ ramki się nie zmienił.

BCC każdej zmienionej ramki jest liczony od nowa. Użycie:
    python maskuj_nagranie.py konsola.log test/fixtures/kociol-AAAA-MM-DD.txt
"""
import sys

ISM = 0x59
ECOMAX = 0x45
ECONET = 0x56


def rebuild(frame: bytearray) -> bytearray:
    length = len(frame)
    frame[1] = length & 0xFF
    frame[2] = length >> 8
    bcc = 0
    for byte in frame[:-2]:
        bcc ^= byte
    frame[-2] = bcc
    frame[-1] = 0x16
    return frame


def mask_network(data: bytearray) -> bytearray:
    # DeviceAvailable: 1, Ethernet (4+4+4+1), Wi-Fi IP, maska, brama, serwer, szyfrowanie,
    # sygnał, stan Wi-Fi, 4 × 0, długość SSID, SSID (econet.cpp)
    out = bytearray(data[:14])
    out += bytes([192, 168, 1, 20, 255, 255, 255, 0, 192, 168, 1, 1])
    out += data[26:34]
    out += bytes([3]) + b'dom'
    return out


def read_frame(line: str):
    """(ms, kierunek, ramka) z linii „RAW <ms> RX|TX <hex>”; None dla linii uciętej (zatrzymanie
    nagrania, restart płytki) albo ramki z niezgodną długością, BCC lub końcem."""
    parts = line.split()
    if len(parts) != 4 or parts[0] != 'RAW':
        return None
    try:
        frame = bytearray.fromhex(parts[3])
    except ValueError:
        return None
    if len(frame) < 10 or len(frame) != (frame[1] | frame[2] << 8) or frame[-1] != 0x16:
        return None
    bcc = 0
    for byte in frame[:-2]:
        bcc ^= byte
    return (parts[1], parts[2], frame) if bcc == frame[-2] else None


def network_secrets(source: str) -> list:
    """Pary (prawdziwe bajty, zastępcze tej samej długości) z naszych ramek DeviceAvailable."""
    pairs = {}
    for line in open(source, encoding='utf-8'):
        parsed = read_frame(line)
        if not parsed:
            continue
        frame = bytes(parsed[2])
        if frame[7] != 0xB0 or frame[4] != ECONET:
            continue
        data = frame[8:-2]
        ip, gateway = data[14:18], data[22:26]
        ssid = data[35:35 + data[34]]
        if ip != bytes(4):
            pairs[ip] = bytes([192, 168, 1, 20])
        if gateway != bytes(4):
            pairs[gateway] = bytes([192, 168, 1, 1])
        if len(ssid) >= 3:
            pairs[ssid] = b'x' * len(ssid)
    return sorted(pairs.items(), key=lambda pair: -len(pair[0]))


def mask(frame: bytearray, secrets: list) -> bytearray:
    recipient, sender, kind = frame[3], frame[4], frame[7]
    header, data = frame[:8], frame[8:-2]
    if ISM in (recipient, sender) or (kind == 0xC0 and sender == ECOMAX):
        data = bytearray(len(data))
    elif kind == 0xB0 and sender == ECONET:
        data = mask_network(data)
    else:
        replaced = bytes(data)
        for real, fake in secrets:
            replaced = replaced.replace(real, fake)
        if replaced == bytes(data):
            return frame
        data = bytearray(replaced)
    return rebuild(header + data + bytearray(2))


def main(source: str, target: str) -> None:
    kept = masked = skipped = 0
    secrets = network_secrets(source)
    with open(source, encoding='utf-8') as lines, open(target, 'w', encoding='utf-8', newline='\n') as out:
        out.write('# Nagranie magistrali ecoMAX kotła Pellux 200 (sterownik pieca jako ecoNET 0x56).\n')
        out.write('# <ms od startu sterownika> <RX|TX> <cała ramka hex>; zamaskowane: tools/maskuj_nagranie.py\n')
        for line in lines:
            if not line.startswith('RAW'):
                continue
            parsed = read_frame(line)
            if not parsed:
                skipped += 1
                continue
            ms, direction, frame = parsed
            result = mask(frame, secrets)
            masked += result != frame
            kept += 1
            out.write(f'{ms} {direction} {result.hex()}\n')
    print(f'{kept} ramek, zamaskowanych {masked}, pominiętych uciętych {skipped}')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
