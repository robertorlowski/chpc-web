import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import { HpEntry, SettingsEntry } from './type';


const adapter = () => {
    return new JSONFile<TData>('./database/db.json');   
}

export type TData = { hp: HpEntry[], settings: SettingsEntry};
export const db: Low<TData> = new Low<TData>(adapter(), {hp: [], settings: {}});

export default db