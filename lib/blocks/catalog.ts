import { z } from 'zod'
import { containerBlocks, coreBlockNames, blockPropsSchemas } from './schemas'

/**
 * Katalog blok sebagai JSON (sprint EXT-03).
 *
 * Dua pemakai, satu sumber:
 *
 * - validator paket tema (EXT-04) memeriksa nama blok dan props template tanpa
 *   mengeksekusi satu baris React pun. Karena itu berkas ini **tidak** boleh
 *   mengimpor `registry.ts` — yang menarik seluruh komponen blok ke dalam proses;
 * - dokumentasi dan dasbor dapat menampilkan daftar blok beserta props-nya.
 *
 * Skema JSON dihasilkan `z.toJSONSchema`, jadi katalog tidak dapat menyimpang dari
 * validasi yang benar-benar dijalankan renderer: keduanya membaca objek Zod yang
 * sama.
 */

export type BlockCatalogEntry = {
  name: string
  /** `core` untuk blok bawaan; `plugin` untuk blok dari plugin (EXT-08). */
  source: 'core' | 'plugin'
  /** Blok ini menerima `children`. */
  container: boolean
  /** Skema JSON props, atau `null` bila skema tidak dapat dijadikan JSON. */
  props: Record<string, unknown> | null
}

/** Katalog dalam bentuk data biasa; aman diserialkan ke JSON. */
export function blockCatalog(): BlockCatalogEntry[] {
  return coreBlockNames.map((name) => {
    const schema = blockPropsSchemas[name]
    let props: Record<string, unknown> | null = null
    try {
      // `io: 'input'` supaya yang tergambar adalah bentuk yang diterima template,
      // bukan bentuk setelah transformasi — template berisi nilai masukan.
      props = z.toJSONSchema(schema, { io: 'input' }) as Record<string, unknown>
    } catch {
      // Skema yang tidak dapat dijadikan JSON tetap dicantumkan namanya; katalog
      // kehilangan detail props-nya, bukan seluruh bloknya.
      props = null
    }
    return {
      name,
      source: name.startsWith('plugin/') ? ('plugin' as const) : ('core' as const),
      container: containerBlocks.includes(name),
      props,
    }
  })
}

/** Nama blok core yang dikenali build ini, dalam urutan katalog. */
export function coreCatalogNames(): string[] {
  return [...coreBlockNames]
}
