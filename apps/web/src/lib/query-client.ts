import { QueryClient } from "@tanstack/react-query";

/** One cache for the whole app (pages, the print view and the error screen share it). */
export const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } } });
