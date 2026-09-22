import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRecallSession } from '@/application/recall/client/use-recall-session';
import { RecallApiClient } from '@/application/recall/client/recall-api';
import {
  NetworkError,
  SessionNotFoundError,
  SessionNotActiveError,
} from '@/application/recall/client/recall-errors';
import {
  RecallSessionDto,
  CurrentSessionPromptDto,
  SubmitSessionAnswerResponseData,
  AbandonSessionResponseData,
} from '@/application/recall/client/recall-types';

describe('Change 10 Phase 10.3: useRecallSession View State Machine & Lifecycle Tests', () => {
  let mockClient: RecallApiClient;

  const mockSession: RecallSessionDto = {
    id: 'sess-100',
    driverId: 'drv-01',
    routeId: 'route-66',
    targetVariantKey: 'var-1',
    status: 'IN_PROGRESS',
    currentPromptIndex: 0,
    totalCards: 3,
    startedAt: '2026-09-11T10:00:00.000Z',
  };

  const mockPrompt0: CurrentSessionPromptDto = {
    sessionId: 'sess-100',
    promptIndex: 0,
    totalCards: 3,
    cardId: 'c1',
    cardKey: 'k1',
    recallMode: 'NEXT_STOP_FORWARD',
    givenReference: 'Roma Street',
    startedAt: '2026-09-11T10:00:01.000Z',
  };

  const mockPrompt1: CurrentSessionPromptDto = {
    sessionId: 'sess-100',
    promptIndex: 1,
    totalCards: 3,
    cardId: 'c2',
    cardKey: 'k2',
    recallMode: 'NEXT_STOP_FORWARD',
    givenReference: 'King George Square',
    startedAt: '2026-09-11T10:00:10.000Z',
  };

  beforeEach(() => {
    mockClient = new RecallApiClient();
  });

  describe('1. Start Session Flow', () => {
    it('starts in IDLE and transitions through STARTING to ACTIVE', async () => {
      vi.spyOn(mockClient, 'startPlannedSession').mockResolvedValueOnce({
        session: mockSession,
        isNew: true,
      });
      vi.spyOn(mockClient, 'getCurrentPrompt').mockResolvedValueOnce(mockPrompt0);

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));
      expect(result.current.viewState).toBe('IDLE');

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });

      expect(result.current.viewState).toBe('ACTIVE');
      expect(result.current.session).toEqual(mockSession);
      expect(result.current.currentPrompt).toEqual(mockPrompt0);
      expect(result.current.error).toBeNull();
    });

    it('transitions to NO_CARDS_AVAILABLE when server returns reason NO_ELIGIBLE_CARDS', async () => {
      vi.spyOn(mockClient, 'startPlannedSession').mockResolvedValueOnce({
        session: null,
        isNew: false,
        reason: 'NO_ELIGIBLE_CARDS',
      });

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });

      expect(result.current.viewState).toBe('NO_CARDS_AVAILABLE');
      expect(result.current.session).toBeNull();
      expect(result.current.currentPrompt).toBeNull();
    });

    it('transitions to ERROR when starting session fails with API error', async () => {
      vi.spyOn(mockClient, 'startPlannedSession').mockRejectedValueOnce(
        new SessionNotFoundError('Route not found'),
      );

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });

      expect(result.current.viewState).toBe('ERROR');
      expect(result.current.error).toBeInstanceOf(SessionNotFoundError);
    });
  });

  describe('2. Answer Submission & Exact Identity Locking', () => {
    beforeEach(async () => {
      vi.spyOn(mockClient, 'startPlannedSession').mockResolvedValueOnce({
        session: mockSession,
        isNew: true,
      });
      vi.spyOn(mockClient, 'getCurrentPrompt').mockResolvedValueOnce(mockPrompt0);
    });

    it('submits answer and transitions to FEEDBACK when not final question', async () => {
      const outcome: SubmitSessionAnswerResponseData = {
        outcome: 'PASS',
        promptIndex: 0,
        isSessionCompleted: false,
        resultingState: 'LEARNING',
        resultingSrsLevel: 1,
        isDuplicate: false,
      };
      const submitSpy = vi.spyOn(mockClient, 'submitAnswer').mockResolvedValueOnce(outcome);

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });

      await act(async () => {
        await result.current.submitAnswer('King George Square');
      });

      expect(submitSpy).toHaveBeenCalledWith({
        sessionId: 'sess-100',
        promptIndex: 0,
        rawInput: 'King George Square',
        recallMode: 'NEXT_STOP_FORWARD',
      });
      expect(result.current.viewState).toBe('FEEDBACK');
      expect(result.current.lastOutcome).toEqual(outcome);
      expect(result.current.pendingSubmission).toBeNull();
    });

    it('authoritatively transitions to COMPLETED when server indicates isSessionCompleted: true', async () => {
      const finalOutcome: SubmitSessionAnswerResponseData = {
        outcome: 'PASS',
        promptIndex: 2,
        isSessionCompleted: true,
        resultingState: 'MASTERED',
        resultingSrsLevel: 5,
        isDuplicate: false,
      };
      vi.spyOn(mockClient, 'submitAnswer').mockResolvedValueOnce(finalOutcome);

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });

      await act(async () => {
        await result.current.submitAnswer('Cultural Centre');
      });

      expect(result.current.viewState).toBe('COMPLETED');
      expect(result.current.lastOutcome).toEqual(finalOutcome);
      expect(result.current.pendingSubmission).toBeNull();
    });

    it('locks exact SubmissionIdentity and enters SUBMIT_FAILED on NetworkError', async () => {
      vi.spyOn(mockClient, 'submitAnswer').mockRejectedValueOnce(
        new NetworkError('Connection timeout'),
      );

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });

      await act(async () => {
        await result.current.submitAnswer('King George Square');
      });

      expect(result.current.viewState).toBe('SUBMIT_FAILED');
      expect(result.current.error).toBeInstanceOf(NetworkError);

      // Verify exact submission identity is frozen and preserved
      expect(result.current.pendingSubmission).toEqual({
        sessionId: 'sess-100',
        promptIndex: 0,
        rawInput: 'King George Square',
        recallMode: 'NEXT_STOP_FORWARD',
      });
      expect(Object.isFrozen(result.current.pendingSubmission)).toBe(true);
    });

    it('retrySubmission re-sends the exact unchanged SubmissionIdentity', async () => {
      const submitSpy = vi.spyOn(mockClient, 'submitAnswer')
        .mockRejectedValueOnce(new NetworkError('Network drop'))
        .mockResolvedValueOnce({
          outcome: 'PASS',
          promptIndex: 0,
          isSessionCompleted: false,
          resultingState: 'LEARNING',
          resultingSrsLevel: 1,
          isDuplicate: false,
        });

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });

      // First submit fails with network drop
      await act(async () => {
        await result.current.submitAnswer('King George Square');
      });
      expect(result.current.viewState).toBe('SUBMIT_FAILED');

      // User triggers manual retry
      await act(async () => {
        await result.current.retrySubmission();
      });

      expect(submitSpy).toHaveBeenCalledTimes(2);
      // Verify second call passed the exact same parameters
      expect(submitSpy.mock.calls[1][0]).toEqual(submitSpy.mock.calls[0][0]);
      expect(result.current.viewState).toBe('FEEDBACK');
      expect(result.current.pendingSubmission).toBeNull();
    });
  });

  describe('3. Advancement to Next Prompt from FEEDBACK', () => {
    it('fetches next prompt and transitions back to ACTIVE', async () => {
      vi.spyOn(mockClient, 'startPlannedSession').mockResolvedValueOnce({
        session: mockSession,
        isNew: true,
      });
      const promptSpy = vi.spyOn(mockClient, 'getCurrentPrompt')
        .mockResolvedValueOnce(mockPrompt0)
        .mockResolvedValueOnce(mockPrompt1);

      vi.spyOn(mockClient, 'submitAnswer').mockResolvedValueOnce({
        outcome: 'PASS',
        promptIndex: 0,
        isSessionCompleted: false,
        resultingState: 'LEARNING',
        resultingSrsLevel: 1,
        isDuplicate: false,
      });

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });
      await act(async () => {
        await result.current.submitAnswer('King George Square');
      });
      expect(result.current.viewState).toBe('FEEDBACK');

      await act(async () => {
        await result.current.nextPrompt();
      });

      expect(promptSpy).toHaveBeenCalledTimes(2);
      expect(result.current.viewState).toBe('ACTIVE');
      expect(result.current.currentPrompt).toEqual(mockPrompt1);
      expect(result.current.lastOutcome).toBeNull();
    });

    it('transitions to COMPLETED if nextPrompt throws SESSION_NOT_ACTIVE (completed)', async () => {
      vi.spyOn(mockClient, 'startPlannedSession').mockResolvedValueOnce({
        session: mockSession,
        isNew: true,
      });
      vi.spyOn(mockClient, 'getCurrentPrompt')
        .mockResolvedValueOnce(mockPrompt0)
        .mockRejectedValueOnce(new SessionNotActiveError('Session completed'));

      vi.spyOn(mockClient, 'submitAnswer').mockResolvedValueOnce({
        outcome: 'PASS',
        promptIndex: 0,
        isSessionCompleted: false,
        resultingState: 'LEARNING',
        resultingSrsLevel: 1,
        isDuplicate: false,
      });

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });
      await act(async () => {
        await result.current.submitAnswer('King George Square');
      });
      expect(result.current.viewState).toBe('FEEDBACK');

      await act(async () => {
        await result.current.nextPrompt();
      });

      expect(result.current.viewState).toBe('COMPLETED');
    });
  });

  describe('4. Abandon Session Flow', () => {
    beforeEach(async () => {
      vi.spyOn(mockClient, 'startPlannedSession').mockResolvedValueOnce({
        session: mockSession,
        isNew: true,
      });
      vi.spyOn(mockClient, 'getCurrentPrompt').mockResolvedValueOnce(mockPrompt0);
    });

    it('supports requesting and cancelling abandon, returning to ACTIVE', async () => {
      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });

      act(() => {
        result.current.requestAbandon();
      });
      expect(result.current.viewState).toBe('ABANDONING');

      act(() => {
        result.current.cancelAbandon();
      });
      expect(result.current.viewState).toBe('ACTIVE');
    });

    it('confirms abandon, calls client and transitions to ABANDONED', async () => {
      const abandonResult: AbandonSessionResponseData = {
        sessionId: 'sess-100',
        status: 'ABANDONED',
        abandonedAt: '2026-09-11T10:05:00.000Z',
        currentPromptIndex: 0,
        totalCards: 3,
      };
      vi.spyOn(mockClient, 'abandonSession').mockResolvedValueOnce(abandonResult);

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });

      act(() => {
        result.current.requestAbandon();
      });

      await act(async () => {
        await result.current.confirmAbandon();
      });

      expect(result.current.viewState).toBe('ABANDONED');
      expect(result.current.abandonInfo).toEqual(abandonResult);
    });
  });

  describe('5. Reset Action', () => {
    it('clears all state back to IDLE', async () => {
      vi.spyOn(mockClient, 'startPlannedSession').mockResolvedValueOnce({
        session: mockSession,
        isNew: true,
      });
      vi.spyOn(mockClient, 'getCurrentPrompt').mockResolvedValueOnce(mockPrompt0);

      const { result } = renderHook(() => useRecallSession({ client: mockClient }));

      await act(async () => {
        await result.current.startSession({ routeId: 'route-66', variantKey: 'var-1' });
      });
      expect(result.current.viewState).toBe('ACTIVE');

      act(() => {
        result.current.reset();
      });

      expect(result.current.viewState).toBe('IDLE');
      expect(result.current.session).toBeNull();
      expect(result.current.currentPrompt).toBeNull();
      expect(result.current.lastOutcome).toBeNull();
    });
  });
});
