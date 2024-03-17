import type { Context } from 'telegraf'

export const withUserId = () => {
  return async (context: Context, next: Function) => {
    if (!context.from) return // ignore

    context.state.userId = String(context.from.id)
    return next()
  }
}
