import 'server-only'
import { cache } from 'react'
import { createCoreRegistry } from './registry'

export const getCoreRegistry = cache(createCoreRegistry)
