'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { ArticleHeading } from '@/lib/content/article'
import { ListIcon } from '@/components/ui/icons/ListIcon'
import styles from './PostToc.module.css'

type HeadingNode = ArticleHeading & { children: HeadingNode[] }

function headingTree(headings: ArticleHeading[]) {
  const roots: HeadingNode[] = []
  const parents: HeadingNode[] = []
  for (const heading of headings) {
    const node: HeadingNode = { ...heading, children: [] }
    while (parents.length && parents[parents.length - 1]!.level >= node.level) parents.pop()
    const parent = parents[parents.length - 1]
    if (parent) parent.children.push(node)
    else roots.push(node)
    parents.push(node)
  }
  return roots
}

export function PostToc({
  headings,
  open = true,
  title = 'Daftar isi',
}: {
  headings: ArticleHeading[]
  open?: boolean
  title?: string
}) {
  const id = useId()
  const [expanded, setExpanded] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  // Keep the article visible on small screens; desktop starts with its outline open.
  useEffect(() => {
    setExpanded(open && window.matchMedia('(min-width: 1101px)').matches)
  }, [open])

  useEffect(() => {
    if (!expanded || !headings.length) return
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      setExpanded(false)
      requestAnimationFrame(() => trigger.current?.focus())
    }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  }, [expanded, headings.length])

  if (!headings.length) return null

  function minimize() {
    setExpanded(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }

  function selectHeading(headingId: string) {
    setExpanded(false)
    requestAnimationFrame(() => {
      const target = document.getElementById(headingId)
      if (!target) return
      target.tabIndex = -1
      target.focus({ preventScroll: true })
    })
  }

  function renderHeadings(nodes: HeadingNode[]) {
    return (
      <ol>
        {nodes.map((heading) => (
          <li key={heading.id}>
            <a href={`#${heading.id}`} onClick={() => selectHeading(heading.id)}>
              {heading.text}
            </a>
            {heading.children.length > 0 && renderHeadings(heading.children)}
          </li>
        ))}
      </ol>
    )
  }

  return (
    <aside className={styles.toc} aria-label={title}>
      <button
        ref={trigger}
        type="button"
        className={styles.trigger}
        aria-label={`Buka ${title.toLowerCase()}`}
        aria-expanded={expanded}
        aria-controls={id}
        title={title}
        hidden={expanded}
        onClick={() => {
          setExpanded(true)
          requestAnimationFrame(() => closeButton.current?.focus())
        }}
      >
        <span className={styles.dot} aria-hidden="true" />
        <ListIcon aria-hidden="true" />
      </button>
      <div id={id} className={styles.panel} hidden={!expanded}>
        <div className={styles.header}>
          <h2 id={`${id}-title`}>{title}</h2>
          <button
            ref={closeButton}
            type="button"
            className={styles.close}
            aria-label={`Minimalkan ${title.toLowerCase()}`}
            onClick={minimize}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="m6 6 12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <nav className={styles.contents} aria-labelledby={`${id}-title`}>
          {renderHeadings(headingTree(headings))}
        </nav>
      </div>
    </aside>
  )
}
