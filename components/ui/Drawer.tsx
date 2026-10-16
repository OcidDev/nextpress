import type { ReactNode } from 'react'
import { Modal } from './Modal'

export function Drawer({ children }: { children: ReactNode }) {
  return (
    <Modal panel="menu" title="Menu navigasi" drawer>
      {children}
    </Modal>
  )
}
