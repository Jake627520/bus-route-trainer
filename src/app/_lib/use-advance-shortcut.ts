'use client';

import { useEffect, useRef } from 'react';

const INTERACTIVE = 'button, a[href], input, select, textarea, summary, [role="button"], [contenteditable="true"]';

/**
 * Change 48: 「回饋」畫面按 Enter / Space 進下一題的快捷鍵。
 * 只有焦點在頁面本體（沒有停在任何可操作元素）時才生效，
 * 否則會搶走「放棄」等按鈕自己的 Enter / Space 行為；組合鍵一律忽略。
 */
export function useAdvanceShortcut(enabled: boolean, onAdvance: () => void): void {
  const onAdvanceRef = useRef(onAdvance);
  useEffect(() => {
    onAdvanceRef.current = onAdvance;
  });

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target && target !== document.body && target.closest(INTERACTIVE)) return;
      e.preventDefault();
      onAdvanceRef.current();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
