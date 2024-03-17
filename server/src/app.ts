import { greeting } from './util.js'
import { Telegraf } from 'telegraf'

console.log(greeting('John Doe'))

const telegraf = new Telegraf('my-token')

console.log(telegraf)
