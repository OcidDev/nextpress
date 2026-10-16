'use client'

import { useRef, useState } from 'react'

export function MediaUrlField({ url }: { url: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [copied, setCopied] = useState(false)
  const [manual, setManual] = useState(false)

  async function handleCopy() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setManual(false)
        setTimeout(() => setCopied(false), 3000)
        return
      }
      throw new Error('Clipboard tidak tersedia')
    } catch {
      inputRef.current?.select()
      setManual(true)
      setCopied(false)
    }
  }

  return (
    <div className="mediaUrlControl">
      <label>
        URL media
        <input
          ref={inputRef}
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
        />
      </label>
      <div className="mediaUrlActions">
        <button
          type="button"
          className="button secondary mediaCopyButton"
          onClick={handleCopy}
        >
          Salin URL
        </button>
        {copied && (
          <span role="status" className="mediaCopyNotice">
            URL tersalin
          </span>
        )}
        {manual && (
          <span role="alert" className="mediaCopyNotice manual">
            Tekan Ctrl+C untuk menyalin
          </span>
        )}
      </div>
    </div>
  )
}
