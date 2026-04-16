'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: FormData) {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) { setError(json.error || 'Registration failed'); return }
      router.push('/projects')
      router.refresh()
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black font-headline text-transparent bg-clip-text bg-gradient-to-r from-violet-900 to-pink-600 tracking-tight">
            TestTree
          </h1>
          <p className="text-outline mt-2 text-sm">Create your free workspace</p>
        </div>

        <div className="bg-white rounded-3xl shadow-card p-8 ring-1 ring-outline/5">
          <h2 className="text-2xl font-black font-headline text-on-surface mb-6">Create account</h2>

          {error && (
            <div className="mb-4 p-3 bg-error-container text-on-error-container rounded-xl text-sm flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Name
              </label>
              <input
                {...register('name')}
                type="text"
                placeholder="Alex Smith"
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              />
              {errors.name && <p className="text-xs text-error mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Email
              </label>
              <input
                {...register('email')}
                type="email"
                placeholder="you@company.com"
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              />
              {errors.email && <p className="text-xs text-error mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-label font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                {...register('password')}
                type="password"
                placeholder="••••••••"
                className="w-full bg-surface-container-low border-none rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
              />
              {errors.password && <p className="text-xs text-error mt-1">{errors.password.message}</p>}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-3.5 rounded-xl font-headline font-bold text-sm shadow-primary hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-60 mt-2"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-outline mt-6">
            Already have an account?{' '}
            <Link href="/login" className="text-primary font-bold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
