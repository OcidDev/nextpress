export type CommentStatus = 'pending' | 'approved' | 'spam'

/**
 * Bentuk komentar yang aman dikirim ke client.
 * `authorEmail` sengaja tidak ada di tipe ini agar email penulis tidak ikut
 * terkirim ke client.
 */
export interface PublicComment {
  id: string
  postId: string
  parentId?: string
  authorName: string
  authorWebsite?: string
  content: string
  createdAt: string
  replies: PublicComment[]
}

/** Bentuk lengkap, hanya untuk pemakaian di server (moderasi, notifikasi). */
export interface Comment extends Omit<PublicComment, 'replies'> {
  authorEmail: string
  status: CommentStatus
  ipHash?: string
  userAgent?: string
  replies: Comment[]
}
