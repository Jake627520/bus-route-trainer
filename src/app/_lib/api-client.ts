/**
 * Change 07: 前端薄 fetch 封裝。
 * 統一解析後端 `{ data }` 成功信封與 `{ error: { code, message } }` 失敗信封。
 * 前端不直接 import Prisma / use-case，一律走這裡串現有 HTTP API。
 * Zero-auth 階段：client 不送 driverId（server 用 DEFAULT_DRIVER_ID 補上）。
 */

export type ProgressStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'MASTERED';

export interface RouteSummary {
  id: string;
  shortName: string;
  longName: string;
  routeType: number;
}

export interface RouteVariantStop {
  stopSequence: number;
  stopId: string;
  stopName: string;
  isTimepoint: boolean;
}

export interface RouteVariant {
  variantKey: string;
  routeId: string;
  directionId: number;
  headsign: string | null;
  stopCount: number;
  sampleTripId: string;
  tripCount: number;
  orderedStops: RouteVariantStop[];
}

export interface VariantProgress {
  id: string;
  driverId: string;
  routeId: string;
  directionId: number;
  targetVariantKey: string;
  status: ProgressStatus;
  enrolledAt: string;
  lastStudiedAt: string | null;
  totalCards: number;
}

export interface VariantReviewSummary {
  routeId: string;
  variantKey: string;
  directionId: number;
  status: ProgressStatus;
  dueCount: number;
  newCount: number;
  masteredCount: number;
  totalCards: number;
  nextReviewAt: string | null;
}

interface SuccessEnvelope<T> {
  data: T;
}
interface ErrorEnvelope {
  error: { code: string; message: string };
}

/** 前端統一錯誤型別：帶後端 error code 與 HTTP status（network 失敗為 status 0）。 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientOptions {
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchFn?: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? '';
    // 不在建構時綁死 globalThis.fetch，改在呼叫時 late-bind，
    // 才不會被稍後才替換 global fetch 的測試（vi.stubGlobal）錯過。
    this.fetchFn = options.fetchFn;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const doFetch = this.fetchFn ?? globalThis.fetch;
    let response: Response;
    try {
      response = await doFetch(`${this.baseUrl}${path}`, init);
    } catch {
      throw new ApiError('NETWORK_ERROR', 'Network request failed', 0);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ApiError('INVALID_RESPONSE', 'Response was not valid JSON', response.status);
    }

    if (!response.ok) {
      const err = (body as Partial<ErrorEnvelope>)?.error;
      throw new ApiError(
        err?.code ?? 'UNKNOWN_ERROR',
        err?.message ?? 'Request failed',
        response.status
      );
    }

    return (body as SuccessEnvelope<T>).data;
  }

  getRoutes(): Promise<RouteSummary[]> {
    return this.request<RouteSummary[]>('/api/routes');
  }

  getRouteVariants(routeId: string): Promise<RouteVariant[]> {
    return this.request<RouteVariant[]>(`/api/routes/${encodeURIComponent(routeId)}/variants`);
  }

  enroll(input: { routeId: string; variantKey: string }): Promise<VariantProgress> {
    return this.request<VariantProgress>('/api/progress/enroll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  }

  getVariantProgress(variantKey: string): Promise<VariantProgress> {
    return this.request<VariantProgress>(`/api/progress/${encodeURIComponent(variantKey)}`);
  }

  getReviewSummary(): Promise<VariantReviewSummary[]> {
    return this.request<VariantReviewSummary[]>('/api/review/summary');
  }
}

/** 預設實例：同源（baseUrl=''），瀏覽器 fetch。 */
export const apiClient = new ApiClient();
