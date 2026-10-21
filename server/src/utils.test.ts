import { describe, expect, it } from 'vitest';
import { normalizeText, createThrottle } from './utils.js';
import { messageSchema } from './validation.js';

describe('normalizeText', () => {
  it('удаляет управляющие символы и обрезает длину', () => {
    expect(normalizeText('  Привет\u0000 ')).toBe('Привет');
    expect(normalizeText('a'.repeat(5000)).length).toBe(4000);
  });
});

describe('messageSchema', () => {
  it('отклоняет пустое сообщение', () => {
    expect(messageSchema.safeParse({ clientId: '12345678', body: '   ' }).success).toBe(false);
  });

  it('принимает обычное сообщение', () => {
    expect(messageSchema.safeParse({ clientId: '12345678', body: 'Здравствуйте' }).success).toBe(true);
  });
});

describe('createThrottle', () => {
  it('отправляет последнее значение не чаще интервала', async () => {
    const results: string[] = [];
    const send = createThrottle(50);
    send('a', (value) => results.push(value));
    send('ab', (value) => results.push(value));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(results).toEqual(['a', 'ab']);
  });
});
