// Wywołania serwera do własnego API (moduł kotła → pompa ciepła: GET /hp, POST /operation/set, PUT /hp/cwu-loading,
// /device/properties): nagłówek z losowym tokenem procesu zwalnia je z logowania (core/middleware/session.ts).
import crypto from 'crypto';

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';
export const INTERNAL_TOKEN = crypto.randomBytes(24).toString('hex');
export const internalHeaders = (): Record<string, string> => ({ [INTERNAL_TOKEN_HEADER]: INTERNAL_TOKEN });
