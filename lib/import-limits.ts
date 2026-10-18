// Leave room for multipart overhead below the hosted request limit and 6 MB action limit.
export const IMPORT_MAX_MB = 4
export const IMPORT_MAX_BYTES = IMPORT_MAX_MB * 1024 * 1024
export const IMPORT_SIZE_MESSAGE = `Berkas impor maksimal ${IMPORT_MAX_MB} MB. Pecah ekspor yang lebih besar menjadi beberapa berkas.`
