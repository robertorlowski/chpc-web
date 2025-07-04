import { setOperation } from '../controllers/operation.controller';
import db from '../middleware/db';
import { TCO, THP, TOperationCO } from '../middleware/type';
import { setOperationData } from './operation.service';

const parseDate = (str: String | undefined ):string   => !str ? "" : str.replace(/\./g, "-").replace(" ", "T");


export const getHpLastData = async () => {
  await db.read();
  const hp: TCO[] = db.data.hp;
  if (hp.length == 0) {
    return {};
  }
  return hp[hp.length - 1];
}

export const getHpAllData= async () => {
  await db.read();
  const hp: TCO[] = db.data.hp;
  return db.data.hp.sort((a: TCO, b: TCO) => {
      if ((!a.time) || (!b.time)) {
        return 0;
      }
      return new Date(parseDate(b.time)).getTime() - new Date(parseDate(a.time)).getTime();
  });
}


export const addHpData = async (data :TCO) => {
  await db.read();
  const coList: TCO[] = db.data.hp;
  const op :TOperationCO = {};
  op.force = data.HP?.F ? "1" :"0";
  op.co_min = data?.co_min;
  op.co_max = data?.co_max;
  op.cwu_min = data?.cwu_min,
  op.cwu_max = data?.co_max,
  op.cold_pomp = data?.HP?.CCS ? "1" : "0";
  op.hot_pomp = data?.HP?.HCS ? "1" : "0";
  op.sump_heater = data?.HP?.SHS ? "1" : "0";
  op.work_mode = data?.work_mode;
  setOperationData(op);

  //jeśli spręzarka ne działa i poprzednio nie działała to nie zapisujemy danych do bazy
  if (!data?.HP?.HPS) {
    if (coList.length > 0 && !coList[coList.length -1].HP?.HPS ) {
      return {};
    }
  }

  coList.push(data);
  await db.write();
  return data;
}
