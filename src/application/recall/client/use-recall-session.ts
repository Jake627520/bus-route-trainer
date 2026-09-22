'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { RecallApiClient } from './recall-api';
import {
  RecallMode,
  RecallSessionDto,
  CurrentSessionPromptDto,
  SubmitSessionAnswerResponseData,
  AbandonSessionResponseData,
  SubmissionIdentity,
  StartPlannedSessionRequest,
} from './recall-types';
import {
  RecallClientError,
  NetworkError,
  SessionNotActiveError,
} from './recall-errors';

export type RecallViewState =
  | 'IDLE'
  | 'STARTING'
  | 'NO_CARDS_AVAILABLE'
  | 'ACTIVE'
  | 'SUBMITTING'
  | 'SUBMIT_FAILED'
  | 'FEEDBACK'
  | 'COMPLETED'
  | 'ABANDONING'
  | 'ABANDONED'
  | 'ERROR';

export interface UseRecallSessionOptions {
  readonly client?: RecallApiClient;
}

export function useRecallSession(options: UseRecallSessionOptions = {}) {
  const client = useMemo(() => options.client ?? new RecallApiClient(), [options.client]);

  const [viewState, setViewState] = useState<RecallViewState>('IDLE');
  const [session, setSession] = useState<RecallSessionDto | null>(null);
  const [currentPrompt, setCurrentPrompt] = useState<CurrentSessionPromptDto | null>(null);
  const [lastOutcome, setLastOutcome] = useState<SubmitSessionAnswerResponseData | null>(null);
  const [abandonInfo, setAbandonInfo] = useState<AbandonSessionResponseData | null>(null);
  const [error, setError] = useState<RecallClientError | null>(null);

  // Exact locked submission identity preserved for safe retry without payload mutation
  const [pendingSubmission, setPendingSubmission] = useState<SubmissionIdentity | null>(null);

  // Keep a reference to return to previous state if abandon is cancelled
  const previousStateBeforeAbandon = useRef<'ACTIVE' | 'FEEDBACK'>('ACTIVE');

  /**
   * Action 1: Start a planned session
   */
  const startSession = useCallback(
    async (params: StartPlannedSessionRequest): Promise<void> => {
      setViewState('STARTING');
      setError(null);
      setLastOutcome(null);
      setAbandonInfo(null);
      setPendingSubmission(null);

      try {
        const response = await client.startPlannedSession(params);

        if (response.reason === 'NO_ELIGIBLE_CARDS' || !response.session) {
          setSession(null);
          setCurrentPrompt(null);
          setViewState('NO_CARDS_AVAILABLE');
          return;
        }

        setSession(response.session);

        // Fetch first prompt
        const prompt = await client.getCurrentPrompt(response.session.id);
        setCurrentPrompt(prompt);
        setViewState('ACTIVE');
      } catch (err: unknown) {
        const clientError =
          err instanceof RecallClientError
            ? err
            : new RecallClientError(500, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : 'Unknown error');
        setError(clientError);
        setViewState('ERROR');
      }
    },
    [client],
  );

  /**
   * Action 2: Submit an answer with locked SubmissionIdentity
   */
  const submitAnswer = useCallback(
    async (rawInput: string, overrideMode?: RecallMode): Promise<void> => {
      if (viewState !== 'ACTIVE' || !currentPrompt) {
        return;
      }

      // Exact locked submission identity
      const submission: SubmissionIdentity = Object.freeze({
        sessionId: currentPrompt.sessionId,
        promptIndex: currentPrompt.promptIndex,
        rawInput,
        recallMode: overrideMode ?? currentPrompt.recallMode,
      });

      setPendingSubmission(submission);
      setViewState('SUBMITTING');
      setError(null);

      try {
        const result = await client.submitAnswer(submission);
        setLastOutcome(result);

        // Session completion is authoritatively determined by server response
        if (result.isSessionCompleted) {
          setViewState('COMPLETED');
          setPendingSubmission(null);
        } else {
          setViewState('FEEDBACK');
          setPendingSubmission(null);
        }
      } catch (err: unknown) {
        const clientError =
          err instanceof RecallClientError
            ? err
            : new RecallClientError(500, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : 'Unknown error');

        setError(clientError);

        // If network error, transition to SUBMIT_FAILED to allow manual retry with exact identity
        if (clientError instanceof NetworkError) {
          setViewState('SUBMIT_FAILED');
        } else {
          setViewState('ERROR');
          setPendingSubmission(null);
        }
      }
    },
    [client, viewState, currentPrompt],
  );

  /**
   * Action 3: Retry submission using exact preserved SubmissionIdentity
   */
  const retrySubmission = useCallback(async (): Promise<void> => {
    if (viewState !== 'SUBMIT_FAILED' || !pendingSubmission) {
      return;
    }

    setViewState('SUBMITTING');
    setError(null);

    try {
      // Strictly re-send the exact unchanged SubmissionIdentity
      const result = await client.submitAnswer(pendingSubmission);
      setLastOutcome(result);

      if (result.isSessionCompleted) {
        setViewState('COMPLETED');
        setPendingSubmission(null);
      } else {
        setViewState('FEEDBACK');
        setPendingSubmission(null);
      }
    } catch (err: unknown) {
      const clientError =
        err instanceof RecallClientError
          ? err
          : new RecallClientError(500, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : 'Unknown error');

      setError(clientError);
      if (clientError instanceof NetworkError) {
        setViewState('SUBMIT_FAILED');
      } else {
        setViewState('ERROR');
        setPendingSubmission(null);
      }
    }
  }, [client, viewState, pendingSubmission]);

  /**
   * Action 4: Resync session state after submission failure or doubt
   */
  const syncSessionState = useCallback(async (): Promise<void> => {
    if (!session) return;

    try {
      const state = await client.getSessionState(session.id);
      if (state.status === 'COMPLETED') {
        setViewState('COMPLETED');
        setPendingSubmission(null);
        return;
      }
      if (state.status === 'ABANDONED') {
        setViewState('ABANDONED');
        setPendingSubmission(null);
        return;
      }

      // If active, fetch current prompt to resync cursor
      const prompt = await client.getCurrentPrompt(session.id);
      setCurrentPrompt(prompt);
      setPendingSubmission(null);
      setViewState('ACTIVE');
    } catch (err: unknown) {
      const clientError =
        err instanceof RecallClientError
          ? err
          : new RecallClientError(500, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : 'Unknown error');
      setError(clientError);
      setViewState('ERROR');
    }
  }, [client, session]);

  /**
   * Action 5: Advance to next prompt from FEEDBACK
   */
  const nextPrompt = useCallback(async (): Promise<void> => {
    if (viewState !== 'FEEDBACK' || !session) {
      return;
    }

    setViewState('STARTING');
    setError(null);
    setLastOutcome(null);

    try {
      const prompt = await client.getCurrentPrompt(session.id);
      setCurrentPrompt(prompt);
      setViewState('ACTIVE');
    } catch (err: unknown) {
      if (err instanceof SessionNotActiveError) {
        // Session concluded
        setViewState('COMPLETED');
        return;
      }
      const clientError =
        err instanceof RecallClientError
          ? err
          : new RecallClientError(500, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : 'Unknown error');
      setError(clientError);
      setViewState('ERROR');
    }
  }, [client, viewState, session]);

  /**
   * Action 6: Open abandon confirmation dialog
   */
  const requestAbandon = useCallback((): void => {
    if (viewState === 'ACTIVE' || viewState === 'FEEDBACK') {
      previousStateBeforeAbandon.current = viewState;
      setViewState('ABANDONING');
    }
  }, [viewState]);

  /**
   * Action 7: Cancel abandon dialog
   */
  const cancelAbandon = useCallback((): void => {
    if (viewState === 'ABANDONING') {
      setViewState(previousStateBeforeAbandon.current);
    }
  }, [viewState]);

  /**
   * Action 8: Confirm abandon
   */
  const confirmAbandon = useCallback(async (): Promise<void> => {
    if (viewState !== 'ABANDONING' || !session) {
      return;
    }

    try {
      const result = await client.abandonSession(session.id);
      setAbandonInfo(result);
      setPendingSubmission(null);
      setViewState('ABANDONED');
    } catch (err: unknown) {
      const clientError =
        err instanceof RecallClientError
          ? err
          : new RecallClientError(500, 'UNEXPECTED_ERROR', err instanceof Error ? err.message : 'Unknown error');
      setError(clientError);
      setViewState('ERROR');
    }
  }, [client, viewState, session]);

  /**
   * Action 9: Reset to IDLE
   */
  const reset = useCallback((): void => {
    setViewState('IDLE');
    setSession(null);
    setCurrentPrompt(null);
    setLastOutcome(null);
    setAbandonInfo(null);
    setError(null);
    setPendingSubmission(null);
  }, []);

  return {
    viewState,
    session,
    currentPrompt,
    lastOutcome,
    abandonInfo,
    pendingSubmission,
    error,
    startSession,
    submitAnswer,
    retrySubmission,
    syncSessionState,
    nextPrompt,
    requestAbandon,
    cancelAbandon,
    confirmAbandon,
    reset,
  };
}
