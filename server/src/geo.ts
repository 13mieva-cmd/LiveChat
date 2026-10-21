import path from 'node:path';
import { env } from './env.js';

let reader: any = null;
let loadAttempted = false;

export async function lookupGeo(ip: string | null): Promise<{ city: string | null; country: string | null }> {
  if (!env.maxmindDbPath || !ip || (loadAttempted && !reader)) {
    return { city: null, country: null };
  }

  try {
    if (!reader) {
      loadAttempted = true;
      const maxmind = await import('maxmind');
      reader = await maxmind.open(path.resolve(env.maxmindDbPath));
    }
    const result = reader.get(ip);
    return {
      city: result?.city?.names?.ru ?? result?.city?.names?.en ?? null,
      country: result?.country?.names?.ru ?? result?.country?.names?.en ?? null
    };
  } catch {
    return { city: null, country: null };
  }
}
