'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError(true)
      setPassword('')
    }
  }

  return (
    <main style={{
      background: '#0E0E0E',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'DM Mono', 'Courier New', monospace",
    }}>
      <form onSubmit={handleSubmit} style={{ width: '100%', maxWidth: 320, padding: '0 20px' }}>
        <div style={{ color: '#E8FF3C', fontSize: 11, letterSpacing: '0.35em', fontWeight: 700, marginBottom: 32 }}>
          APAI
        </div>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false) }}
          placeholder="Adgangskode"
          autoFocus
          style={{
            width: '100%',
            background: '#181818',
            border: `1px solid ${error ? '#FF4444' : '#2A2A2A'}`,
            borderRadius: 8,
            color: '#E8E8E8',
            fontFamily: 'inherit',
            fontSize: 15,
            padding: '14px 16px',
            outline: 'none',
            marginBottom: 12,
          }}
        />
        {error && (
          <div style={{ color: '#FF4444', fontSize: 12, marginBottom: 12 }}>Forkert adgangskode</div>
        )}
        <button
          type="submit"
          style={{
            width: '100%',
            background: '#E8FF3C',
            color: '#0E0E0E',
            border: 'none',
            borderRadius: 6,
            padding: '12px',
            fontFamily: 'inherit',
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          Log ind
        </button>
      </form>
    </main>
  )
}
