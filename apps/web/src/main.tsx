import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, Outlet, redirect, RouterProvider, ScrollRestoration } from "react-router";
import "@fontsource-variable/geist";
// KaTeX styles: must be the same KaTeX version that rehype-katex renders with (0.16.x)
import "katex/dist/katex.css";
import "./index.css";
import { Providers } from "@/components/providers";
import { RouteError } from "@/components/route-error";
import { SimilarModalHost } from "@/components/similar-modal";
import { TopBar } from "@/components/top-bar";
import { Skeleton } from "@/components/ui/skeleton";


function Layout() {
  return (
    <Providers>
      <TopBar />
      <main className="mx-auto w-full max-w-7xl flex-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4 sm:px-4 sm:pt-4 sm:pb-8">
        <Outlet />
      </main>
      {/* Back/forward returns to the same scroll position; new pages start at the top */}
      <ScrollRestoration />
      <SimilarModalHost />
    </Providers>
  );
}

function PageLoading() {
  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-20">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-40 rounded-xl" />
    </div>
  );
}

const router = createBrowserRouter([
  // PDF layout: no top bar, white paper (the API prints this page to PDF)
  {
    path: "/print",
    element: (
      <Providers>
        <Outlet />
      </Providers>
    ),
    hydrateFallbackElement: <PageLoading />,
    children: [{ index: true, lazy: () => import("@/pages/print").then((m) => ({ Component: m.PrintPage })) }],
  },
  {
    element: <Layout />,
    errorElement: (
      <Providers>
        <TopBar />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
          <RouteError />
        </main>
      </Providers>
    ),
    hydrateFallbackElement: <PageLoading />,
    // Each page is its own chunk, so students never download the admin upload code.
    children: [
      { path: "/", lazy: () => import("@/pages/browse").then((m) => ({ Component: m.BrowsePage })) },
      { path: "/similar/:id", lazy: () => import("@/pages/similar").then((m) => ({ Component: m.SimilarPage })) },
      { path: "/admin/papers", lazy: () => import("@/pages/admin-papers").then((m) => ({ Component: m.AdminPapersPage })) },
      { path: "/admin/papers/:id", lazy: () => import("@/pages/review").then((m) => ({ Component: m.ReviewPage })) },
      { path: "/admin/upload", lazy: () => import("@/pages/upload").then((m) => ({ Component: m.UploadPage })) },
      // Admin entry point (password prompt if not signed in)
      { path: "/admin", loader: () => redirect("/admin/papers") },
      // Old link format from step 1
      { path: "/papers/:id", loader: ({ params }) => redirect(`/admin/papers/${params.id}`) },
      { path: "*", lazy: () => import("@/pages/not-found").then((m) => ({ Component: m.NotFoundPage })) },
    ],
  },
]);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
