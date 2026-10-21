export function normalizeText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\s+$/g, '')
    .slice(0, 4000);
}

export function createThrottle(intervalMs: number) {
  let lastSent = 0;
  let timer: NodeJS.Timeout | null = null;
  let pendingValue: string | null = null;

  return function send(value: string, callback: (value: string) => void): void {
    pendingValue = value;
    const now = Date.now();
    const remaining = intervalMs - (now - lastSent);

    if (remaining <= 0) {
      lastSent = now;
      const valueToSend = pendingValue;
      pendingValue = null;
      callback(valueToSend);
      return;
    }

    if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        lastSent = Date.now();
        const valueToSend = pendingValue;
        pendingValue = null;
        if (valueToSend !== null) callback(valueToSend);
      }, remaining);
    }
  };
}
