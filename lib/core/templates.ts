export interface TemplateQueryContext {
  kind:
    | 'front_page'
    | 'home'
    | 'single'
    | 'page'
    | 'category'
    | 'tag'
    | 'taxonomy'
    | 'author'
    | 'date'
    | 'search'
    | 'bookmarks'
    | '404'
    | 'index'
  postType?: string
  slug?: string
  id?: string | number
  taxonomy?: string
  termSlug?: string
  authorSlug?: string
  showOnFront?: 'posts' | 'page'
}

/**
 * Resolves WordPress template hierarchy candidates in order of specificity (WP-08).
 */
export function getTemplateHierarchy(context: TemplateQueryContext): string[] {
  const candidates: string[] = []

  switch (context.kind) {
    case 'front_page': {
      candidates.push('front-page')
      if (context.showOnFront === 'page') {
        if (context.slug) candidates.push(`page-${context.slug}`)
        if (context.id) candidates.push(`page-${context.id}`)
        candidates.push('page')
      } else {
        candidates.push('home')
      }
      candidates.push('index')
      break
    }

    case 'home': {
      candidates.push('home', 'index')
      break
    }

    case 'single': {
      const type = context.postType || 'post'
      if (context.slug) candidates.push(`single-${type}-${context.slug}`)
      if (context.id) candidates.push(`single-${type}-${context.id}`)
      candidates.push(`single-${type}`)
      candidates.push('single', 'singular', 'index')
      break
    }

    case 'page': {
      if (context.slug) candidates.push(`page-${context.slug}`)
      if (context.id) candidates.push(`page-${context.id}`)
      candidates.push('page', 'singular', 'index')
      break
    }

    case 'category': {
      const slug = context.termSlug || context.slug
      if (slug) candidates.push(`category-${slug}`)
      if (context.id) candidates.push(`category-${context.id}`)
      candidates.push('category', 'archive', 'index')
      break
    }

    case 'tag': {
      const slug = context.termSlug || context.slug
      if (slug) candidates.push(`tag-${slug}`)
      if (context.id) candidates.push(`tag-${context.id}`)
      candidates.push('tag', 'archive', 'index')
      break
    }

    case 'taxonomy': {
      const tax = context.taxonomy || 'category'
      const slug = context.termSlug || context.slug
      if (slug) candidates.push(`taxonomy-${tax}-${slug}`)
      candidates.push(`taxonomy-${tax}`, 'taxonomy', 'archive', 'index')
      break
    }

    case 'author': {
      const author = context.authorSlug || context.slug
      if (author) candidates.push(`author-${author}`)
      if (context.id) candidates.push(`author-${context.id}`)
      candidates.push('author', 'archive', 'index')
      break
    }

    case 'date': {
      candidates.push('date', 'archive', 'index')
      break
    }

    case 'search': {
      candidates.push('search', 'index')
      break
    }

    case 'bookmarks': {
      candidates.push('bookmarks', 'archive', 'index')
      break
    }

    case '404': {
      candidates.push('404', 'index')
      break
    }

    case 'index':
    default: {
      candidates.push('index')
      break
    }
  }

  // Deduplicate while preserving order
  return Array.from(new Set(candidates))
}

/**
 * Picks the first candidate matching the available templates.
 * Falls back to 'index' if no match is found.
 */
export function resolveTemplate(
  candidates: string[],
  availableTemplates: Set<string> | string[],
): string {
  const set = availableTemplates instanceof Set ? availableTemplates : new Set(availableTemplates)
  for (const candidate of candidates) {
    if (set.has(candidate)) {
      return candidate
    }
  }
  return 'index'
}
