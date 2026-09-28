import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ReviewNotifier } from '@/app/_components/review-notifier';

/**
 * Change 23 Task 1-2: ReviewNotifier（mock Notification API + fetch）。
 */
describe('Change 23: ReviewNotifier', () => {
  const notifCtor = vi.fn();
  let mockFetch: ReturnType<typeof vi.fn>;
  const jsonRes = (body: unknown): Response =>
    ({ status: 200, ok: true, json: async () => body } as unknown as Response);

  const summaryDue = (totalDue: number) =>
    jsonRes({ data: totalDue > 0 ? [{ routeId: 'R1', variantKey: 'V1', directionId: 0, status: 'IN_PROGRESS', headsign: null, dueCount: totalDue, newCount: 0, masteredCount: 0, totalCards: 10, nextReviewAt: null }] : [] });

  const installNotification = (permission: NotificationPermission, requestResult: NotificationPermission = 'granted') => {
    class MockNotification {
      static permission: NotificationPermission = permission;
      static requestPermission = vi.fn(async () => requestResult);
      constructor(title: string, opts?: NotificationOptions) {
        notifCtor(title, opts);
      }
    }
    vi.stubGlobal('Notification', MockNotification);
    return MockNotification;
  };

  beforeEach(() => {
    notifCtor.mockClear();
    mockFetch = vi.fn().mockResolvedValue(summaryDue(0));
    vi.stubGlobal('fetch', mockFetch);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers an enable button when permission is default and requests permission on click', async () => {
    installNotification('default');
    render(<ReviewNotifier />);
    const btn = await screen.findByRole('button', { name: /開啟複習提醒/ });
    fireEvent.click(btn);
    expect((globalThis.Notification as unknown as { requestPermission: ReturnType<typeof vi.fn> }).requestPermission).toHaveBeenCalled();
  });

  it('fires a notification when granted and reviews are due (no button)', async () => {
    installNotification('granted');
    mockFetch.mockResolvedValue(summaryDue(3));
    render(<ReviewNotifier />);
    await waitFor(() => expect(notifCtor).toHaveBeenCalledTimes(1));
    const [title, opts] = notifCtor.mock.calls[0];
    expect(String(title)).toMatch(/複習/);
    expect(String(opts?.body)).toMatch(/3/);
    expect(screen.queryByRole('button', { name: /開啟複習提醒/ })).not.toBeInTheDocument();
  });

  it('does not fire when granted but nothing is due', async () => {
    installNotification('granted');
    mockFetch.mockResolvedValue(summaryDue(0));
    render(<ReviewNotifier />);
    await new Promise((r) => setTimeout(r, 30));
    expect(notifCtor).not.toHaveBeenCalled();
  });

  it('renders nothing and does not fire when permission is denied', async () => {
    installNotification('denied');
    mockFetch.mockResolvedValue(summaryDue(3));
    const { container } = render(<ReviewNotifier />);
    await new Promise((r) => setTimeout(r, 30));
    expect(container).toBeEmptyDOMElement();
    expect(notifCtor).not.toHaveBeenCalled();
  });

  it('renders nothing when Notification API is unsupported', () => {
    // 不 stub Notification（jsdom 無此 API）
    const { container } = render(<ReviewNotifier />);
    expect(container).toBeEmptyDOMElement();
  });
});
