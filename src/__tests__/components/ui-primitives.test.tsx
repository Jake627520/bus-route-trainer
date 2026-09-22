import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import {
  Button,
  Card,
  Badge,
  ProgressBar,
  TextInput,
  Modal,
} from '@/components/ui';

describe('Change 10 Phase 10.3: UI Primitives & Accessibility Tests', () => {
  describe('Button', () => {
    it('renders with min-h-[44px] touch ergonomics and handles click', () => {
      const handleClick = vi.fn();
      render(<Button onClick={handleClick}>Practice</Button>);

      const btn = screen.getByRole('button', { name: 'Practice' });
      expect(btn.className).toContain('min-h-[44px]');
      fireEvent.click(btn);
      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('disables button and shows spinner when loading', () => {
      render(<Button loading>Submitting</Button>);
      const btn = screen.getByRole('button', { name: 'Submitting' });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-busy', 'true');
    });
  });

  describe('Card', () => {
    it('renders elevated surface container with children', () => {
      render(<Card><span>Prompt Content</span></Card>);
      expect(screen.getByText('Prompt Content')).toBeInTheDocument();
    });
  });

  describe('Badge', () => {
    it('renders semantic badge with variant styling', () => {
      render(<Badge variant="blue">Next Stop</Badge>);
      const badge = screen.getByText('Next Stop');
      expect(badge.className).toContain('text-sky-800');
    });
  });

  describe('ProgressBar', () => {
    it('renders accessible progressbar with aria attributes', () => {
      render(<ProgressBar current={2} total={5} label="Session Gauge" />);
      const bar = screen.getByRole('progressbar', { name: 'Session Gauge' });
      expect(bar).toHaveAttribute('aria-valuenow', '2');
      expect(bar).toHaveAttribute('aria-valuemin', '0');
      expect(bar).toHaveAttribute('aria-valuemax', '5');
      expect(screen.getByText('2 / 5 (40%)')).toBeInTheDocument();
    });
  });

  describe('TextInput', () => {
    it('renders accessible input with label and min-h-[44px]', () => {
      render(
        <TextInput
          label="Next Station"
          placeholder="Enter stop name"
          defaultValue="Central"
        />,
      );
      const input = screen.getByLabelText('Next Station');
      expect(input.className).toContain('min-h-[44px]');
      expect(input).toHaveValue('Central');
    });

    it('renders alert when error prop is set', () => {
      render(
        <TextInput
          label="Station Name"
          error="Input is required"
        />,
      );
      const alert = screen.getByRole('alert');
      expect(alert).toHaveTextContent('Input is required');
      const input = screen.getByLabelText('Station Name');
      expect(input).toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('Modal', () => {
    it('renders dialog when isOpen is true and closes on ESC', () => {
      const handleClose = vi.fn();
      render(
        <Modal isOpen={true} onClose={handleClose} title="Abandon Session?">
          <p>Are you sure you want to abandon?</p>
        </Modal>,
      );

      expect(screen.getByRole('dialog', { name: 'Abandon Session?' })).toBeInTheDocument();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('does not render when isOpen is false', () => {
      render(
        <Modal isOpen={false} onClose={vi.fn()} title="Abandon Session?">
          <p>Hidden</p>
        </Modal>,
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
