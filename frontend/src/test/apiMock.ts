// Shared state for the apiRequest mock. Each test file mocks "shared/api/client" with:
//   vi.mock("<path>/shared/api/client", async (importOriginal) => {
//     const { mockApiClient } = await import("<path>/test/apiMock"); // inside the factory: vi.mock is hoisted
//     return mockApiClient(await importOriginal<object>());
//   });
// and sets `apiMock.user` (what /auth/me returns) plus optional `apiMock.responses`.
import { vi } from "vitest";
import type { CurrentUser } from "../shared/auth/AuthContext";

export const apiMock = {
  user: null as CurrentUser | null,
  responses: {} as Record<string, unknown>,
  calls: [] as string[],
  reset() {
    this.user = null;
    this.responses = {};
    this.calls = [];
  },
};

export function mockApiClient<T extends object>(actual: T) {
  return {
    ...actual,
    getToken: () => (apiMock.user ? "test-token" : null),
    setToken: vi.fn(),
    apiRequest: vi.fn(async (path: string) => {
      apiMock.calls.push(path);
      if (path === "/auth/me") return apiMock.user;
      const key = path.split("?")[0];
      return key in apiMock.responses ? apiMock.responses[key] : [];
    }),
  };
}
