'use client';

import React, { useState, useEffect, useRef, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseQueue } from '@/app/_lib/practice-queue';
import { parseVariantKey } from '@/domain/route/route-variant';
import { useRecallSession } from '@/application/recall/client/use-recall-session';
import {
  Button,
  Card,
  Badge,
  ProgressBar,
  TextInput,
  Modal,
} from '@/components/ui';
import { useT } from '@/app/_components/locale-provider';

function RecallPracticeInner() {
  const t = useT();
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

  // Change 18: 批次佇列（多路線）。解析失敗 → [] → 退回單 variant 行為。
  const queue = useMemo(() => parseQueue(searchParams.get('queue')), [searchParams]);
  const inBatch = queue.length > 0;
  const [batchIndex, setBatchIndex] = useState(0);

  // Route & session config state for IDLE form（無參數時沿用預設）
  const [routeId, setRouteId] = useState(spRouteId ?? '66');
  const [variantKey, setVariantKey] = useState(spVariantKey ?? '66-1-INBOUND');
  const [sessionSize, setSessionSize] = useState(spSize ?? '10');

  // Change 13/18: 帶 deep-link 或批次佇列時自動開始一次（ref 防重入）
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || viewState !== 'IDLE') return;
    if (queue.length > 0) {
      autoStarted.current = true;
      startSession({ routeId: queue[0].routeId, variantKey: queue[0].variantKey });
    } else if (spRouteId && spVariantKey) {
      autoStarted.current = true;
      const size = spSize ? parseInt(spSize, 10) : NaN;
      startSession({
        routeId: spRouteId,
        variantKey: spVariantKey,
        sessionSize: Number.isNaN(size) || size <= 0 ? undefined : size,
      });
    }
  }, [queue, spRouteId, spVariantKey, spSize, viewState, startSession]);

  // Change 18: 批次中前往下一條路線
  const handleNextInBatch = () => {
    const next = batchIndex + 1;
    if (next >= queue.length) return;
    setBatchIndex(next);
    startSession({ routeId: queue[next].routeId, variantKey: queue[next].variantKey });
  };

  // Change 43: 標題列只顯示「路線 · 方向 · 站數」，
  // 不再把整串 variantKey（真實路線有 60+ 個站牌代碼）攤在畫面上。
  const variantSummary = useMemo(() => {
    const key = session?.targetVariantKey;
    if (!key) return session?.routeId ?? '';
    const parsed = parseVariantKey(key);
    if (!parsed) return `${session?.routeId ?? ''} • ${key}`;
    const direction =
      parsed.directionId === 0
        ? t('common.directionOutbound')
        : parsed.directionId === 1
          ? t('common.directionInbound')
          : t('common.directionOther', { id: parsed.directionId });
    return `${parsed.routeId} • ${direction} • ${t('recall.stopCount', { count: parsed.stopIds.length })}`;
  }, [session?.targetVariantKey, session?.routeId, t]);

  // Change 45: 依題型決定標籤（路口填空 / 站號 / 預測下一站 / 辨識站名）
  const mode = currentPrompt?.recallMode;
  const modeLabel =
    mode === 'NEXT_STOP_FORWARD'
      ? t('recall.modeNextStop')
      : mode === 'CROSS_STREET_RECALL'
        ? t('recall.modeCrossStreet')
        : mode === 'STOP_NUMBER_RECALL'
          ? t('recall.modeStopNumber')
          : t('recall.modeStation');
  const hintLabel =
    mode === 'NEXT_STOP_FORWARD'
      ? t('recall.hintCurrentStop')
      : mode === 'CROSS_STREET_RECALL'
        ? t('recall.hintCrossStreet')
        : mode === 'STOP_NUMBER_RECALL'
          ? t('recall.hintStopNumber')
          : t('recall.hintReference');
  const answerLabel =
    mode === 'NEXT_STOP_FORWARD'
      ? t('recall.labelEnterNextStop')
      : mode === 'CROSS_STREET_RECALL'
        ? t('recall.labelEnterCrossStreet')
        : mode === 'STOP_NUMBER_RECALL'
          ? t('recall.labelEnterStopNumber')
          : t('recall.labelEnterStop');

  // Input state for active question
  const [rawInput, setRawInput] = useState('');
  // Change 44: 答錯時要和正確答案並列顯示，所以留住這次送出的內容。
  const [lastAnswer, setLastAnswer] = useState('');
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
    setLastAnswer(answer);
    submitAnswer(answer);
  };

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-2xl">
        {/* Top Header */}
        <header className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              {t('recall.title')}
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t('recall.subtitle')}
            </p>
            {inBatch && (
              <p className="mt-1 text-xs font-semibold text-sky-600 dark:text-sky-400">
                {t('recall.batchProgress', { current: batchIndex + 1, total: queue.length })}
              </p>
            )}
          </div>

          {(viewState === 'ACTIVE' || viewState === 'FEEDBACK' || viewState === 'SUBMITTING') && (
            <Button
              variant="outline"
              size="sm"
              onClick={requestAbandon}
              aria-label={t('recall.abandonAria')}
            >
              {t('recall.abandon')}
            </Button>
          )}
        </header>

        {/* 1. IDLE State: Start Practice Form */}
        {viewState === 'IDLE' && (
          <Card>
            <h2 className="text-lg font-semibold mb-4 text-zinc-800 dark:text-zinc-200">
              {t('recall.startTitle')}
            </h2>
            <form onSubmit={handleStart} className="space-y-4">
              <TextInput
                label={t('recall.labelRouteId')}
                value={routeId}
                onChange={(e) => setRouteId(e.target.value)}
                placeholder={t('recall.placeholderRouteId')}
                required
              />
              <TextInput
                label={t('recall.labelVariantKey')}
                value={variantKey}
                onChange={(e) => setVariantKey(e.target.value)}
                placeholder={t('recall.placeholderVariantKey')}
                required
              />
              <TextInput
                label={t('recall.labelSessionSize')}
                type="number"
                min="1"
                max="50"
                value={sessionSize}
                onChange={(e) => setSessionSize(e.target.value)}
              />
              <Button type="submit" size="lg" className="w-full mt-2">
                {t('recall.startButton')}
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
                {t('recall.loadingPrompt')}
              </p>
            </div>
          </Card>
        )}

        {/* 3. NO_CARDS_AVAILABLE State */}
        {viewState === 'NO_CARDS_AVAILABLE' && (
          <Card className="text-center py-8">
            <div className="max-w-md mx-auto space-y-3">
              <span className="text-4xl" role="img" aria-label={t('recall.ariaCelebration')}>🎉</span>
              <h2 className="text-xl font-bold">{t('recall.caughtUpTitle')}</h2>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {t('recall.caughtUpBody')}
              </p>
              <Button onClick={reset} size="md" className="mt-4">
                {t('recall.chooseAnother')}
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
              label={t('recall.questionProgress', { current: currentPrompt.promptIndex + 1, total: currentPrompt.totalCards })}
            />

            <div className="flex items-center justify-between">
              <Badge variant={currentPrompt.recallMode === 'NEXT_STOP_FORWARD' ? 'blue' : 'purple'}>
                {modeLabel}
              </Badge>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                {variantSummary}
              </span>
            </div>

            <div className="bg-zinc-100 dark:bg-zinc-800/60 p-5 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
                {hintLabel}
              </p>
              <p className="text-xl font-bold text-zinc-900 dark:text-zinc-50">
                {currentPrompt.givenReference}
              </p>
            </div>

            <form onSubmit={handleSubmitAnswer} className="space-y-4">
              <TextInput
                ref={inputRef}
                label={answerLabel}
                placeholder={t('recall.placeholderAnswer')}
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
                {t('recall.submitAnswer')}
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
                  {t('recall.submitInterrupted')}
                </h3>
                <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
                  {t('recall.submitInterruptedBody', { input: pendingSubmission.rawInput })}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button onClick={retrySubmission} size="md" className="flex-1">
                {t('recall.retrySubmission')}
              </Button>
              <Button onClick={syncSessionState} variant="outline" size="md" className="flex-1">
                {t('recall.verifyServerState')}
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
                  {lastOutcome.outcome === 'PASS' ? t('recall.correctTitle') : t('recall.incorrectTitle')}
                </h3>
                <p className="text-sm opacity-90">
                  {t('recall.cardStateLabel')} <strong className="font-semibold">{lastOutcome.resultingState}</strong> • {t('recall.srsLevelLabel')} <strong className="font-semibold">{lastOutcome.resultingSrsLevel}</strong>
                  {lastOutcome.isDuplicate && t('recall.duplicateReplay')}
                </p>
              </div>
            </div>

            {lastOutcome.outcome === 'FAIL' && lastOutcome.correctAnswer ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/60">
                {lastAnswer ? (
                  <p className="text-sm text-zinc-500 line-through dark:text-zinc-400">
                    {t('recall.yourAnswerLabel')}: {lastAnswer}
                  </p>
                ) : null}
                <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {t('recall.correctAnswerLabel')}
                </p>
                <p className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                  {lastOutcome.correctAnswer}
                </p>
              </div>
            ) : null}

            <Button onClick={nextPrompt} size="lg" className="w-full">
              {t('recall.nextQuestion')}
            </Button>
          </Card>
        )}

        {/* 8. COMPLETED State */}
        {viewState === 'COMPLETED' && (
          <Card className="text-center py-10 space-y-4">
            <span className="text-5xl" role="img" aria-label={t('recall.ariaTrophy')}>🏆</span>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {t('recall.completedTitle')}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 max-w-sm mx-auto">
              {t('recall.completedBody')}
            </p>
            {inBatch && batchIndex >= queue.length - 1 && (
              <p className="text-base font-semibold text-emerald-600 dark:text-emerald-400">
                {t('recall.allDone')}
              </p>
            )}
            <div className="pt-4 flex justify-center gap-3">
              {inBatch && batchIndex < queue.length - 1 ? (
                <Button onClick={handleNextInBatch} size="lg">
                  {t('recall.nextRoute', { current: batchIndex + 2, total: queue.length })}
                </Button>
              ) : (
                <Button onClick={reset} size="lg">
                  {t('recall.practiceAgain')}
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* 10. ABANDONED State */}
        {viewState === 'ABANDONED' && (
          <Card className="text-center py-8 space-y-4">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              {t('recall.abandonedTitle')}
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {t('recall.abandonedBody', { card: abandonInfo ? abandonInfo.currentPromptIndex + 1 : 0 })}
            </p>
            <Button onClick={reset} size="md">
              {t('recall.returnToStart')}
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
              {t('recall.backToStart')}
            </Button>
          </Card>
        )}

        {/* 9. ABANDONING Modal */}
        <Modal
          isOpen={viewState === 'ABANDONING'}
          onClose={cancelAbandon}
          title={t('recall.modalTitle')}
        >
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-6">
            {t('recall.modalBody')}
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" size="md" onClick={cancelAbandon}>
              {t('recall.continuePractice')}
            </Button>
            <Button variant="destructive" size="md" onClick={confirmAbandon}>
              {t('recall.confirmAbandon')}
            </Button>
          </div>
        </Modal>
      </div>
    </main>
  );
}

// useSearchParams 需包在 Suspense 內（Next 16 App Router）。
function RecallLoadingFallback() {
  const t = useT();
  return <div className="p-8 text-center text-zinc-500">{t('common.loading')}</div>;
}

export default function RecallPracticePage() {
  return (
    <Suspense fallback={<RecallLoadingFallback />}>
      <RecallPracticeInner />
    </Suspense>
  );
}
