export class ApiError extends Error {
  code: string
  status: number
  context: unknown

  constructor(input: {
    code: string
    status?: number
    message?: string
    context?: unknown
  }) {
    super(input.message ?? '')
    this.name = 'ApiError'
    this.code = input.code
    this.status = input.status ?? 500
    this.context = input.context
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Resource not found', context?: unknown) {
    super({ code: 'NOT_FOUND', status: 404, message , context})
  }
}

export class NotAuthenticatedError extends ApiError {
  constructor(message = 'Not authenticated', context?: unknown) {
    super({ code: 'NOT_AUTHENTICATED', status: 401, message , context})
  }
}

export class NotAuthorizedError extends ApiError {
  constructor(message = 'Access denied', context?: unknown) {
    super({ code: 'NOT_AUTHORIZED', status: 403, message, context })
  }
}

export class AlreadyExistsError extends ApiError {
  constructor(message = 'Resource already exists', context?: unknown) {
    super({ code: 'ALREADY_EXISTS', status: 409, message , context})
  }
}

export class UnsupportedActionError extends ApiError {
  constructor(message = 'Unsupported action', context?: unknown) {
    super({ code: 'UNSUPPORTED_ACTION', status: 400, message , context})
  }
}

export class InvalidResourceError extends ApiError {
  constructor(message = 'Invalid resource', context?: unknown) {
    super({ code: 'INVALID_RESOURCE', status: 400, message , context})
  }
}
