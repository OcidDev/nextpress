import { publicEnv } from './env'

export const MEDIA_UPLOAD_MAX_MB = publicEnv.NEXT_PUBLIC_MEDIA_MAX_MB
export const MEDIA_UPLOAD_MAX_BYTES = MEDIA_UPLOAD_MAX_MB * 1024 * 1024
