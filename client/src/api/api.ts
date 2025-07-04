import { TCO, TOperationCO, TSettings } from "./type";

function prefixMocks(path: string) {
  if (process.env.NODE_ENV !== "production") 
    return  "http://localhost:4001/api".concat(path)
  else 
    return  "https://chpc-web.onrender.com/api".concat(path);

}

class Requests {
  
  static get(path: string) {
    console.log(prefixMocks(path));
    return fetch(
      prefixMocks(path),
      Object.assign(
        {
          method: "GET",
          // mode: "no-cors",
          cache: "no-cache",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded"
          },
          redirect: "follow",
          referrer: "no-referrer"
        }
      )
    ).then(response => {
        return response.json();
    }).catch(error => {
      console.warn(error);
    });
}

  static post(path :string, data = {}, json = true) {
    console.log(prefixMocks(path));
    return fetch(
      prefixMocks(path),
        Object.assign(
          {
            method: "POST",
            // mode: "no-cors",
            cache: "no-cache",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json; charset=utf-8"
            },
            redirect: "follow",
            referrer: "no-referrer",
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
  static getSettings() : Promise<TSettings> {
      return Requests.get("/settings");
  }

  static getCoData() : Promise<TCO> {
      return Requests.get("/hp");
  } 

  static getOperation() : Promise<TOperationCO> {
      return Requests.get("/operation");
  } 

  static setOperation(data: TOperationCO) {
      console.log(JSON.stringify(data));
      return Requests.post("/operation/set", data, false);
  } 
}
