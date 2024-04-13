import cors from 'cors'
import jwt from 'jsonwebtoken'
import express, { type NextFunction, type Request, type Response } from 'express'
import Router from 'express-promise-router'
import helmet from 'helmet'
import { z, ZodError } from 'zod'
import { logger } from '../logging/logger.js'
import { env } from '../env.js'
import { createIntegrationsRouter } from './routes/integrations.js'
import { createLinksRouter } from './routes/links.js'
import { authenticateWebAppSchema, initDataUserSchema } from '../web-app/schemas.js'
import { registry } from '../registry.js'
import { ApiError, NotFoundError, NotAuthenticatedError } from '../errors.js'
import { createBucketsRouter } from './routes/buckets.js'
import { checkWebAppSignature } from '../web-app/check-web-app-signature.js'

const authTokenSchema = z.object({
  user: z.object({
    id: z.number(),
    name: z.string(),
    locale: z.string(),
  })
})

export async function startApiServer() {
  const { storage } = registry.export()

  const app = express()
  app.use(helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin',
    }
  }))
  app.use(cors({
    origin: (origin, callback) => {
      if (!origin || env.CORS_ORIGIN.includes(origin)) {
        callback(null, origin)
      } else {
        callback(new ApiError({ code: 'INVALID_CORS_ORIGIN', status: 403 }))
      }
    }
  }))
  app.use(express.json())

  const router = Router()

  router.post('/authenticate-web-app', async (req, res) => {
    const { initData } = authenticateWebAppSchema.parse(req.body)

    if (!checkWebAppSignature(initData)) {
      throw new ApiError({
        code: 'INVALID_SIGNATURE',
        status: 400,
      })
    }

    const initDataUser = new URLSearchParams(initData).get('user')
    const telegramUser = initDataUser ? initDataUserSchema.parse(JSON.parse(initDataUser)) : undefined
    if (!telegramUser) {
      throw new ApiError({
        code: 'INVALID_INIT_DATA',
        status: 400,
      })
    }

    const user = await storage.getUserByLoginMethod('telegram', String(telegramUser.id))
    if (!user) {
      throw new NotFoundError()
    }

    res.json(jwt.sign({
      user,
    }, env.TOKEN_SECRET))
  })

  router.use(createAuthMiddleware({ tokenSecret: env.TOKEN_SECRET }))

  app.use(router)
  app.use(createIntegrationsRouter())
  app.use(createBucketsRouter())
  app.use(createLinksRouter())

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (!(err instanceof ApiError) && !(err instanceof ZodError)) {
      logger.error({
        err,
        req: {
          url: req.url,
          ...req.headers && Object.keys(req.headers).length > 0 ? {
              headers: {
              ...req.headers,
              ...typeof req.headers.authorization === 'string'
                ? { authorization: req.headers.authorization.slice(0, 10) + '...' }
                : undefined,
            }
          } : undefined,
          ...req.params && Object.keys(req.params).length > 0 ? { params: req.params } : undefined,
          ...req.query && Object.keys(req.query).length > 0 ? { query: req.query } : undefined,
          ...req.body && Object.keys(req.body).length > 0 ? { body: req.body } : undefined,
        }
      }, 'Unhandled API error')
    }

    if (res.headersSent) return
    if (err instanceof ApiError) {
      res.status(err.status).json({
        error: {
          code: err.code,
          ...err.message ? { message: err.message } : undefined,
          ...err.context ? { context: err.context } : undefined,
        }
      })
    } else if (err instanceof ZodError) {
      res.status(422).json({
        error: {
          code: 'VALIDATION_ERROR',
          context: err.errors,
        }
      })
    } else {
      res.sendStatus(500)
    }
  })

  logger.info({}, 'Starting server')
  await new Promise(resolve => app.listen(env.PORT, () => resolve(undefined)))
}

function createAuthMiddleware(input: { tokenSecret: string }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = req.headers['authorization']?.slice(7) // 'Bearer ' length
    if (!token) {
      throw new NotAuthenticatedError('Authentication token not provided')
    }

    try {
      req.user = authTokenSchema.parse(jwt.verify(token, input.tokenSecret)).user
    } catch (err) {
      logger.warn({ err }, 'Invalid authentication token')
      throw new NotAuthenticatedError('Invalid authentication token')
    }

    next()
  }
}
