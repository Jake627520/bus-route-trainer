import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import RecallPracticePage from '@/app/practice/recall/page';

// Mock the API client internally used by useRecallSession
const mockStartPlannedSession = vi.fn();
const mockGetCurrentPrompt = vi.fn();
const mockSubmitAnswer = vi.fn();
const mockAbandonSession = vi.fn();
const mockGetSessionState = vi.fn();

vi.mock('@/application/recall/client/recall-api', () => {
  return {
    RecallApiClient: class {
      startPlannedSession = mockStartPlannedSession;
      getCurrentPrompt = mockGetCurrentPrompt;
      submitAnswer = mockSubmitAnswer;
      abandonSession = mockAbandonSession;
      getSessionState = mockGetSessionState;
    },
  };
});

describe('Change 10 Phase 10.3: RecallPracticePage View States & UX Acceptance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockSession = {
    id: 'sess-999',
    driverId: 'drv-01',
    routeId: '66',
    targetVariantKey: '66-1-INBOUND',
    status: 'IN_PROGRESS' as const,
    currentPromptIndex: 0,
    totalCards: 2,
    startedAt: '2026-09-11T10:00:00.000Z',
  };

  const mockPrompt0 = {
    sessionId: 'sess-999',
    promptIndex: 0,
    totalCards: 2,
    cardId: 'c1',
    cardKey: 'k1',
    recallMode: 'NEXT_STOP_FORWARD' as const,
    givenReference: 'Roma Street Busway',
    startedAt: '2026-09-11T10:00:00.000Z',
  };

  it('1. IDLE: renders start form and submits parameters to start practice', async () => {
    mockStartPlannedSession.mockResolvedValueOnce({ session: mockSession, isNew: true });
    mockGetCurrentPrompt.mockResolvedValueOnce(mockPrompt0);

    render(<RecallPracticePage />);

    expect(screen.getByText('Start Route Practice Session')).toBeInTheDocument();
    expect(screen.getByLabelText('Route Number / ID')).toHaveValue('66');

    fireEvent.click(screen.getByRole('button', { name: 'Start Practice Session' }));

    await waitFor(() => {
      expect(mockStartPlannedSession).toHaveBeenCalledWith({
        routeId: '66',
        variantKey: '66-1-INBOUND',
        sessionSize: 10,
      });
    });

    // Enters ACTIVE state
    await waitFor(() => {
      expect(screen.getByText('Roma Street Busway')).toBeInTheDocument();
      expect(screen.getByText('Next Stop Prediction')).toBeInTheDocument();
    });
  });

  it('2. ACTIVE -> SUBMITTING -> FEEDBACK: evaluates answer and displays outcome', async () => {
    mockStartPlannedSession.mockResolvedValueOnce({ session: mockSession, isNew: true });
    mockGetCurrentPrompt.mockResolvedValueOnce(mockPrompt0);
    mockSubmitAnswer.mockResolvedValueOnce({
      outcome: 'PASS',
      promptIndex: 0,
      isSessionCompleted: false,
      resultingState: 'LEARNING',
      resultingSrsLevel: 1,
      isDuplicate: false,
    });

    render(<RecallPracticePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Practice Session' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Enter Next Stop Name')).toBeInTheDocument();
    });

    const input = screen.getByLabelText('Enter Next Stop Name');
    fireEvent.change(input, { target: { value: 'King George Square' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit Answer/i }));

    await waitFor(() => {
      expect(mockSubmitAnswer).toHaveBeenCalledWith({
        sessionId: 'sess-999',
        promptIndex: 0,
        rawInput: 'King George Square',
        recallMode: 'NEXT_STOP_FORWARD',
      });
    });

    // FEEDBACK state
    await waitFor(() => {
      expect(screen.getByText('Correct Recall!')).toBeInTheDocument();
      expect(screen.getByText(/LEARNING/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Next Question/i })).toBeInTheDocument();
    });
  });

  it('3. COMPLETED: transitions to completed summary when isSessionCompleted is true', async () => {
    mockStartPlannedSession.mockResolvedValueOnce({ session: mockSession, isNew: true });
    mockGetCurrentPrompt.mockResolvedValueOnce(mockPrompt0);
    mockSubmitAnswer.mockResolvedValueOnce({
      outcome: 'PASS',
      promptIndex: 1,
      isSessionCompleted: true,
      resultingState: 'MASTERED',
      resultingSrsLevel: 5,
      isDuplicate: false,
    });

    render(<RecallPracticePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Practice Session' }));

    await waitFor(() => {
      expect(screen.getByLabelText('Enter Next Stop Name')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Enter Next Stop Name'), {
      target: { value: 'Cultural Centre' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Submit Answer/i }));

    await waitFor(() => {
      expect(screen.getByText('Practice Session Completed!')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Practice Again' })).toBeInTheDocument();
    });
  });

  it('4. ABANDONING -> ABANDONED: modal confirmation flow', async () => {
    mockStartPlannedSession.mockResolvedValueOnce({ session: mockSession, isNew: true });
    mockGetCurrentPrompt.mockResolvedValueOnce(mockPrompt0);
    mockAbandonSession.mockResolvedValueOnce({
      sessionId: 'sess-999',
      status: 'ABANDONED',
      abandonedAt: '2026-09-11T10:05:00.000Z',
      currentPromptIndex: 0,
      totalCards: 2,
    });

    render(<RecallPracticePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Practice Session' }));

    await waitFor(() => {
      expect(screen.getByText('Roma Street Busway')).toBeInTheDocument();
    });

    // Click abandon in top header
    fireEvent.click(screen.getByRole('button', { name: 'Abandon Practice Session' }));

    // Modal is open
    expect(screen.getByRole('dialog', { name: 'Abandon Recall Session?' })).toBeInTheDocument();

    // Confirm abandon
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Abandon' }));

    await waitFor(() => {
      expect(mockAbandonSession).toHaveBeenCalledWith('sess-999');
      expect(screen.getByText('Session Abandoned')).toBeInTheDocument();
    });
  });

  it('5. NO_CARDS_AVAILABLE: handles empty card queue gracefully', async () => {
    mockStartPlannedSession.mockResolvedValueOnce({
      session: null,
      isNew: false,
      reason: 'NO_ELIGIBLE_CARDS',
    });

    render(<RecallPracticePage />);
    fireEvent.click(screen.getByRole('button', { name: 'Start Practice Session' }));

    await waitFor(() => {
      expect(screen.getByText('All Caught Up!')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Choose Another Route' })).toBeInTheDocument();
    });
  });
});
