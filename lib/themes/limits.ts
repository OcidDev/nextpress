// Leave multipart overhead below Vercel Functions' request limit.
export const MAX_THEME_ZIP_BYTES = 4 * 1024 * 1024
export const THEME_ZIP_SIZE_MESSAGE = 'Berkas ZIP tema maksimal 4 MB.'
