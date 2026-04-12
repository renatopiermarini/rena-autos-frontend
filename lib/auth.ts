/**
 * Shared auth helpers — work in both Edge (middleware) and Node (API routes).
 * The cookie stores SHA-256(password + salt), never the password itself.
 */

const SALT = 'rena_autos_dashboard_v1'

export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password + SALT)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
