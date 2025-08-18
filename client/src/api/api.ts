import { HpEntry, OperationEntry, SettingsEntry } from "./type";

export const wsAddressServer = () => {
  if (process.env.NODE_ENV !== "production") 
    return  "ws://localhost:4001"
  else 
    return  "wss://chpc-web.onrender.com/";
}

function prefixMocks(path: string) {
  if (process.env.NODE_ENV !== "production") 
    return  "http://localhost:4001/api".concat(path)
  else 
    return  "https://chpc-web.onrender.com/api".concat(path);

}

class Requests {
  static async get(path: string) {
    // console.log(prefixMocks(path));
    try {
      const response = await fetch(prefixMocks(path), {
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

  static post(path :string, data = {}, json = true) {
    return fetch(
      prefixMocks(path),
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

}


export class HpRequests {
  static getSettings() : Promise<SettingsEntry> {
      return Requests.get("/settings");
  }

  static getCoData() : Promise<HpEntry> {
      return Requests.get("/hp");
  } 

  static getHpAllData() : Promise<HpEntry[]> {
      return Requests.get("/hp/all");
  } 

  static getHpData4Day(day?: string) : Promise<HpEntry[]> {
      if (!day) {
        return Promise.resolve([])
      }
      return Requests.get( `/hp/4Day?date=${day}`);
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
}
