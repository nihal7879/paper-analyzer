import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/lib/theme";
import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminProvider } from "@/lib/admin";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false, retry: 1 } } }),
  );
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AdminProvider>
          <TooltipProvider>
            {children}
            <Toaster richColors position="top-center" />
          </TooltipProvider>
        </AdminProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
