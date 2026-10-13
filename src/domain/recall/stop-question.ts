import { RecallMode } from './recall-session';
import { parseStopName } from '@/domain/gtfs/stop-name';

/**
 * Change 45: 由 cardKey + 站名推導「題型 / 提示 / 答案」。
 *
 * 出題（prompt）與批改（submit）兩條路徑都呼叫這支，確保兩端必然一致——
 * 否則會出現「畫面問 A、後端用 B 的答案批改」的錯誤。
 */
export interface StopQuestion {
  readonly mode: RecallMode;
  /** 顯示給司機的提示。 */
  readonly givenReference: string;
  /** 正確答案。 */
  readonly expectedAnswer: string;
}

/** 路口填空的提示：`Freesia St at ______`。 */
function crossStreetHint(street: string, relation: 'at' | 'near'): string {
  return `${street} ${relation} ______`;
}

const BLANK = '______';
/** 太通用、遮了也沒有辨識度的字。 */
const GENERIC_WORDS = new Set([
  'station', 'platform', 'busway', 'interchange', 'terminal', 'terminus', 'stop', 'bus',
]);

const bareWord = (w: string): string => w.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, '');

/** 只給每個字的首字母（其餘以底線代替），用於沒有可遮關鍵字的站名。 */
function initialsHint(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0] + '_'.repeat(Math.max(0, w.length - 1)))
    .join(' ');
}

/**
 * Change 47: 沒有路口 / 站號的站（車站等）改出單字填空。
 * 提示永遠不含答案：先遮月台號，其次遮最長的非通用字，最後只給首字母。
 */
function buildClozeQuestion(name: string): StopQuestion {
  const platform = parseStopName(name).platform;
  if (platform) {
    return {
      mode: RecallMode.WORD_CLOZE_RECALL,
      givenReference: name.replace(/(platform\s+)[A-Za-z0-9]+\s*$/i, `$1${BLANK}`),
      expectedAnswer: platform,
    };
  }

  const words = name.split(/\s+/).filter(Boolean);
  let pick: string | null = null;
  if (words.length > 1) {
    for (const w of words) {
      const b = bareWord(w);
      if (b.length < 3 || GENERIC_WORDS.has(b.toLowerCase())) continue;
      if (pick === null || b.length > pick.length) pick = b;
    }
  }
  if (pick === null) {
    return {
      mode: RecallMode.WORD_CLOZE_RECALL,
      givenReference: initialsHint(name),
      expectedAnswer: name,
    };
  }
  const answer = pick;
  return {
    mode: RecallMode.WORD_CLOZE_RECALL,
    givenReference: words
      .map((w) => (bareWord(w).toLowerCase() === answer.toLowerCase() ? w.replace(bareWord(w), BLANK) : w))
      .join(' '),
    expectedAnswer: answer,
  };
}

/**
 * @param cardKey   STOP:: / STOP_NUM:: 卡片鍵
 * @param stopName  該站的 GTFS 站名；查不到時傳 null
 * @param stopId    站牌代碼，作為最後的退路
 */
export function buildStopQuestion(
  cardKey: string,
  stopName: string | null,
  stopId: string,
): StopQuestion {
  const name = stopName ?? stopId;
  const parsed = parseStopName(name);

  // 站號卡：給完整站名（去掉站號），答 stop 編號
  if (cardKey.startsWith('STOP_NUM::')) {
    if (parsed.stopNumber) {
      const withoutNumber = parsed.relation && parsed.landmark && parsed.street
        ? `${parsed.street} ${parsed.relation} ${parsed.landmark}`
        : (parsed.street ?? name);
      return {
        mode: RecallMode.STOP_NUMBER_RECALL,
        givenReference: withoutNumber,
        expectedAnswer: parsed.stopNumber,
      };
    }
    // 沒有站號（資料變動）→ 單字填空，避免出無解或洩題的題
    return buildClozeQuestion(name);
  }

  // 一般 STOP 卡：優先出路口填空
  if (parsed.street && parsed.relation && parsed.landmark) {
    return {
      mode: RecallMode.CROSS_STREET_RECALL,
      givenReference: crossStreetHint(parsed.street, parsed.relation),
      expectedAnswer: parsed.landmark,
    };
  }

  // 車站月台等解析不出結構的站 → 單字填空（Change 47，取代洩題的辨識站名）
  return buildClozeQuestion(name);
}
