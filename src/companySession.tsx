/**
 * Business-portal session for the app (see convex/companySession.ts).
 *
 * loginCompany/register return a sessionToken. We keep it in AsyncStorage next
 * to the companyId, and the hooks below add it to every company-scoped call.
 * When the server says the session expired, `onExpired` sends the user back
 * to the business login.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAction, useMutation, useQueries } from 'convex/react';
import { getFunctionName } from 'convex/server';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { api } from '../convex/_generated/api';
import { convex } from './convex';

const ID_KEY = 'companyId';
const TOKEN_KEY = 'companySessionToken';

/** Must match SESSION_EXPIRED in convex/companySession.ts. */
const SESSION_EXPIRED = 'Your session has expired. Please log in again.';

export function isSessionExpired(err: unknown): boolean {
  const data = (err as any)?.data;
  if (typeof data === 'string') return data === SESSION_EXPIRED;
  const msg = err instanceof Error ? err.message : String((err as any)?.message ?? '');
  return msg.includes(SESSION_EXPIRED);
}

// ── Storage ──

export async function saveCompanySession(companyId: string, token: string) {
  await AsyncStorage.multiSet([
    [ID_KEY, companyId],
    [TOKEN_KEY, token],
  ]);
}

/**
 * The stored session if it is still valid on the server, else null.
 * Logins from before sessions existed (no token) count as logged out.
 * When offline we keep the stored session; calls will re-check it.
 */
export async function loadCompanySession(): Promise<{ companyId: string; token: string } | null> {
  const [[, companyId], [, token]] = await AsyncStorage.multiGet([ID_KEY, TOKEN_KEY]);
  if (!companyId || !token) {
    if (companyId) await clearCompanySession(false);
    return null;
  }
  try {
    const live = await convex.mutation(api.companies.resumeSession, { sessionToken: token });
    if (!live) {
      await clearCompanySession(false);
      return null;
    }
  } catch {
    // network error: optimistic
  }
  return { companyId, token };
}

export async function clearCompanySession(revoke = true) {
  if (revoke) {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token) convex.mutation(api.companies.logoutCompany, { sessionToken: token }).catch(() => {});
  }
  await AsyncStorage.multiRemove([ID_KEY, TOKEN_KEY]);
}

// ── Context ──

type Ctx = { token: string | null; onExpired: () => void };
const CompanySessionContext = createContext<Ctx>({ token: null, onExpired: () => {} });

export function CompanySessionProvider({
  token,
  onExpired,
  children,
}: Ctx & { children: React.ReactNode }) {
  const value = useMemo(() => ({ token, onExpired }), [token, onExpired]);
  return <CompanySessionContext.Provider value={value}>{children}</CompanySessionContext.Provider>;
}

// ── Session-aware Convex hooks (use for every company-scoped function) ──

type WithoutToken<F extends FunctionReference<any>> = Omit<FunctionArgs<F>, 'sessionToken'>;

export function useCompanyQuery<Q extends FunctionReference<'query'>>(
  query: Q,
  args: WithoutToken<Q> | 'skip'
): FunctionReturnType<Q> | undefined {
  const { token, onExpired } = useContext(CompanySessionContext);
  const argsKey = args === 'skip' ? 'skip' : JSON.stringify(args);
  // `api.x.y` is a new Proxy on every render; its name is stable. Keying the
  // memo on `query` itself re-subscribed every render (React error #301).
  const queryName = getFunctionName(query);
  const queries = useMemo(
    (): Record<string, { query: Q; args: FunctionArgs<Q> }> =>
      args === 'skip' || !token
        ? {}
        : { q: { query, args: { ...(args as object), sessionToken: token } as FunctionArgs<Q> } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [queryName, argsKey, token]
  );
  const result = useQueries(queries).q;
  const expired = result instanceof Error && isSessionExpired(result);
  const expiredRef = useRef(onExpired);
  expiredRef.current = onExpired;
  useEffect(() => {
    if (expired) expiredRef.current();
  }, [expired]);
  if (result instanceof Error) {
    if (expired) return undefined;
    throw result;
  }
  return result as FunctionReturnType<Q> | undefined;
}

function useWithToken<F extends FunctionReference<'mutation' | 'action'>>(
  call: (args: FunctionArgs<F>) => Promise<FunctionReturnType<F>>
) {
  const { token, onExpired } = useContext(CompanySessionContext);
  return useCallback(
    async (args: WithoutToken<F>): Promise<FunctionReturnType<F>> => {
      try {
        return await call({ ...(args as object), sessionToken: token ?? undefined } as FunctionArgs<F>);
      } catch (err) {
        if (isSessionExpired(err)) onExpired();
        throw err;
      }
    },
    [call, token, onExpired]
  );
}

export function useCompanyMutation<M extends FunctionReference<'mutation'>>(mutation: M) {
  return useWithToken<M>(useMutation(mutation) as any);
}

export function useCompanyAction<A extends FunctionReference<'action'>>(action: A) {
  return useWithToken<A>(useAction(action) as any);
}
