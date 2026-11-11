import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { OrdersPage } from "./OrdersPage";
import { renderWithAuth } from "../test/render";
import { apiMock } from "../test/apiMock";
import { seededUser } from "../test/seedRoles";
import { formatPrice } from "./orders/posLabels";

vi.mock("../shared/api/client", async (importOriginal) => {
  const { mockApiClient } = await import("../test/apiMock");
  return mockApiClient(await importOriginal<object>());
});

const PAGE_RENDER_TIMEOUT_MS = 4000;

function menuItem(id: string, name: string, price: number, talabatPrice?: number) {
  return {
    id, kind: "item", categoryId: "c1", name, description: null, imageUrl: null, isBest: false, isActive: true,
    variants: [{ id: `${id}-v`, label: "عادي", price, ...(talabatPrice === undefined ? {} : { talabatPrice }) }],
  };
}

function tile(name: string) {
  return screen.findByRole("button", { name: new RegExp(`^[0-9 ]*${name}`) }, { timeout: PAGE_RENDER_TIMEOUT_MS });
}

async function renderPos() {
  renderWithAuth(<OrdersPage />, { user: seededUser("cashier"), route: "/orders" });
  await tile("فطير جبنة");
}

const TALABAT_MENU = "منيو طلبات";
const CONFIRM = "تفريغ السلة والتحويل";

beforeEach(() => {
  apiMock.reset();
  apiMock.responses = {
    "/catalog/layout": { combosPosition: 99 },
    "/catalog/categories": [{ id: "c1", name: "فطير", displayOrder: 1, menuGroup: "regular", isActive: true }],
    "/catalog/items": [menuItem("i1", "فطير جبنة", 50, 60), menuItem("i2", "بيبسي", 20)],
    "/catalog/combos": [{ id: "k1", name: "عرض العيلة", price: 100, isActive: true, items: [] }],
  };
});

describe("POS Talabat menu", () => {
  it("shows the normal prices until the Talabat menu is chosen", async () => {
    await renderPos();
    expect(await tile("فطير جبنة")).toHaveTextContent(formatPrice(50));

    fireEvent.click(screen.getByRole("button", { name: TALABAT_MENU }));

    await waitFor(async () => expect(await tile("فطير جبنة")).toHaveTextContent(formatPrice(60)));
    expect(screen.queryByText(CONFIRM)).not.toBeInTheDocument();
  });

  it("disables items cached before they had a Talabat price and hides the combos", async () => {
    await renderPos();
    expect(screen.getByRole("button", { name: "العروض" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: TALABAT_MENU }));

    await waitFor(async () => expect(await tile("بيبسي")).toBeDisabled());
    expect(screen.queryByRole("button", { name: "العروض" })).not.toBeInTheDocument();
  });

  it("asks before switching with items in the cart and keeps them on cancel", async () => {
    await renderPos();
    fireEvent.click(await tile("فطير جبنة"));
    expect(screen.getByText("السلة (1)")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: TALABAT_MENU }));
    fireEvent.click(await screen.findByRole("button", { name: "إلغاء" }));

    expect(screen.getByText("السلة (1)")).toBeInTheDocument();
    expect(await tile("فطير جبنة")).toHaveTextContent(formatPrice(50));
  });

  it("empties the cart when the switch is confirmed, in both directions", async () => {
    await renderPos();
    fireEvent.click(await tile("فطير جبنة"));

    fireEvent.click(screen.getByRole("button", { name: TALABAT_MENU }));
    fireEvent.click(await screen.findByRole("button", { name: CONFIRM }));

    expect(await screen.findByText("السلة فاضية")).toBeInTheDocument();
    expect(await tile("فطير جبنة")).toHaveTextContent(formatPrice(60));

    fireEvent.click(await tile("فطير جبنة"));
    expect(screen.getByText("السلة (1)")).toBeInTheDocument();
    expect(screen.getAllByText(formatPrice(60)).length).toBeGreaterThan(1);

    fireEvent.click(screen.getByRole("button", { name: TALABAT_MENU }));
    fireEvent.click(await screen.findByRole("button", { name: CONFIRM }));

    expect(await screen.findByText("السلة فاضية")).toBeInTheDocument();
    expect(await tile("فطير جبنة")).toHaveTextContent(formatPrice(50));
  });
});

describe("POS addons", () => {
  const cheeseAddon = {
    id: "a1", kind: "addon", categoryId: null, name: "جبنة زيادة", description: null, imageUrl: null, isBest: false, isActive: true,
    variants: [{ id: "a1-v", label: "عادي", price: 15, talabatPrice: 20 }],
  };

  beforeEach(() => {
    apiMock.responses["/catalog/items?kind=addon"] = [cheeseAddon];
  });

  it("opens the addons for the item just added and adds them to that line", async () => {
    await renderPos();
    fireEvent.click(await tile("فطير جبنة"));

    expect(await screen.findByText("إضافات على")).toBeInTheDocument();
    fireEvent.click(await tile("جبنة زيادة"));
    fireEvent.click(await tile("جبنة زيادة"));

    expect(screen.getByText("+ جبنة زيادة")).toBeInTheDocument();
    expect(screen.getAllByText(formatPrice(80)).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "تم" }));
    expect(await tile("بيبسي")).toBeInTheDocument();
    expect(screen.queryByText("إضافات على")).not.toBeInTheDocument();
  });

  it("keeps a line with addons apart from a new tap on the same item", async () => {
    await renderPos();
    fireEvent.click(await tile("فطير جبنة"));
    fireEvent.click(await tile("جبنة زيادة"));
    fireEvent.click(screen.getByRole("button", { name: "تم" }));

    fireEvent.click(await tile("فطير جبنة"));
    expect(screen.getByText("السلة (2)")).toBeInTheDocument();
  });
});
