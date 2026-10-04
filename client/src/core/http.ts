import { getSelectedDevice } from './context/DeviceContext';

// Połączenie z serwerem: adresy API i WebSocket oraz zapytania z kontekstem
// wybranego urządzenia (rootId, deviceId). API poszczególnych rodzajów
// sterowników jest w devices/<rodzaj>/api.ts, a urządzeń w core/api.ts.
//
// Uwaga na różną obsługę błędów: get zwraca null (nie rzuca), post połyka wyjątek i zwraca
// undefined (z json = false zwraca Response, więc wywołujący sprawdza status), a put i delete
// rzucają wyjątek przy statusie innym niż 2xx.

// Dopisuje rootId i deviceId wybranego sterownika. Czyta wybór wprost z localStorage
// (getSelectedDevice), bo jest wołana poza komponentami React; serwer (device-context) wymaga rootId.
function withDeviceContext(path: string, includeDevice: boolean) {
  if (!includeDevice) return path;

  const device = getSelectedDevice();
  if (!device) throw new Error('Wybierz urządzenie przed użyciem aplikacji.');

  const separator = path.includes('?') ? '&' : '?';
  const params = `rootId=${encodeURIComponent(device.rootId)}&deviceId=${encodeURIComponent(device.deviceId)}`;
  return `${path}${separator}${params}`;
}

// w trybie dev serwer jest na tym samym komputerze co Vite, port 4001; nazwa hosta z paska adresu
// pozwala otworzyć klienta z telefonu w sieci lokalnej (npm run local -- --host)
const devServerHost = () => window.location.hostname;
// VITE_API_PORT: inny port serwera w trybie dev (np. podgląd na bazie produkcyjnej obok środowiska lokalnego)
const devServerPort = () => import.meta.env.VITE_API_PORT ?? '4001';

// Adres WebSocket serwera; ?rootId=… dopisuje wywołujący (widok główny pompy), bez niego serwer
// zamyka połączenie. Serwer przyjmuje dowolną ścieżkę, klient łączy się na ścieżkę główną.
// Produkcja: stały adres Render; build nie ma konfiguracji adresu przez zmienne środowiskowe.
export const wsAddressServer = () => {
  if (import.meta.env.DEV)
    return  `ws://${devServerHost()}:${devServerPort()}`
  else
    return  "wss://chpc-web.onrender.com/";
}

function prefixMocks(path: string) {
  if (import.meta.env.DEV)
    return  `http://${devServerHost()}:${devServerPort()}/api`.concat(path)
  else
    return  "https://chpc-web.onrender.com/api".concat(path);

}

// x-api-key jest wkompilowany w klienta, więc jawny dla każdego; kontrola klucza na serwerze
// (verifyApiKey) jest obecnie wyłączona.
export class Requests {
  static async get(path: string, includeDevice = true) {
    // console.log(prefixMocks(path));
    try {
      const response = await fetch(prefixMocks(withDeviceContext(path, includeDevice)), {
        method: "GET",
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'x-api-key': 'f3c87b02-4d0d-4e0a-9d5c-30a91ec77510'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.warn("Fetch error:", error);
      return null;
    }
  }

  static post(path :string, data = {}, json = true, includeDevice = true) {
    return fetch(
      prefixMocks(withDeviceContext(path, includeDevice)),
        Object.assign(
          {
            method: "POST",
            // mode: "no-cors",
            // cache: "no-cache",
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'x-api-key': 'f3c87b02-4d0d-4e0a-9d5c-30a91ec77510'
            },
            // redirect: "follow",
            // referrer: "no-referrer",
            body: JSON.stringify(data)
          }
        )
      )
      .then(response => {
          return json ? response.json() : response
      })
      .then(response => {
        console.log("POST", path, data, "resp", response);
        return response;
      })
      .catch(error => {
        console.warn(error);
      });
  }

  static async delete(path: string) {
    const response = await fetch(prefixMocks(withDeviceContext(path, true)), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-api-key': 'f3c87b02-4d0d-4e0a-9d5c-30a91ec77510',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
  }

  // PUT z surową treścią (plik .bin); w odróżnieniu od put rzuca wyjątek z komunikatem serwera
  // (pole message), bo walidacja pliku zwraca konkretną przyczynę odmowy.
  static async putFile(path: string, file: Blob) {
    const response = await fetch(prefixMocks(path), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-api-key': 'f3c87b02-4d0d-4e0a-9d5c-30a91ec77510',
      },
      body: file,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message ?? `HTTP error! status: ${response.status}`);
    return body;
  }

  // POST bez treści i bez kontekstu urządzenia; jak putFile rzuca wyjątek z komunikatem serwera
  static async postJson(path: string) {
    const response = await fetch(prefixMocks(path), {
      method: 'POST',
      headers: { 'x-api-key': 'f3c87b02-4d0d-4e0a-9d5c-30a91ec77510' },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message ?? `HTTP error! status: ${response.status}`);
    return body;
  }

  // DELETE bez kontekstu urządzenia; jak putFile rzuca wyjątek z komunikatem serwera
  static async deleteJson(path: string) {
    const response = await fetch(prefixMocks(path), {
      method: 'DELETE',
      headers: { 'x-api-key': 'f3c87b02-4d0d-4e0a-9d5c-30a91ec77510' },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message ?? `HTTP error! status: ${response.status}`);
    return body;
  }

  static async put(path: string, data: unknown, includeDevice = true) {
    const response = await fetch(prefixMocks(withDeviceContext(path, includeDevice)), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'x-api-key': 'f3c87b02-4d0d-4e0a-9d5c-30a91ec77510',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }

}
