import * as http from 'http'
import { ParsedQs } from 'qs'
import { User } from './users/types'

declare module 'express-serve-static-core' {
  export interface Request<
    P = ParamsDictionary,
    ResBody = any,
    ReqBody = any,
    ReqQuery = ParsedQs,
    LocalsObj extends Record<string, any> = Record<string, any>,
  > extends http.IncomingMessage, Express.Request {
    user: User
  }
}
