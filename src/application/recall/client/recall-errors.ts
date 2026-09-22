/**
 * Change 10: Recall Session API Client Typed Errors
 * Maps HTTP error codes and responses into strongly-typed error hierarchy.
 */

export class RecallClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'RecallClientError';
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class UnauthenticatedError extends RecallClientError {
  constructor(message = 'Authentication required to access recall sessions') {
    super(401, 'UNAUTHENTICATED', message);
    this.name = 'UnauthenticatedError';
  }
}

export class SessionForbiddenError extends RecallClientError {
  constructor(message = 'Not authorized to access or modify this recall session') {
    super(403, 'SESSION_FORBIDDEN', message);
    this.name = 'SessionForbiddenError';
  }
}

export class SessionNotFoundError extends RecallClientError {
  constructor(message = 'Recall session not found') {
    super(404, 'SESSION_NOT_FOUND', message);
    this.name = 'SessionNotFoundError';
  }
}

export class DriverNotEnrolledError extends RecallClientError {
  constructor(message = 'Driver is not enrolled in the specified route variant') {
    super(404, 'DRIVER_NOT_ENROLLED', message);
    this.name = 'DriverNotEnrolledError';
  }
}

export class InvalidRequestError extends RecallClientError {
  constructor(message = 'Invalid request parameters') {
    super(400, 'INVALID_REQUEST', message);
    this.name = 'InvalidRequestError';
  }
}

export class PromptIndexMismatchError extends RecallClientError {
  constructor(message = 'Prompt index mismatch with active session prompt') {
    super(400, 'PROMPT_INDEX_MISMATCH', message);
    this.name = 'PromptIndexMismatchError';
  }
}

export class SecurityProtocolError extends RecallClientError {
  constructor(message = 'Disallowed field provided in client payload') {
    super(400, 'DISALLOWED_FIELD', message);
    this.name = 'SecurityProtocolError';
  }
}

export class IdempotencyConflictError extends RecallClientError {
  constructor(message = 'Submission payload conflicts with previously recorded attempt') {
    super(409, 'IDEMPOTENCY_CONFLICT', message);
    this.name = 'IdempotencyConflictError';
  }
}

export class SessionNotActiveError extends RecallClientError {
  constructor(message = 'Session is not active (already completed or abandoned)') {
    super(409, 'SESSION_NOT_ACTIVE', message);
    this.name = 'SessionNotActiveError';
  }
}

export class CannotAbandonCompletedSessionError extends RecallClientError {
  constructor(message = 'Cannot abandon a completed recall session') {
    super(409, 'CANNOT_ABANDON_COMPLETED_SESSION', message);
    this.name = 'CannotAbandonCompletedSessionError';
  }
}

export class ServerError extends RecallClientError {
  constructor(message = 'Internal server error occurred') {
    super(500, 'INTERNAL_SERVER_ERROR', message);
    this.name = 'ServerError';
  }
}

export class NetworkError extends RecallClientError {
  constructor(message = 'Network connection failed or timed out') {
    super(0, 'NETWORK_ERROR', message);
    this.name = 'NetworkError';
  }
}

/**
 * Factory function: converts HTTP status + response error body into strongly typed Error instance
 */
export function mapHttpError(
  status: number,
  errorData?: { code?: string; message?: string },
): RecallClientError {
  const code = errorData?.code;
  const message = errorData?.message;

  if (status === 401) {
    return new UnauthenticatedError(message);
  }

  if (status === 403) {
    return new SessionForbiddenError(message);
  }

  if (status === 404) {
    if (code === 'DRIVER_NOT_ENROLLED') {
      return new DriverNotEnrolledError(message);
    }
    return new SessionNotFoundError(message);
  }

  if (status === 400) {
    if (code === 'PROMPT_INDEX_MISMATCH') {
      return new PromptIndexMismatchError(message);
    }
    if (code === 'DISALLOWED_FIELD') {
      return new SecurityProtocolError(message);
    }
    return new InvalidRequestError(message);
  }

  if (status === 409) {
    if (code === 'IDEMPOTENCY_CONFLICT') {
      return new IdempotencyConflictError(message);
    }
    if (code === 'CANNOT_ABANDON_COMPLETED_SESSION') {
      return new CannotAbandonCompletedSessionError(message);
    }
    return new SessionNotActiveError(message);
  }

  if (status >= 500) {
    return new ServerError(message);
  }

  return new RecallClientError(status, code ?? 'UNKNOWN_ERROR', message ?? `Request failed with status ${status}`);
}
