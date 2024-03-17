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
  constructor(message = 'Resource not found') {
    super({ code: 'NOT_FOUND', status: 404, message })
  }
}

export class NotAuthenticatedError extends ApiError {
  constructor(message = 'Not authenticated') {
    super({ code: 'NOT_AUTHENTICATED', status: 401, message })
  }
}

export class NotAuthorizedError extends ApiError {
  constructor(message = 'Access denied') {
    super({ code: 'NOT_AUTHORIZED', status: 403, message })
  }
}

export class AlreadyExistsError extends ApiError {
  constructor(message = 'Resource already exists') {
    super({ code: 'ALREADY_EXISTS', status: 409, message })
  }
}
