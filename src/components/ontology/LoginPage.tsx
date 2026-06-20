'use client'

import * as React from 'react'
import { ShieldCheck, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const STORAGE_KEY = 'ontology-platform-auth'

export function isLoggedIn(): boolean {
  if (typeof window === 'undefined') return true // SSR 时默认放行
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function logout() {
  localStorage.removeItem(STORAGE_KEY)
  window.location.reload()
}

export function LoginPage() {
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    // 当前预留：不校验，直接登录
    setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, '1')
      window.location.reload()
    }, 300)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-xl bg-foreground text-background">
            <ShieldCheck className="size-6" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-semibold text-foreground">智规平台</h1>
            <p className="mt-1 text-xs text-muted-foreground">业务规则智能校验</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="flex flex-col gap-4 rounded-xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-2">
            <Label htmlFor="username" className="text-xs text-muted-foreground">用户名</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="用户名"
              autoComplete="username"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password" className="text-xs text-muted-foreground">密码</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              autoComplete="current-password"
            />
          </div>
          <Button type="submit" disabled={loading} className="mt-2 w-full">
            <LogIn className="size-4" />
            {loading ? '登录中…' : '登录'}
          </Button>
          <p className="text-center text-[10px] text-muted-foreground">
            首次启动凭据见控制台日志，或通过环境变量配置
          </p>
        </form>
      </div>
    </div>
  )
}
