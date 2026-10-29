'use client';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { CartLine, StoreProduct } from './types';
const STORAGE = 'rokn-cart-v1';
type CartContextType = { lines: CartLine[]; ready: boolean; add: (p: StoreProduct, quantity?: number) => void; update: (id: string, quantity: number) => void; remove: (id: string) => void; clear: () => void; count: number; notice: string; dismiss: () => void };
const CartContext = createContext<CartContextType | null>(null);
function validLine(value: unknown): value is CartLine {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.name === 'string' && typeof v.slug === 'string' && typeof v.weightGrams === 'number' && Number.isFinite(v.weightGrams) && typeof v.priceAgorot === 'number' && Number.isInteger(v.priceAgorot) && v.priceAgorot >= 0 && typeof v.quantity === 'number' && Number.isInteger(v.quantity) && v.quantity >= 1 && v.quantity <= 20 && (typeof v.image === 'string' || v.image === null);
}
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const currentLines = useRef<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const hydrate = window.requestAnimationFrame(() => {
      try { const saved: unknown = JSON.parse(localStorage.getItem(STORAGE) || '[]'); if (Array.isArray(saved)) { currentLines.current = saved.filter(validLine).slice(0, 30); setLines(currentLines.current); } } catch { /* An invalid local cart is safely discarded. */ }
      setReady(true);
    });
    return () => window.cancelAnimationFrame(hydrate);
  }, []);
  function commit(next: CartLine[]) {
    currentLines.current = next;
    // Persist the user action before returning: a reload cannot race a passive effect.
    try { localStorage.setItem(STORAGE, JSON.stringify(next)); } catch { /* Cart remains usable when storage is unavailable. */ }
    setLines(next);
  }
  function add(p: StoreProduct, quantity = 1) {
    if (!ready || !p.available || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return;
    const current = currentLines.current;
    const existing = current.find(l => l.id === p.id);
    commit(existing ? current.map(l => l.id === p.id ? { ...l, quantity: Math.min(20, l.quantity + quantity) } : l) : [...current, { id: p.id, name: p.name, slug: p.slug, quantity, weightGrams: p.weightGrams, priceAgorot: p.priceAgorot, image: p.images[0]?.url || null }]);
    setNotice(`أُضيف ${p.name} إلى سلتك`);
  }
  return <CartContext.Provider value={{ lines, ready, add, update: (id, quantity) => { if (ready && Number.isInteger(quantity) && quantity >= 1 && quantity <= 20) commit(currentLines.current.map(l => l.id === id ? { ...l, quantity } : l)); }, remove: id => { if (ready) commit(currentLines.current.filter(l => l.id !== id)); }, clear: () => commit([]), count: lines.reduce((s, l) => s + l.quantity, 0), notice, dismiss: () => setNotice('') }}>{children}</CartContext.Provider>;
}
export function useCart() { const value = useContext(CartContext); if (!value) throw new Error('CartProvider is required'); return value; }
