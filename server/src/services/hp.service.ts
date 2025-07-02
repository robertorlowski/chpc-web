import db from '../middleware/db';
import { TCO, THP } from '../middleware/type';

export const getHpLast = async () => {
  await db.read();
  
  const hp: TCO[] = db.data.hp;
  if (hp.length == 0) {
    return await new Promise(resolve => setTimeout(() => resolve({}), 500));
  }
  return await new Promise(resolve => setTimeout(() => resolve(hp[hp.length - 1]), 500));
}

export const addHpData = async (data :TCO) => {
  await db.read();
  const hp: TCO[] = db.data.hp;
  hp.push(data);
  await db.write();
  return data;
}
