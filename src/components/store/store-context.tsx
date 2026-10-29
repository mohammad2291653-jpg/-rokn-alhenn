'use client';
import { createContext, useContext, type ReactNode } from 'react';
const StoreContext = createContext({ whatsapp: 'https://wa.me/970599373380', readOnly: false });
export function StoreProvider({ whatsapp, readOnly = false, children }: { whatsapp: string; readOnly?: boolean; children: ReactNode }) { return <StoreContext.Provider value={{ whatsapp, readOnly }}>{children}</StoreContext.Provider>; }
export function useStoreReadOnly() { return useContext(StoreContext).readOnly; }
export function useWhatsApp(text: string) { const { whatsapp } = useContext(StoreContext); const url = new URL(whatsapp); url.searchParams.set('text', text); return url.href; }
export function WhatsAppLink({ message, children, ...props }: { message: string; children: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) { const href = useWhatsApp(message); return <a href={href} {...props}>{children}</a>; }
