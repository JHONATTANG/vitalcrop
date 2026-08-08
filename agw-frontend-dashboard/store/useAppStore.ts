import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  selectedDeviceId:  string | null;
  sidebarCollapsed:  boolean;
  // Actions
  setSelectedDevice: (id: string | null) => void;
  toggleSidebar:     () => void;
  setSidebarCollapsed: (v: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      selectedDeviceId:  null,
      sidebarCollapsed:  false,
      setSelectedDevice: (id) => set({ selectedDeviceId: id }),
      toggleSidebar:     () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
    }),
    {
      name: 'vitalcrop-app-store',
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    }
  )
);
