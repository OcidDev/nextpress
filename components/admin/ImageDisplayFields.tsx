'use client'
import { useState } from 'react'
import { imageAlignments, imageDimensions, type ImageDisplay } from '@/lib/content/image-settings'

export function ImageDisplayFields({
  value,
  onChange,
  original,
  src = '',
}: {
  value: ImageDisplay
  onChange: (value: ImageDisplay) => void
  original: { width: number; height: number }
  src?: string
}) {
  const sizes = [
    { key: '150', label: 'Thumbnail', ...imageDimensions(original.width, original.height, 150) },
    { key: '300', label: 'Sedang', ...imageDimensions(original.width, original.height, 300) },
    { key: '1024', label: 'Besar', ...imageDimensions(original.width, original.height, 1024) },
    { key: 'full', label: 'Ukuran penuh', ...original },
  ]
  const availableSizes = sizes.filter(
    (size) => size.key === 'full' || size.width < original.width || size.height < original.height,
  )
  const inferred =
    [...sizes].reverse().find((size) => size.width === value.width && size.height === value.height)
      ?.key || 'custom'
  const [custom, setCustom] = useState(false)
  const [customLink, setCustomLink] = useState(Boolean(value.href && value.href !== src))
  const size = custom ? 'custom' : inferred
  const ratio = original.width / original.height || 1
  function dimension(key: 'width' | 'height', raw: string) {
    const number = Math.max(1, Math.min(10000, Number(raw) || 1))
    onChange({
      ...value,
      [key]: number,
      ...(key === 'width'
        ? { height: Math.max(1, Math.round(number / ratio)) }
        : { width: Math.max(1, Math.round(number * ratio)) }),
    })
  }
  return (
    <div className="imageDisplayFields adminForm">
      <label>
        Teks alternatif gambar
        <input
          value={value.alt}
          maxLength={250}
          onChange={(e) => onChange({ ...value, alt: e.target.value })}
        />
        <small>Jelaskan isi gambar. Kosongkan jika gambar hanya dekorasi.</small>
      </label>
      <label>
        Keterangan gambar
        <textarea
          value={value.caption}
          maxLength={2000}
          rows={2}
          onChange={(e) => onChange({ ...value, caption: e.target.value })}
        />
      </label>
      <h3>Pengaturan tampilan</h3>
      <label>
        Perataan gambar
        <select
          value={value.align}
          onChange={(e) => onChange({ ...value, align: e.target.value as ImageDisplay['align'] })}
        >
          {imageAlignments.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        Ukuran gambar
        <select
          value={size}
          onChange={(e) => {
            setCustom(e.target.value === 'custom')
            const chosen = sizes.find((entry) => entry.key === e.target.value)
            if (chosen) onChange({ ...value, width: chosen.width, height: chosen.height })
          }}
        >
          {availableSizes.map((entry) => (
            <option key={entry.key} value={entry.key}>
              {entry.label} — {entry.width} × {entry.height}
            </option>
          ))}
          <option value="custom">Ukuran khusus</option>
        </select>
      </label>
      {size === 'custom' && (
        <div className="imageDimensions">
          <label>
            Lebar (px)
            <input
              type="number"
              min="1"
              max="10000"
              value={value.width}
              onChange={(e) => dimension('width', e.target.value)}
            />
          </label>
          <label>
            Tinggi (px)
            <input
              type="number"
              min="1"
              max="10000"
              value={value.height}
              onChange={(e) => dimension('height', e.target.value)}
            />
          </label>
          <small>Rasio gambar dipertahankan.</small>
        </div>
      )}
      <label>
        Tautkan ke
        <select
          value={customLink ? 'custom' : value.href ? 'file' : 'none'}
          onChange={(e) => {
            setCustomLink(e.target.value === 'custom')
            onChange({ ...value, href: e.target.value === 'file' ? src : '', newTab: false })
          }}
        >
          <option value="none">Tidak ada</option>
          <option value="file">Berkas media</option>
          <option value="custom">URL khusus</option>
        </select>
      </label>
      {customLink && (
        <label>
          URL tujuan gambar
          <input
            type="text"
            inputMode="url"
            placeholder="https://"
            value={value.href || ''}
            maxLength={2000}
            onChange={(e) => onChange({ ...value, href: e.target.value })}
          />
        </label>
      )}
      {(value.href || customLink) && (
        <label className="adminCheck">
          <input
            type="checkbox"
            checked={value.newTab || false}
            onChange={(e) => onChange({ ...value, newTab: e.target.checked })}
          />
          Buka tautan di tab baru
        </label>
      )}
    </div>
  )
}
