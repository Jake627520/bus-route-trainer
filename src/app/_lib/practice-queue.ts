/**
 * Change 18: 批次練習佇列的 URL 編碼。
 * variantKey 可能含冒號（如 `route-1:dir-0:hash-abc`），故用 JSON 而非分隔字元。
 */
export interface QueueItem {
  routeId: string;
  variantKey: string;
}

export function encodeQueue(items: QueueItem[]): string {
  const minimal = items.map((i) => ({ routeId: i.routeId, variantKey: i.variantKey }));
  return encodeURIComponent(JSON.stringify(minimal));
}

/** 解析 queue 參數；null/空/壞字串/非陣列一律回 []（降級為無佇列）。 */
export function parseQueue(raw: string | null | undefined): QueueItem[] {
  if (!raw) return [];
  try {
    const decoded: unknown = JSON.parse(decodeURIComponent(raw));
    if (!Array.isArray(decoded)) return [];
    return decoded
      .filter(
        (x): x is QueueItem =>
          !!x &&
          typeof x === 'object' &&
          typeof (x as QueueItem).routeId === 'string' &&
          typeof (x as QueueItem).variantKey === 'string'
      )
      .map((x) => ({ routeId: x.routeId, variantKey: x.variantKey }));
  } catch {
    return [];
  }
}
