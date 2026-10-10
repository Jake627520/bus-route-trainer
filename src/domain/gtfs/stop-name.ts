/**
 * Change 45: Translink 站名解析（純 domain，零相依）。
 *
 * 真實 SEQ GTFS feed 的站名主流格式為：
 *   `<街道> at|near <橫向街道/地標>[, stop N]`
 * 全 feed 13,120 站中約 90% 含 at/near、約 33% 含 stop 編號。
 *
 * 解析出來的各部位用於出題：
 * - 路口填空：給 `<街道> at ___`，答 `<地標>`
 * - 站號題　：給站名，答 `stop N`
 *
 * 解析不出來的站（車站、總站等）由呼叫端退回其他題型。
 */
export interface ParsedStopName {
  readonly raw: string;
  /** at/near 之前的部分；無 at/near 時為去掉站號後的整串。 */
  readonly street: string | null;
  readonly relation: 'at' | 'near' | null;
  /** at/near 之後的橫向街道或地標。 */
  readonly landmark: string | null;
  /** 站號，可能含斜線（如 `59/56`）或為字母（如 `E`）。platform 不算。 */
  readonly stopNumber: string | null;
}

const EMPTY: ParsedStopName = {
  raw: '',
  street: null,
  relation: null,
  landmark: null,
  stopNumber: null,
};

/** 結尾的 `, stop 78` / ` stop 59/56`（逗號選填）。 */
const TRAILING_STOP = /[,]?\s+stop\s+([A-Za-z0-9]+(?:\/[A-Za-z0-9]+)*)\s*$/i;
/** 位於 at/near 之前的 `Stop 11`。 */
const INLINE_STOP = /\s+stop\s+([A-Za-z0-9]+(?:\/[A-Za-z0-9]+)*)(?=\s+(?:at|near)\s+)/i;
/** 第一個 at/near 作為切點。 */
const RELATION = /^(.*?)\s+(at|near)\s+(.+)$/i;

export function parseStopName(name: string): ParsedStopName {
  if (typeof name !== 'string') return EMPTY;
  const raw = name.trim();
  if (raw === '') return { ...EMPTY, raw: '' };

  let rest = raw;
  let stopNumber: string | null = null;

  // 1. 先抽站號（結尾優先，其次 at/near 之前的中段）
  const trailing = rest.match(TRAILING_STOP);
  if (trailing) {
    stopNumber = trailing[1];
    rest = rest.slice(0, trailing.index).trim();
  } else {
    const inline = rest.match(INLINE_STOP);
    if (inline && inline.index !== undefined) {
      stopNumber = inline[1];
      const start = inline.index;
      rest = (rest.slice(0, start) + rest.slice(start + inline[0].length)).trim();
    }
  }

  // 2. 以第一個 at/near 切出街道與地標
  const rel = rest.match(RELATION);
  if (!rel) {
    return {
      raw,
      street: rest === '' ? null : rest,
      relation: null,
      landmark: null,
      stopNumber,
    };
  }

  return {
    raw,
    street: rel[1].trim() || null,
    relation: rel[2].toLowerCase() as 'at' | 'near',
    landmark: rel[3].trim() || null,
    stopNumber,
  };
}
