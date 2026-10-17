import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../shared/auth/AuthContext";
import type { CurrentUser } from "../shared/auth/AuthContext";
import { apiMock } from "./apiMock";

// Renders `ui` inside the real AuthProvider (which loads `user` through the mocked /auth/me), a fresh
// QueryClient and a MemoryRouter at `route`.
export function renderWithAuth(ui: ReactElement, { user, route = "/" }: { user: CurrentUser | null; route?: string }) {
  apiMock.user = user;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <AuthProvider>{ui}</AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
