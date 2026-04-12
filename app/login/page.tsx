'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(false)

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
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-72 space-y-4">
        <p className="text-sm font-semibold text-gray-700">Renato Piermarini Autos</p>
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoFocus
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:border-gray-500"
        />
        {error && <p className="text-xs text-red-600">Contraseña incorrecta.</p>}
        <button
          type="submit"
          disabled={loading || !password}
          className="w-full bg-gray-900 text-white text-sm py-2 rounded hover:bg-gray-700 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
