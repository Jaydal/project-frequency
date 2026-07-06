'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type SidebarContext = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

const Ctx = createContext<SidebarContext>({ open: false, setOpen: () => {}, toggle: () => {} });

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <Ctx value={{ open, setOpen, toggle: () => setOpen(v => !v) }}>{children}</Ctx>;
}

export function useSidebar() {
  return useContext(Ctx);
}
