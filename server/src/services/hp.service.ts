import db from '../middleware/db';
import { HpEntry, HpMetrics } from '../middleware/type';
import { sendMessage } from '../middleware/webSocet';

const parseDate = (str: String | undefined ):string   => !str ? "" : str.replace(/\./g, "-").replace(" ", "T");


export const clearData = async () => {
  await db.read();
  db.data.hp = [];
  const hp: HpEntry[] = db.data.hp;
  db.write();
  return hp;
}


export const getHpLastData = async () => {
  await db.read();
  const hp: HpEntry[] = db.data.hp;
  if (hp.length == 0) {
    return {};
  }
  return hp[hp.length - 1];
}

export const getHpAllData = async () => {
  await db.read();
  const hp: HpEntry[] = db.data.hp;
  return hp
    .filter(row => row.HP && row.time)
    .sort((a: HpEntry, b: HpEntry) => {
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


export const addHpData = async (data :HpEntry) => {
  await db.read();
  if ( data && data.HP ) {
    data.HP.Watts = Math.max(20, (data.HP.Watts ?? 0) - 120 ),
    db.data.hp.push(data);
  }
  await db.write();

  sendMessage('update');
  return data;
}
