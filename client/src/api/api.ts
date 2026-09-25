import { Device, HpEntry, OperationEntry, ScheduleEntry } from "./type";
import { getSelectedDevice } from '../context/DeviceContext';

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

class Requests {
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


export class HpRequests {
  static getDevices(): Promise<Device[]> {
    return Requests.get('/devices', false) as Promise<Device[]>;
  }

  // rootId w ścieżce: na liście urządzeń żadne nie jest jeszcze wybrane
  static updateDeviceName(rootId: string, name: string): Promise<Device> {
    return Requests.put(`/devices/${encodeURIComponent(rootId)}`, { name }, false) as Promise<Device>;
  }

  static getDeviceProperties(): Promise<NonNullable<Device['properties']>> {
    return Requests.get('/device/properties') as Promise<NonNullable<Device['properties']>>;
  }

  static updateDeviceProperties(properties: NonNullable<Device['properties']>) {
    return Requests.put('/device/properties', properties) as Promise<NonNullable<Device['properties']>>;
  }

  static getHpMonthlySummary(
    startDate: string,
    endDate: string,
    group: 'month' | 'day' = 'month',
  ) {
      return Requests.get(
        `/hp/monthly-summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&group=${group}`,
      ) as Promise<Array<{
        month?: number;
        day?: number;
        consumptionKWh: number;
        pvGenerationKWh: number;
        gridEnergyKWh: number;
        pvUsedKWh: number;
        totalVariableCostPLN: number;
      }> | null>;
  }

  static getCoData() : Promise<HpEntry> {
      return Requests.get("/hp");
  } 

  static getHpAllData() : Promise<HpEntry[]> {
      return Requests.get("/hp/all");
  } 

  static getHpAvailableDates(): Promise<string[] | null> {
      return Requests.get('/hp/dates');
  }

  static getHpData4Day(day?: string, endDay?: string) : Promise<HpEntry[]> {
      if (!day || (endDay && !day)) {
        return Promise.resolve([])
      }

      const query = endDay
        ? `startDate=${encodeURIComponent(day)}&endDate=${encodeURIComponent(endDay)}`
        : `date=${encodeURIComponent(day)}`;

      return Requests.get(`/hp/4Day?${query}`);
  }

  static prepareOperation() : Promise<OperationEntry> {
      return Requests.get("/operation");
  } 

  static getOperation() : Promise<OperationEntry> {
      return Requests.get("/operation/get");
  } 

  static setOperation(data: OperationEntry) {
      console.log(JSON.stringify(data));
      return Requests.post("/operation/set", data, false);
  }

  // akcja jednorazowa dla sterownika: 'error_reset' (odblokowanie) albo 'restart'
  static runOperationAction(action: 'error_reset' | 'restart') {
      return Requests.post("/operation/action", { action }, false);
  }

  static getHpLastError() : Promise<HpEntry | null> {
      return Requests.get("/hp/last-error");
  }

      static getSchedules(): Promise<ScheduleEntry[] | null> {
        return Requests.get('/schedules');
      }

      static createSchedule(data: Omit<ScheduleEntry, 'enabled'> & { enabled?: boolean }) {
        return Requests.post('/schedules', data);
      }

      static updateSchedule(id: string, data: Omit<ScheduleEntry, 'enabled'> & { enabled?: boolean }) {
        return Requests.put(`/schedules/${encodeURIComponent(id)}`, data);
      }

      static deleteSchedule(id: string) {
        return Requests.delete(`/schedules/${encodeURIComponent(id)}`);
      }
}
