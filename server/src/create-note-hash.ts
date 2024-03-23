import crypto from 'crypto';

export function createNoteHash(content: string) {
  return crypto.createHash('md5').update(content).digest('hex')
}