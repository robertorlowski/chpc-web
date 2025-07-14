import db from '../middleware/db';
import { TCO } from '../middleware/type';

const parseDate = (str: String | undefined ):string   => !str ? "" : str.replace(/\./g, "-").replace(" ", "T");


export const clearData = async () => {
  await db.read();
  db.data.hp = [];
  const hp: TCO[] = db.data.hp;
  db.write();
  return hp;
}


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
  return db.data.hp
    .filter(row => row.HP && row.time)
    .sort((a: TCO, b: TCO) => {
      if ((!a.time) || (!b.time)) {
        return 0;
      }
      return new Date(parseDate(b.time)).getTime() - new Date(parseDate(a.time)).getTime();
  });
}


export const addHpData = async (data :TCO) => {
  await db.read();
  if ( data && data.HP ) {
    db.data.hp.push(data);
  }
  await db.write();
  return data;
}
