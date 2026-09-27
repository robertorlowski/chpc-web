// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

dotenv.config();

// bez domyślnej wartości: brak API_KEY oznacza odmowę, a nie klucz znany z repozytorium
const API_KEY = process.env.API_KEY;

export function verifyApiKey(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  const apiKey = req.header('x-api-key');
  if (req.path == "/api/operation/set" || req.path == "/hp/clear" ) {
    if (!API_KEY || !apiKey || apiKey !== API_KEY ) {
      res.status(403).json({ error: 'Forbidden: Invalid API Key' });
      return;
    }
  }

  return next();
}
