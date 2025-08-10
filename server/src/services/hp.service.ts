import db from '../middleware/db';
import { TCO, THP } from '../middleware/type';
import { sendMessage } from '../middleware/webSocet';

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

export const getHpAllData = async () => {
  await db.read();
  const hp: TCO[] = db.data.hp;
  return hp
    .filter(row => row.HP && row.time)
    .sort((a: TCO, b: TCO) => {
      if ( !a || !b || !a.time || !b.time) {
        return 0;
      }
      try {
        return new Date(parseDate(b.time)).getTime() - new Date(parseDate(a.time)).getTime();
      } catch(error) {
        return 0;
      }
  });
}


export const addHpData = async (data :TCO) => {
  await db.read();
  if ( data && data.HP ) {
    data.HP.Watts = Math.max(20, (data.HP.Watts ?? 0) - 120 ),
    db.data.hp.push(data);
  }
  await db.write();

  sendMessage('update');
  return data;
}
