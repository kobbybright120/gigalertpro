import { createContext, useContext, useState, useCallback } from "react";

const Ctx = createContext({ count: 0, bump: () => {}, reset: () => {} });

export function NewGigCountProvider({ children }) {
  const [count, setCount] = useState(0);
  const bump = useCallback((n) => setCount((c) => c + n), []);
  const reset = useCallback(() => setCount(0), []);
  return <Ctx.Provider value={{ count, bump, reset }}>{children}</Ctx.Provider>;
}

export function useNewGigCount() {
  return useContext(Ctx);
}
