'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRecallSession } from '@/application/recall/client/use-recall-session';
import {
  Button,
  Card,
  Badge,
  ProgressBar,
  TextInput,
  Modal,
} from '@/components/ui';

function RecallPracticeInner() {
  const {
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
  } = useRecallSession();

  // Change 13: deep-link 參數（?routeId=..&variantKey=..&size=..）
  const searchParams = useSearchParams();
  const spRouteId = searchParams.get('routeId');
  const spVariantKey = searchParams.get('variantKey');
  const spSize = searchParams.get('size');

  // Route & session config state for IDLE form（無參數時沿用預設）
  const [routeId, setRouteId] = useState(spRouteId ?? '66');
  const [variantKey, setVariantKey] = useState(spVariantKey ?? '66-1-INBOUND');
  const [sessionSize, setSessionSize] = useState(spSize ?? '10');

  // Change 13: 帶 deep-link 參數時自動開始一次 session（ref 防重入）
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    if (spRouteId && spVariantKey && viewState === 'IDLE') {
      autoStarted.current = true;
      const size = spSize ? parseInt(spSize, 10) : NaN;
      startSession({
        routeId: spRouteId,
        variantKey: spVariantKey,
        sessionSize: Number.isNaN(size) || size <= 0 ? undefined : size,
      });
    }
  }, [spRouteId, spVariantKey, spSize, viewState, startSession]);

  // Input state for active question
  const [rawInput, setRawInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus input when a new prompt arrives in ACTIVE state
  useEffect(() => {
    if (viewState === 'ACTIVE') {
      inputRef.current?.focus();
    }
  }, [viewState, currentPrompt?.promptIndex]);

  // Keyboard shortcut listener: Enter/Space in FEEDBACK advances to next prompt
  useEffect(() => {
    if (viewState !== 'FEEDBACK') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        nextPrompt();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewState, nextPrompt]);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeId.trim() || !variantKey.trim()) return;

    const size = parseInt(sessionSize, 10);
    startSession({
      routeId: routeId.trim(),
      variantKey: variantKey.trim(),
      sessionSize: Number.isNaN(size) || size <= 0 ? undefined : size,
    });
  };

  const handleSubmitAnswer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawInput.trim() || viewState !== 'ACTIVE') return;
    const answer = rawInput.trim();
    setRawInput('');
    submitAnswer(answer);
  };

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl">
        {/* Top Header */}
        <header className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Bus Route Recall Trainer
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Queensland Transit Depot Practice Mode
            </p>
          </div>

          {(viewState === 'ACTIVE' || viewState === 'FEEDBACK' || viewState === 'SUBMITTING') && (
            <Button
              variant="outline"
              size="sm"
              onClick={requestAbandon}
              aria-label="Abandon Practice Session"
            >
              Abandon
            </Button>
          )}
        </header>

        {/* 1. IDLE State: Start Practice Form */}
        {viewState === 'IDLE' && (
          <Card>
            <h2 className="text-lg font-semibold mb-4 text-zinc-800 dark:text-zinc-200">
              Start Route Practice Session
            </h2>
            <form onSubmit={handleStart} className="space-y-4">
              <TextInput
                label="Route Number / ID"
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                placeholder="e.g. 66"
                required
              />
              <TextInput
                label="Route Variant Key"
                value={variantKey}
                onChange={(e) => setVariantKey(e.target.value)}
                placeholder="e.g. 66-1-INBOUND"
                required
              />
              <TextInput
                label="Session Size (Cards to Practice)"
                type="number"
                min="1"
                max="50"
                value={sessionSize}
                onChange={(e) => setSessionSize(e.target.value)}
              />
              <Button type="submit" size="lg" className="w-full mt-2">
                Start Practice Session
              </Button>
            </form>
          </Card>
        )}

        {/* 2. STARTING State: Skeleton Loader */}
        {viewState === 'STARTING' && (
          <Card className="text-center py-12">
            <div className="flex flex-col items-center justify-center space-y-4">
              <svg
                className="animate-spin h-8 w-8 text-sky-600 dark:text-sky-400"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
                Loading practice prompt from server...
              </p>
            </div>
          </Card>
        )}

        {/* 3. NO_CARDS_AVAILABLE State */}
        {viewState === 'NO_CARDS_AVAILABLE' && (
          <Card className="text-center py-8">
            <div className="max-w-md mx-auto space-y-3">
              <span className="text-4xl" role="img" aria-label="Celebration">🎉</span>
              <h2 className="text-xl font-bold">All Caught Up!</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                There are currently no cards due for review on this route variant. Great work!
              </p>
              <Button onClick={reset} size="md" className="mt-4">
                Choose Another Route
              </Button>
            </div>
          </Card>
        )}

        {/* 4. ACTIVE & 5. SUBMITTING States */}
        {(viewState === 'ACTIVE' || viewState === 'SUBMITTING') && currentPrompt && (
          <Card className="space-y-6">
            <ProgressBar
              current={currentPrompt.promptIndex + 1}
              total={currentPrompt.totalCards}
              label={`Question ${currentPrompt.promptIndex + 1} of ${currentPrompt.totalCards}`}
            />

            <div className="flex items-center justify-between">
              <Badge variant={currentPrompt.recallMode === 'NEXT_STOP_FORWARD' ? 'blue' : 'purple'}>
                {currentPrompt.recallMode === 'NEXT_STOP_FORWARD' ? 'Next Stop Prediction' : 'Station Identification'}
              </Badge>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {session?.routeId} • {session?.targetVariantKey}
              </span>
            </div>

            <div className="bg-zinc-100 dark:bg-zinc-800/60 p-5 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                {currentPrompt.recallMode === 'NEXT_STOP_FORWARD' ? 'Current Station Stop' : 'Reference Hint'}
              </p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {currentPrompt.givenReference}
              </p>
            </div>

            <form onSubmit={handleSubmitAnswer} className="space-y-4">
              <TextInput
                ref={inputRef}
                label={currentPrompt.recallMode === 'NEXT_STOP_FORWARD' ? 'Enter Next Stop Name' : 'Enter Stop Name'}
                placeholder="Type your answer here..."
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                disabled={viewState === 'SUBMITTING'}
                autoComplete="off"
                required
              />

              <Button
                type="submit"
                size="lg"
                loading={viewState === 'SUBMITTING'}
                disabled={!rawInput.trim() || viewState === 'SUBMITTING'}
                className="w-full"
              >
                Submit Answer (Enter)
              </Button>
            </form>
          </Card>
        )}

        {/* 6. SUBMIT_FAILED State: Manual Retry UX */}
        {viewState === 'SUBMIT_FAILED' && pendingSubmission && (
          <Card className="space-y-4 border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
            <div className="flex items-start space-x-3">
              <span className="text-2xl text-amber-600 dark:text-amber-400">⚠️</span>
              <div>
                <h3 className="text-base font-bold text-amber-900 dark:text-amber-200">
                  Submission Interrupted
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
                  Network connection dropped while submitting your answer for &quot;{pendingSubmission.rawInput}&quot;.
                  Your submission identity is preserved to prevent duplicate evaluation conflicts.
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button onClick={retrySubmission} size="md" className="flex-1">
                Retry Submission
              </Button>
              <Button onClick={syncSessionState} variant="outline" size="md" className="flex-1">
                Verify Server State
              </Button>
            </div>
          </Card>
        )}

        {/* 7. FEEDBACK State */}
        {viewState === 'FEEDBACK' && lastOutcome && (
          <Card className="space-y-6">
            <div
              aria-live="polite"
              className={`p-5 rounded-xl border flex items-center space-x-4 ${
                lastOutcome.outcome === 'PASS'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-900 dark:text-red-100'
              }`}
            >
              <span className="text-3xl">
                {lastOutcome.outcome === 'PASS' ? '✅' : '❌'}
              </span>
              <div>
                <h3 className="text-lg font-bold">
                  {lastOutcome.outcome === 'PASS' ? 'Correct Recall!' : 'Incorrect Recall'}
                </h3>
                <p className="text-sm opacity-90">
                  Card State: <strong className="font-semibold">{lastOutcome.resultingState}</strong> • SRS Level: <strong className="font-semibold">{lastOutcome.resultingSrsLevel}</strong>
                  {lastOutcome.isDuplicate && ' (Duplicate replay)'}
                </p>
              </div>
            </div>

            <Button onClick={nextPrompt} size="lg" className="w-full">
              Next Question (Enter / Space)
            </Button>
          </Card>
        )}

        {/* 8. COMPLETED State */}
        {viewState === 'COMPLETED' && (
          <Card className="text-center py-10 space-y-4">
            <span className="text-5xl" role="img" aria-label="Trophy">🏆</span>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              Practice Session Completed!
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto">
              You have completed all planned cards for this recall session. Your SRS memory intervals have been authoritatively updated on the server.
            </p>
            <div className="pt-4 flex justify-center gap-3">
              <Button onClick={reset} size="lg">
                Practice Again
              </Button>
            </div>
          </Card>
        )}

        {/* 10. ABANDONED State */}
        {viewState === 'ABANDONED' && (
          <Card className="text-center py-8 space-y-4">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Session Abandoned
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Session was abandoned at card {abandonInfo ? abandonInfo.currentPromptIndex + 1 : 0}. Remaining cards remain in your regular review queue.
            </p>
            <Button onClick={reset} size="md">
              Return to Start
            </Button>
          </Card>
        )}

        {/* 11. ERROR State */}
        {viewState === 'ERROR' && error && (
          <Card className="border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/20 space-y-4">
            <div className="flex items-start space-x-3">
              <span className="text-2xl text-red-600">🚫</span>
              <div>
                <h3 className="text-base font-bold text-red-900 dark:text-red-200">
                  {error.code}
                </h3>
                <p className="text-sm text-red-800 dark:text-red-300 mt-1">
                  {error.message}
                </p>
              </div>
            </div>
            <Button onClick={reset} size="md" variant="outline">
              Back to Start
            </Button>
          </Card>
        )}

        {/* 9. ABANDONING Modal */}
        <Modal
          isOpen={viewState === 'ABANDONING'}
          onClose={cancelAbandon}
          title="Abandon Recall Session?"
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
            Are you sure you want to abandon this session? Unanswered cards will remain scheduled for future review and will not count as evaluated attempts.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={cancelAbandon}>
              Continue Practice
            </Button>
            <Button variant="destructive" size="md" onClick={confirmAbandon}>
              Confirm Abandon
            </Button>
          </div>
        </Modal>
      </div>
    </main>
  );
}

// useSearchParams 需包在 Suspense 內（Next 16 App Router）。
export default function RecallPracticePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-zinc-500">載入中…</div>}>
      <RecallPracticeInner />
    </Suspense>
  );
}
