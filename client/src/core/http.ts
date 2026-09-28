import { getSelectedDevice } from './context/DeviceContext';

// Połączenie z serwerem: adresy API i WebSocket oraz zapytania z kontekstem
// wybranego urządzenia (rootId, deviceId). API poszczególnych rodzajów
// sterowników jest w devices/<rodzaj>/api.ts, a urządzeń w core/api.ts.

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

export const wsAddressServer = () => {
  if (import.meta.env.DEV)
    return  `ws://${devServerHost()}:4001`
  else
    return  "wss://chpc-web.onrender.com/";
}

function prefixMocks(path: string) {
  if (import.meta.env.DEV)
    return  `http://${devServerHost()}:4001/api`.concat(path)
  else
    return  "https://chpc-web.onrender.com/api".concat(path);

}

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
