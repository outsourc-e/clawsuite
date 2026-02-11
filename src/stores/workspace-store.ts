import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type WorkspaceState = {
  sidebarCollapsed: boolean
  fileExplorerCollapsed: boolean
  /** Currently active sub-page route (e.g. '/skills', '/channels') — null means chat-only */
  activeSubPage: string | null
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleFileExplorer: () => void
  setFileExplorerCollapsed: (collapsed: boolean) => void
  setActiveSubPage: (page: string | null) => void
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      fileExplorerCollapsed: true,
      activeSubPage: null,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleFileExplorer: () => set((s) => ({ fileExplorerCollapsed: !s.fileExplorerCollapsed })),
      setFileExplorerCollapsed: (collapsed) => set({ fileExplorerCollapsed: collapsed }),
      setActiveSubPage: (page) => set({ activeSubPage: page }),
    }),
    {
      name: 'openclaw-workspace-v1',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        fileExplorerCollapsed: state.fileExplorerCollapsed,
      }),
    },
  ),
)
