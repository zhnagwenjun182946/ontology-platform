'use client'

import * as React from 'react'
import { FileText, List, RefreshCw } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { useFetch } from './hooks'
import {
  LoadingState, ErrorState, EmptyState, PageHeader,
} from './primitives'

interface DesignDocResp {
  content: string
}

interface TocItem {
  level: number
  text: string
  anchor: string
}

function extractToc(md: string): TocItem[] {
  const lines = md.split('\n')
  const items: TocItem[] = []
  let inCodeBlock = false
  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock
      continue
    }
    if (inCodeBlock) continue
    const m = line.match(/^(#{1,4})\s+(.*)$/)
    if (m) {
      const level = m[1].length
      const text = m[2].replace(/[`*_~]/g, '').trim()
      const anchor = text
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
      items.push({ level, text, anchor })
    }
  }
  return items
}

export function DesignDoc() {
  const { data, loading, error, refetch } = useFetch<DesignDocResp>('/design-doc')
  const [activeAnchor, setActiveAnchor] = React.useState<string>('')

  const toc = React.useMemo(() => (data ? extractToc(data.content) : []), [data])

  React.useEffect(() => {
    if (!toc.length) return
    const headings = toc
      .map(t => document.getElementById(`doc-${t.anchor}`))
      .filter(Boolean) as HTMLElement[]
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        if (visible[0]) {
          const id = visible[0].target.id.replace('doc-', '')
          setActiveAnchor(id)
        }
      },
      { rootMargin: '-80px 0px -70% 0px' }
    )
    headings.forEach(h => observer.observe(h))
    return () => observer.disconnect()
  }, [toc])

  const handleTocClick = (anchor: string) => {
    const el = document.getElementById(`doc-${anchor}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setActiveAnchor(anchor)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="设计文档"
        icon={FileText}
        description="平台核心理念与规范。可在线阅读，强化「人能看懂」的理念。"
        actions={
          <Button size="sm" variant="outline" onClick={refetch}>
            <RefreshCw className="size-3.5" /> 刷新
          </Button>
        }
      />

      {loading ? (
        <LoadingState label="加载设计文档…" />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} />
      ) : !data ? null : (
        <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
          {/* TOC */}
          <aside className="hidden lg:block">
            <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto scrollbar-thin">
              <div className="mb-2 flex items-center gap-1.5 px-2 text-xs font-medium text-muted-foreground">
                <List className="size-3.5" /> 目录
              </div>
              <ul className="flex flex-col gap-0.5">
                {toc.map((t, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => handleTocClick(t.anchor)}
                      className={cn(
                        'w-full truncate rounded-md px-2 py-1 text-left text-xs transition-colors',
                        activeAnchor === t.anchor
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                      )}
                      style={{ paddingLeft: `${(t.level - 1) * 12 + 8}px` }}
                      title={t.text}
                    >
                      {t.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* 文档主体 */}
          <article
            className="min-w-0 rounded-xl border bg-card p-5 shadow-sm md:p-7"
            aria-label="设计文档内容"
          >
            {data.content.split('\n').length === 0 ? (
              <EmptyState title="文档为空" />
            ) : (
              <div className="doc-prose">
                <ReactMarkdown
                  components={{
                    h1: ({ children }) => {
                      const text = String(children)
                      const anchor = text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')
                      return (
                        <h1 id={`doc-${anchor}`} className="scroll-mt-20 text-2xl font-bold tracking-tight text-foreground mb-4 mt-2 first:mt-0">
                          {children}
                        </h1>
                      )
                    },
                    h2: ({ children }) => {
                      const text = String(children)
                      const anchor = text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')
                      return (
                        <h2 id={`doc-${anchor}`} className="scroll-mt-20 text-xl font-semibold tracking-tight text-foreground mt-7 mb-3 border-b pb-1.5">
                          {children}
                        </h2>
                      )
                    },
                    h3: ({ children }) => {
                      const text = String(children)
                      const anchor = text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')
                      return (
                        <h3 id={`doc-${anchor}`} className="scroll-mt-20 text-base font-semibold text-foreground mt-5 mb-2">
                          {children}
                        </h3>
                      )
                    },
                    h4: ({ children }) => (
                      <h4 className="scroll-mt-20 text-sm font-semibold text-foreground mt-4 mb-1.5">{children}</h4>
                    ),
                    p: ({ children }) => (
                      <p className="text-sm leading-relaxed text-foreground/90 my-2.5">{children}</p>
                    ),
                    ul: ({ children }) => (
                      <ul className="my-2.5 ml-5 list-disc space-y-1 text-sm text-foreground/90">{children}</ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="my-2.5 ml-5 list-decimal space-y-1 text-sm text-foreground/90">{children}</ol>
                    ),
                    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                    a: ({ children, href }) => (
                      <a href={href} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                        {children}
                      </a>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-foreground">{children}</strong>
                    ),
                    em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
                    blockquote: ({ children }) => (
                      <blockquote className="my-3 border-l-4 border-primary/40 bg-primary/5 px-4 py-2 text-sm italic text-foreground/90">
                        {children}
                      </blockquote>
                    ),
                    hr: () => <hr className="my-5 border-border" />,
                    table: ({ children }) => (
                      <div className="my-3 overflow-x-auto rounded-md border">
                        <table className="w-full text-xs">{children}</table>
                      </div>
                    ),
                    thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                    th: ({ children }) => <th className="border-b px-3 py-2 text-left font-semibold text-foreground">{children}</th>,
                    td: ({ children }) => <td className="border-b px-3 py-2 text-foreground/90">{children}</td>,
                    code: ({ className, children, ...props }: any) => {
                      const match = /language-(\w+)/.exec(className || '')
                      const isInline = !match && !String(children).includes('\n')
                      if (isInline) {
                        return (
                          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.85em] text-foreground" {...props}>
                            {children}
                          </code>
                        )
                      }
                      const lang = match ? match[1] : 'text'
                      return (
                        <SyntaxHighlighter
                          language={lang}
                          style={oneDark}
                          customStyle={{
                            margin: 0,
                            borderRadius: '0.5rem',
                            fontSize: '12px',
                            padding: '1rem',
                          }}
                          className="my-3 scrollbar-thin"
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      )
                    },
                    pre: ({ children }) => <>{children}</>,
                  }}
                >
                  {data.content}
                </ReactMarkdown>
              </div>
            )}
          </article>
        </div>
      )}
    </div>
  )
}
