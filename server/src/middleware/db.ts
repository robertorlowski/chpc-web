import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { TCO, TSettings } from './type';


const adapter = () => {
    return new JSONFile<TData>('./database/db.json');   
}

export type TData = { hp: TCO[], settings: TSettings};
export const db: Low<TData> = new Low<TData>(adapter(), {hp: [], settings: {}});

export default db