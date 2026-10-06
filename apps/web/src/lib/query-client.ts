import { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** One cache for the whole app (pages, the print view and the error screen share it). */
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } } });

export const BANK_QUERY = { queryKey: ["bank"], queryFn: api.bank, staleTime: 60_000 } as const;

/**
 * Start downloading the question bank immediately, in parallel with the page's code, instead of
 * waiting until the question list has loaded and asks for it.
 */
export function prefetchBankEarly() {
  const path = window.location.pathname;
  if (path === "/" || path === "/print") void queryClient.prefetchQuery(BANK_QUERY);
}
