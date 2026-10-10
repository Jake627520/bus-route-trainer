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
    // 沒有站號（資料變動）→ 退回辨識站名，避免出無解的題
    return {
      mode: RecallMode.STOP_NAME_RECOGNITION,
      givenReference: name,
      expectedAnswer: name,
    };
  }

  // 一般 STOP 卡：優先出路口填空
  if (parsed.street && parsed.relation && parsed.landmark) {
    return {
      mode: RecallMode.CROSS_STREET_RECALL,
      givenReference: crossStreetHint(parsed.street, parsed.relation),
      expectedAnswer: parsed.landmark,
    };
  }

  // 車站月台等解析不出結構的站 → 維持原本的辨識站名
  return {
    mode: RecallMode.STOP_NAME_RECOGNITION,
    givenReference: name,
    expectedAnswer: name,
  };
}
