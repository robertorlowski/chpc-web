// core/middleware/mock-response.ts
// Pozostałość: odpowiedzi testowe z plików src/mock-responses/<service>.json.
// Nieużywane w kodzie serwera, a katalog mock-responses nie istnieje.
import fs from 'fs';
import path from 'path';

export function prefixMocks(service: String) {
  const raw = fs.readFileSync(path.join(__dirname, `../../mock-responses/${service}.json`), 'utf8');
  return JSON.parse(raw);
}
