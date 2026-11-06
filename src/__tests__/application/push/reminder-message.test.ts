import { describe, it, expect } from 'vitest';
import { buildReminderPayload } from '@/application/push/reminder-message';

describe('Change 52: reminder message', () => {
  it('English: only a fixed template plus the count', () => {
    const p = JSON.parse(buildReminderPayload('en', 12));
    expect(p).toEqual({ title: 'Review reminder', body: 'You have 12 cards to review', url: '/' });
  });

  it('繁體中文', () => {
    const p = JSON.parse(buildReminderPayload('zh-TW', 3));
    expect(p).toEqual({ title: '待複習提醒', body: '你有 3 張卡片待複習', url: '/' });
  });

  it('has exactly title/body/url — nothing that could leak what is being studied', () => {
    const p = JSON.parse(buildReminderPayload('en', 1));
    expect(Object.keys(p).sort()).toEqual(['body', 'title', 'url']);
  });

  it('uses the singular for one card (English)', () => {
    expect(JSON.parse(buildReminderPayload('en', 1)).body).toBe('You have 1 card to review');
  });
});
