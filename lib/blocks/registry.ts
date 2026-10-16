import { coreBlocks } from './core'
import { createBlockRegistry, type BlockDefinition, type BlockRegistry } from './render'

/**
 * Registry blok bawaan (sprint EXT-03).
 *
 * Berkas ini adalah tempat blok core dirakit menjadi satu registry yang dipakai
 * renderer. Ia sengaja terpisah dari `render.tsx` (mesin murni, tanpa React) dan
 * dari `schemas.ts` (nama + skema props, tanpa React): validator paket tema
 * (EXT-04) dan dokumentasi hanya butuh daftar nama dan skema, jadi keduanya
 * membaca `catalog.ts` dan tidak pernah ikut menarik komponen ke dalam proses
 * validasinya.
 *
 * Mendaftarkan blok plugin adalah pekerjaan EXT-08; registry ini hanya memuat
 * `core/*`. Plugin yang menyumbang blok akan memakai `createBlockRegistry` dengan
 * definisi core sebagai alasnya.
 */

export const blockRegistry: BlockRegistry = createBlockRegistry(coreBlocks)

export { createBlockRegistry }
export type { BlockDefinition, BlockRegistry }
