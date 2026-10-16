import { Modal } from '@/components/ui/Modal'

export function SearchModal() {
  return (
    <Modal panel="search" title="Cari artikel">
      <form action="/search" method="get" className="searchForm" role="search">
        <label htmlFor="site-search">Kata kunci</label>
        <input
          id="site-search"
          name="q"
          type="search"
          placeholder="Apa yang ingin Anda baca?"
          required
          maxLength={200}
        />
        <button type="submit" className="button">
          Cari
        </button>
      </form>
    </Modal>
  )
}
