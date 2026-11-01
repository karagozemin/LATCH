import { FilePlus2, History, LayoutDashboard, Layers, type LucideIcon } from 'lucide-react'
import type { View } from '@/hooks/useView'

export const NAV: { view: View; label: string; title: string; icon: LucideIcon }[] = [
  { view: 'overview', label: 'Overview', title: 'Overview', icon: LayoutDashboard },
  { view: 'create', label: 'Create Authorization', title: 'Create Authorization', icon: FilePlus2 },
  { view: 'holds', label: 'Active Holds', title: 'Active Holds', icon: Layers },
  { view: 'history', label: 'Transaction History', title: 'Transaction History', icon: History },
]
