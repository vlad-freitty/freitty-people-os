export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
  ) {
    super(message ?? code);
  }
}

export class UnauthorizedError extends AppError {
  constructor() {
    super(401, "unauthorized");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "forbidden") {
    super(403, "forbidden", message);
  }
}

/** Also used when a record exists but is outside the actor's scope — don't leak existence. */
export class NotFoundError extends AppError {
  constructor(entity = "record") {
    super(404, "not_found", `${entity} not found`);
  }
}

export class ValidationError extends AppError {
  constructor(details: unknown, message = "validation_failed") {
    super(422, "validation_failed", message, details);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, "conflict", message);
  }
}
