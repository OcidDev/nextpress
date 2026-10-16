export interface AuthorSocial {
  twitter?: string
  instagram?: string
  facebook?: string
  website?: string
}

export interface Author {
  id: string
  slug: string
  name: string
  avatar?: string
  bio?: string
  role?: string
  verified?: boolean
  social?: AuthorSocial
}
