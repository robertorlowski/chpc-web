// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const API_KEY = process.env.API_KEY || 'f3c87b02-4d0d-4e0a-9d5c-30a91ec77510';

export function verifyApiKey(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'OPTIONS') {
    return next();
  }

  const apiKey = req.header('x-api-key');
  if (!apiKey || apiKey !== API_KEY) {
    res.status(403).json({ error: 'Forbidden: Invalid API Key' });
    return;
  }

  next();
}