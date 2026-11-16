/**
 * Merch cart, kept on the phone (AsyncStorage). One cart holds items from
 * several shops; each shop is checked out and paid separately because the
 * money goes to different accounts. Prices here are display only: the server
 * recomputes every price when the order is placed.
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CartLine = {
  productId: string;
  variantId: string;
  quantity: number;
  title: string;
  variantLabel: string;
  image?: string;
  unitPriceCents: number;
  sellerKey: string; // "platform" or the company id
  sellerName: string;
};

type CartState = { lines: CartLine[]; pickupBooking: Record<string, string> };

const KEY = '@unlocked_merch_cart_v1';
const listeners = new Set<(s: CartState) => void>();
let cache: CartState | null = null;

async function load(): Promise<CartState> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    cache = {
      lines: Array.isArray(parsed?.lines) ? parsed.lines : [],
      pickupBooking: parsed?.pickupBooking && typeof parsed.pickupBooking === 'object' ? parsed.pickupBooking : {},
    };
  } catch {
    cache = { lines: [], pickupBooking: {} };
  }
  return cache;
}

async function save(next: CartState) {
  cache = next;
  listeners.forEach((l) => l(next));
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
}

export function euro(cents: number): string {
  const n = cents / 100;
  return `€${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(2)}`;
}

export function useCart() {
  const [state, setState] = useState<CartState>(cache ?? { lines: [], pickupBooking: {} });
  useEffect(() => {
    let alive = true;
    load().then((s) => alive && setState(s));
    listeners.add(setState);
    return () => {
      alive = false;
      listeners.delete(setState);
    };
  }, []);

  const add = useCallback(async (line: CartLine) => {
    const s = await load();
    const lines = [...s.lines];
    const i = lines.findIndex((l) => l.productId === line.productId && l.variantId === line.variantId);
    if (i >= 0) lines[i] = { ...lines[i], ...line, quantity: Math.min(10, lines[i].quantity + line.quantity) };
    else lines.push(line);
    await save({ ...s, lines });
  }, []);

  const setQty = useCallback(async (productId: string, variantId: string, quantity: number) => {
    const s = await load();
    const lines = s.lines
      .map((l) => (l.productId === productId && l.variantId === variantId ? { ...l, quantity } : l))
      .filter((l) => l.quantity > 0);
    await save({ ...s, lines });
  }, []);

  const clearSeller = useCallback(async (sellerKey: string) => {
    const s = await load();
    const pickupBooking = { ...s.pickupBooking };
    delete pickupBooking[sellerKey];
    await save({ lines: s.lines.filter((l) => l.sellerKey !== sellerKey), pickupBooking });
  }, []);

  /** Remember the game to collect a company's merch at (set from the booking confirmation). */
  const setPickupBooking = useCallback(async (companyId: string, bookingId: string) => {
    const s = await load();
    await save({ ...s, pickupBooking: { ...s.pickupBooking, [companyId]: bookingId } });
  }, []);

  const count = state.lines.reduce((s, l) => s + l.quantity, 0);
  return { lines: state.lines, pickupBooking: state.pickupBooking, add, setQty, clearSeller, setPickupBooking, count };
}

export function groupBySeller(lines: CartLine[]) {
  const groups = new Map<string, { sellerKey: string; sellerName: string; lines: CartLine[] }>();
  for (const l of lines) {
    const g = groups.get(l.sellerKey) ?? { sellerKey: l.sellerKey, sellerName: l.sellerName, lines: [] };
    g.lines.push(l);
    groups.set(l.sellerKey, g);
  }
  return [...groups.values()];
}
