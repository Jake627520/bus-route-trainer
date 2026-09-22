import { NextResponse } from 'next/server';
import { ClientSuppliedDriverIdError, UnauthenticatedError } from './driver-context';

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Standardized HTTP error handler for Recall Session Route Handlers.
 * Maps known Domain/Application errors to standard HTTP status codes and error codes.
 * Uses name-based matching to reliably handle errors instantiated across different use case modules,
 * while maintaining TypeScript type safety and guaranteeing internal SQL/stack details are NEVER leaked.
 */
export function handleApiError(error: unknown): NextResponse<ApiErrorResponse> {
  // 1. Client tried to supply driverId (P0 security invariant)
  if (error instanceof ClientSuppliedDriverIdError) {
    return NextResponse.json(
      { error: { code: 'DISALLOWED_FIELD', message: error.message } },
      { status: 400 },
    );
  }

  // 2. Unauthenticated request in production / missing trusted identity
  if (error instanceof UnauthenticatedError) {
    return NextResponse.json(
      { error: { code: 'UNAUTHENTICATED', message: error.message } },
      { status: 401 },
    );
  }

  if (error && typeof error === 'object' && 'name' in error) {
    const err = error as { name: string; message: string };

    switch (err.name) {
      case 'UnauthenticatedError':
        return NextResponse.json(
          { error: { code: 'UNAUTHENTICATED', message: err.message } },
          { status: 401 },
        );
      // 2. Resource not found
      case 'SessionNotFoundError':
        return NextResponse.json(
          { error: { code: 'SESSION_NOT_FOUND', message: err.message } },
          { status: 404 },
        );

      case 'DriverNotEnrolledError':
        return NextResponse.json(
          { error: { code: 'DRIVER_NOT_ENROLLED', message: err.message } },
          { status: 404 },
        );

      // 3. Ownership / Authorization
      case 'SessionOwnershipError':
        return NextResponse.json(
          { error: { code: 'SESSION_FORBIDDEN', message: err.message } },
          { status: 403 },
        );

      // 4. Conflicts & Inactive state
      case 'IdempotencyConflictError':
        return NextResponse.json(
          { error: { code: 'IDEMPOTENCY_CONFLICT', message: err.message } },
          { status: 409 },
        );

      case 'CannotAbandonCompletedSessionError':
        return NextResponse.json(
          { error: { code: 'CANNOT_ABANDON_COMPLETED_SESSION', message: err.message } },
          { status: 409 },
        );

      case 'SessionNotActiveError':
        return NextResponse.json(
          { error: { code: 'SESSION_NOT_ACTIVE', message: err.message } },
          { status: 409 },
        );

      // 5. Validation / Protocol mismatch
      case 'PromptIndexMismatchError':
        return NextResponse.json(
          { error: { code: 'PROMPT_INDEX_MISMATCH', message: err.message } },
          { status: 400 },
        );
    }
  }

  // 6. Generic bad request (SyntaxError from JSON parser or explicit validation)
  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { error: { code: 'INVALID_REQUEST', message: 'Request body must be valid JSON' } },
      { status: 400 },
    );
  }

  // 7. Unknown / internal error - sanitize message to avoid leaking internals
  console.error('[Recall API] Unhandled internal error:', error);
  return NextResponse.json(
    { error: { code: 'INTERNAL_SERVER_ERROR', message: 'An unexpected internal error occurred' } },
    { status: 500 },
  );
}
