'use client'

import * as React from 'react'
import { api, ApiError } from './lib'

export interface FetchState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
  setData: React.Dispatch<React.SetStateAction<T | null>>
}

/**
 * 简易数据获取 hook。返回 loading / error / data / refetch。
 * 当 key 为 null 时不发起请求。
 */
export function useFetch<T = any>(
  path: string | null,
  options?: { deps?: any[] }
): FetchState<T> {
  const [data, setData] = React.useState<T | null>(null)
  const [loading, setLoading] = React.useState(!!path)
  const [error, setError] = React.useState<string | null>(null)
  const [tick, setTick] = React.useState(0)

  const deps = options?.deps ?? []

  React.useEffect(() => {
    let alive = true
    if (!path) {
      setLoading(false)
      setData(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    api<T>(path)
      .then((d) => {
        if (!alive) return
        setData(d)
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (!alive) return
        const msg = e instanceof ApiError ? e.message : (e as Error).message
        setError(msg)
        setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [path, tick, ...deps])

  const refetch = React.useCallback(() => setTick((t) => t + 1), [])

  return { data, loading, error, refetch, setData }
}

/**
 * 全局平台初始化 hook：mount 时调用一次 /api/init。
 */
export function usePlatformInit() {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [counts, setCounts] = React.useState<{ concepts: number; domains: number; rules: number; scenarios: number } | null>(null)

  React.useEffect(() => {
    let alive = true
    setStatus('loading')
    api<{ ok: boolean; counts: { concepts: number; domains: number; rules: number; scenarios: number } }>('/init')
      .then((r) => {
        if (!alive) return
        setCounts(r.counts)
        setStatus('ready')
      })
      .catch(() => {
        if (!alive) return
        setStatus('error')
      })
    return () => {
      alive = false
    }
  }, [])

  return { status, counts }
}
