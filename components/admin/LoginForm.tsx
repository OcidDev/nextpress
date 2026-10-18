'use client'
// client — authentication feedback without exposing credentials in URLs.
import { useState } from 'react'
import { createAuthClient } from 'better-auth/react'
const authClient = createAuthClient()
export function LoginForm() {
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  return (
    <form
      className="adminForm"
      method="post"
      action="/api/auth/sign-in/email"
      onSubmit={async (event) => {
        event.preventDefault()
        setPending(true)
        setError('')
        const data = new FormData(event.currentTarget)
        try {
          const result = await authClient.signIn.email({
            email: String(data.get('email')),
            password: String(data.get('password')),
          })
          if (result.error)
            setError(
              result.error.status === 429
                ? 'Terlalu banyak percobaan. Coba lagi satu menit lagi.'
                : 'Email atau kata sandi tidak sesuai.',
            )
          else window.location.assign('/admin')
        } catch {
          setError('Tidak dapat masuk. Silakan coba lagi.')
        } finally {
          setPending(false)
        }
      }}
    >
      <label>
        Email
        <input type="email" name="email" autoComplete="username" required />
      </label>
      <label>
        Kata sandi
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={128}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button className="button" disabled={pending}>
        {pending ? 'Memeriksa…' : 'Masuk'}
      </button>
    </form>
  )
}
