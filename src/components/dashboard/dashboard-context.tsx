"use client"

import { createContext, useContext } from "react"

type DashboardContextValue = {
  toggleMobileSidebar: () => void
}

export const DashboardContext = createContext<DashboardContextValue>({
  toggleMobileSidebar: () => {},
})

export const useDashboardContext = () => useContext(DashboardContext)
