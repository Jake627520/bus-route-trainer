import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LiveAnnouncer } from '@/components/ui/live-announcer';

describe('Change 48: LiveAnnouncer', () => {
  it('is mounted (as a polite status region) even when there is no message yet', () => {
    render(<LiveAnnouncer message="" />);
    const region = screen.getByRole('status');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(region).toBeEmptyDOMElement();
  });

  it('announces a message by updating the same region (so readers speak it)', () => {
    const { rerender } = render(<LiveAnnouncer message="" />);
    const region = screen.getByRole('status');
    rerender(<LiveAnnouncer message="Incorrect. Correct answer: Muirfield Street" />);
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('Incorrect. Correct answer: Muirfield Street');
  });

  it('is visually hidden', () => {
    render(<LiveAnnouncer message="x" />);
    expect(screen.getByRole('status').className).toContain('sr-only');
  });
});
