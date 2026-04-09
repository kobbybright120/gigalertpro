import { createContext, useContext } from "react";

export const LockedDashboardContext = createContext({
  isLocked: false,
  onUpgrade: () => {},
  onSeePlans: () => {},
  gigCount: 0,
  setGigCount: () => {},
});

export function useLockedDashboard() {
  return useContext(LockedDashboardContext);
}
