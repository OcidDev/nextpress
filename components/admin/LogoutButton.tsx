'use client'
// client
import { createAuthClient } from 'better-auth/react'
import { useState } from 'react'
const authClient = createAuthClient()
export function LogoutButton() {
  const [error, setError] = useState(false)
  return (
    <>
      <button
        className="textButton"
        onClick={async () => {
          try {
            const result = await authClient.signOut()
            if (result.error) setError(true)
            else window.location.assign('/admin/login')
          } catch {
            setError(true)
          }
        }}
      >
        Keluar
      </button>
      {error && <span role="alert">Gagal keluar. Coba lagi.</span>}
    </>
  )
}
