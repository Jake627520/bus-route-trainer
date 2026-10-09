import { RecallMode, RecallOutcome } from './recall-session';

/**
 * Normalizes stop name using Unicode NFKC -> trim -> lowercase -> collapse whitespace.
 */
export function normalizeStopName(input: string): string {
  return input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Change 43: 常見站名用字統一為較短的正規形式。
 * 兩邊（使用者輸入與正確答案）套用同一張表，因此寫全名或縮寫都算對。
 */
const STOP_NAME_SYNONYMS: Readonly<Record<string, string>> = {
  street: 'st',
  saint: 'st',
  road: 'rd',
  avenue: 'ave',
  av: 'ave',
  drive: 'dr',
  highway: 'hwy',
  parade: 'pde',
  court: 'ct',
  lane: 'ln',
  place: 'pl',
  terrace: 'tce',
  crescent: 'cres',
  boulevard: 'bvd',
  blvd: 'bvd',
  square: 'sq',
  station: 'stn',
  centre: 'ctr',
  center: 'ctr',
  mount: 'mt',
  interchange: 'int',
};

/** 結尾的月台／站位後綴，例如 `, stop 25`、` stop B`。 */
const TRAILING_STOP_SUFFIX = /[,\-–—]?\s*\bstop\s+[a-z0-9]+\s*$/;

/**
 * Change 43: 寬鬆正規化 —— 在 NFKC/大小寫/空白之外，
 * 另外忽略標點符號、結尾月台後綴與常見縮寫差異。
 *
 * 注意：這**不是**模糊比對，不給部分分數。少字或錯字仍然算錯。
 */
export function normalizeStopNameLenient(input: string): string {
  if (typeof input !== 'string') return '';
  let value = input.normalize('NFKC').toLowerCase();
  // 只有在去掉後仍留有內容時才套用；否則像「Stop 100」這種
  // 本身就以 stop + 數字命名的站名會被整串吃掉。
  const withoutSuffix = value.replace(TRAILING_STOP_SUFFIX, ' ').trim();
  if (withoutSuffix !== '') value = withoutSuffix;
  // 標點一律轉為空白（撇號直接移除，讓 queen's → queens）
  value = value.replace(/['’`]/g, '');
  value = value.replace(/[.,"()[\]/\\&\-–—_:;!?]+/g, ' ');
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => STOP_NAME_SYNONYMS[word] ?? word)
    .join(' ');
}

export class DeterministicRecallEvaluator {
  /**
   * Deterministically evaluates the driver's raw input against the expected answer.
   * Strictly returns PASS or FAIL (binary evaluation, no partial credit).
   */
  evaluate(
    mode: RecallMode,
    rawInput: string,
    expectedAnswer: string,
  ): RecallOutcome {
    if (!rawInput || rawInput.trim() === '') {
      return RecallOutcome.FAIL;
    }

    // Change 43: 兩種題型都比對「站名」，並套用寬鬆正規化
    // （原本 NEXT_STOP_FORWARD 比對原始 stop ID 且區分大小寫，實際上無法作答）。
    if (
      mode === RecallMode.NEXT_STOP_FORWARD ||
      mode === RecallMode.STOP_NAME_RECOGNITION
    ) {
      const normalizedInput = normalizeStopNameLenient(rawInput);
      const normalizedExpected = normalizeStopNameLenient(expectedAnswer);
      if (normalizedInput === '' || normalizedExpected === '') return RecallOutcome.FAIL;
      return normalizedInput === normalizedExpected
        ? RecallOutcome.PASS
        : RecallOutcome.FAIL;
    }

    return RecallOutcome.FAIL;
  }
}
