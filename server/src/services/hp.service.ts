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
  //jeśli spręzarka ne działa i poprzednio nie działała to nie zapisujemy danych do bazy
  if (!data?.HP?.HPS) {
    if (coList.length == 0){
      coList.push(data);
    } else if (!coList[coList.length -1].HP?.HPS ) {
      coList[coList.length -1] = data ;
    }
  } else {
    coList.push(data);
  }

  await db.write();
  return data;
}
