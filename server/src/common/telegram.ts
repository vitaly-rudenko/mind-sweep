import type { Context } from 'telegraf'
import { registry } from '../registry.js'
import { markdownEscapes } from 'markdown-escapes'

const ESCAPE_REGEX = new RegExp(`(?<!\\\\)([\\${markdownEscapes.join('\\')}])`, 'g')

const GROUP_CHAT_TYPES = ['group', 'supergroup']

export function isGroupChat(context: Context) {
  return (
    context.chat !== undefined &&
    GROUP_CHAT_TYPES.includes(context.chat.type)
  )
}

export function isPrivateChat(context: Context) {
  return (
    context.chat !== undefined &&
    context.chat.type === 'private'
  )
}

export function createCommonFlow() {
  const { version: appVersion } = registry.export()

  const version = async (context: Context) => {
    if (!context.from || !context.chat) return

    await context.reply([
      `Version: ${appVersion}`,
      `Bot ID: ${context.botInfo.id}`,
      `User ID: ${context.from.id}`,
      `Chat ID: ${context.chat.id} (${context.chat.type})`,
    ].join('\n'))
  }

  return { version }
}

const ignoredErrors = [
  'chat not found',
  "bot can't initiate conversation with a user",
  "bots can't send messages to bots",
]

export function isNotificationErrorIgnorable(err: Error) {
  return ignoredErrors.some(m => err.message.includes(m))
}

export const requireGroupChat = () => {
  const { localize } = registry.export()

  return async (context: Context, next: Function) => {
    const { locale } = context.state

    if (isGroupChat(context)) {
      return next()
    }

    await context.reply(localize(locale, 'groupChatOnly'), { parse_mode: 'MarkdownV2' })
  }
}

export const withGroupChat = () => {
  return async (context: Context, next: Function) => {
    if (isGroupChat(context)) {
      return next()
    }
  }
}

export const requirePrivateChat = () => {
  const { localize } = registry.export()

  return async (context: Context, next: Function) => {
    const { locale } = context.state

    if (isPrivateChat(context)) {
      return next()
    }

    await context.reply(localize(locale, 'privateChatOnly'), { parse_mode: 'MarkdownV2' })
  }
}

export const withPrivateChat = () => {
  return async (context: Context, next: Function) => {
    if (isPrivateChat(context)) {
      return next()
    }
  }
}

export const withChatId = () => {
  return async (context: Context, next: Function) => {
    if (context.chat) {
      context.state.chatId = context.chat.id
    }

    return next()
  }
}


export function wrap<
  Middleware extends (context: T, next: Function) => unknown,
  T extends Context,
>(...middlewares: Middleware[]) {
  return async (context: T, next: Function) => {
    for (const [i, middleware] of middlewares.entries()) {
      if (i === middlewares.length - 1) {
        return middleware(context, next)
      } else {
        let interrupt = true
        await middleware(context, async () => interrupt = false)
        if (interrupt) break
      }
    }

    return next()
  }
}

export function escapeMd(string: string) {
  return string.replace(ESCAPE_REGEX, '\\$1')
}
