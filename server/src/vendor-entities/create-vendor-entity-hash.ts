import crypto from 'crypto'

export function createVendorEntityHash(input: string) {
  return crypto.createHash('md5').update(input).digest('hex')
}
