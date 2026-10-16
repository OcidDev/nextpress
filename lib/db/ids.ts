import { randomBytes } from 'node:crypto'

export const newId = () => randomBytes(16).toString('hex')
