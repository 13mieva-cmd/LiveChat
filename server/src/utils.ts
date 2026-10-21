export function normalizeText(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 4000);
}

export function createThrottle(intervalMs: number) {
  let lastSent = 0;
  let timer: NodeJS.Timeout | null = null;
  let pendingValue: string | null = null;
  return function send(value: string, callback: (value: string) => void): void {
    pendingValue = value;
    const remaining = intervalMs - (Date.now() - lastSent);
    if (remaining <= 0) {
      if (timer) clearTimeout(timer);
      timer = null;
      lastSent = Date.now();
      const next = pendingValue;
      pendingValue = null;
      callback(next);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        lastSent = Date.now();
        const next = pendingValue;
        pendingValue = null;
        if (next !== null) callback(next);
      }, remaining);
    }
  };
}
