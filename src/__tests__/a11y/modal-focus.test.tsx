import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { Modal } from '@/components/ui';

function Harness({ open }: { open: boolean }) {
  return (
    <div>
      <button>Behind</button>
      <Modal isOpen={open} onClose={() => {}} title="Abandon?">
        <button>Cancel</button>
        <button>Confirm</button>
      </Modal>
    </div>
  );
}

describe('Change 48: Modal focus management', () => {
  it('does not steal focus back when the parent re-renders with a new onClose', () => {
    const { rerender } = render(
      <Modal isOpen onClose={() => {}} title="T"><button>A</button><button>B</button></Modal>,
    );
    screen.getByRole('button', { name: 'B' }).focus();
    rerender(
      <Modal isOpen onClose={() => {}} title="T"><button>A</button><button>B</button></Modal>,
    );
    expect(screen.getByRole('button', { name: 'B' })).toHaveFocus();
  });

  it('moves focus into the dialog when it opens', () => {
    render(<Harness open />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
  });

  it('focuses the first focusable control', () => {
    render(<Harness open />);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('wraps Tab from the last control to the first', () => {
    render(<Harness open />);
    screen.getByRole('button', { name: 'Confirm' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    render(<Harness open />);
    screen.getByRole('button', { name: 'Cancel' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: 'Confirm' })).toHaveFocus();
  });

  it('restores focus to the opener when it closes', () => {
    const { rerender } = render(<Harness open={false} />);
    const behind = screen.getByRole('button', { name: 'Behind' });
    behind.focus();
    rerender(<Harness open />);
    expect(behind).not.toHaveFocus();
    rerender(<Harness open={false} />);
    expect(behind).toHaveFocus();
  });
});
