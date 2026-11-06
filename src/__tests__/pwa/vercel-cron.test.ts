import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const vercel = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'vercel.json'), 'utf8'));

describe('Change 52: vercel.json cron', () => {
  it('has exactly one cron, hitting the reminder endpoint', () => {
    expect(vercel.crons).toHaveLength(1);
    expect(vercel.crons[0].path).toBe('/api/cron/review-reminders');
    expect(fs.existsSync(path.join(process.cwd(), 'src/app/api/cron/review-reminders/route.ts'))).toBe(true);
  });

  it('runs once a day (Hobby plan rejects anything more frequent and fails the deploy)', () => {
    const [minute, hour, dom, month, dow] = vercel.crons[0].schedule.split(' ');
    expect(/^\d+$/.test(minute)).toBe(true);
    expect(/^\d+$/.test(hour)).toBe(true);
    expect([dom, month, dow]).toEqual(['*', '*', '*']);
  });

  it('fires at 19:00 UTC = 05:00 Brisbane (before the shift)', () => {
    const [minute, hour] = vercel.crons[0].schedule.split(' ').map(Number);
    expect([hour, minute]).toEqual([19, 0]);
    const brisbaneHour = (hour + 10) % 24;
    expect(brisbaneHour).toBe(5);
  });
});
