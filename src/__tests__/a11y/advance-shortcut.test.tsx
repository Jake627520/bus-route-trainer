import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { useAdvanceShortcut } from '@/app/_lib/use-advance-shortcut';

function Harness({ enabled, onAdvance }: { enabled: boolean; onAdvance: () => void }) {
  useAdvanceShortcut(enabled, onAdvance);
  return (
    <div>
      <button>Abandon</button>
      <a href="#x">Link</a>
      <input aria-label="field" />
    </div>
  );
}

describe('Change 48: useAdvanceShortcut', () => {
  it('advances on Enter and Space when nothing is focused (body)', () => {
    const onAdvance = vi.fn();
    render(<Harness enabled onAdvance={onAdvance} />);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(onAdvance).toHaveBeenCalledTimes(2);
  });

  it('does NOT hijack Enter/Space on a focused button, link or input', () => {
    const onAdvance = vi.fn();
    render(<Harness enabled onAdvance={onAdvance} />);
    for (const el of [
      screen.getByRole('button', { name: 'Abandon' }),
      screen.getByRole('link', { name: 'Link' }),
      screen.getByLabelText('field'),
    ]) {
      fireEvent.keyDown(el, { key: 'Enter' });
      fireEvent.keyDown(el, { key: ' ' });
    }
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('ignores combos with Ctrl / Alt / Meta / Shift and other keys', () => {
    const onAdvance = vi.fn();
    render(<Harness enabled onAdvance={onAdvance} />);
    fireEvent.keyDown(document.body, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(document.body, { key: ' ', altKey: true });
    fireEvent.keyDown(document.body, { key: 'a' });
    expect(onAdvance).not.toHaveBeenCalled();
  });

  it('does nothing while disabled', () => {
    const onAdvance = vi.fn();
    render(<Harness enabled={false} onAdvance={onAdvance} />);
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(onAdvance).not.toHaveBeenCalled();
  });
});
