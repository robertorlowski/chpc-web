// middleware/mockResponse.ts
import fs from 'fs';
import path from 'path';

export function prefixMocks(service: String) {
  const raw = fs.readFileSync(path.join(__dirname, `../../mock-responses/${service}.json`), 'utf8');
  return JSON.parse(raw);
}
