import { editorOptions } from '@/lib/db/queries/admin-content'
import { PostEditor } from '@/components/admin/PostEditor'
export default async function NewPost() {
  return (
    <>
      <h1>Tulis artikel</h1>
      <PostEditor options={await editorOptions()} />
    </>
  )
}
