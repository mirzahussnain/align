// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Sidebar from "@/features/dashboard/components/Sidebar";
import { useDashboardStore } from "@/shared/stores/dashboard-store";

const navigation = vi.hoisted(() => ({ pathname: "/dashboard" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/shared/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}));

vi.mock("@/features/dashboard/components/profile/ProfileSwitcher", () => ({
  default: () => <div data-testid="profile-switcher" />,
}));

const props = {
  user: { name: "Hussnain Ali", email: "user@example.test" },
  tier: "free",
  profiles: [],
  activeProfileId: "",
  maxProfiles: 1,
};

const currentItems = () =>
  Array.from(document.querySelectorAll('[aria-current="page"]')).map(
    (element) => element.textContent?.trim() ?? "",
  );

beforeEach(() => {
  cleanup();
  useDashboardStore.setState({ tab: "overview" });
});

afterEach(() => cleanup());

describe("Sidebar active state", () => {
  it("marks only the store tab while the dashboard route is showing", () => {
    navigation.pathname = "/dashboard";

    render(<Sidebar {...props} />);

    expect(currentItems()).toEqual(["Overview"]);
  });

  it("marks only the tool link on a route-backed tool, not the last dashboard tab", () => {
    navigation.pathname = "/dashboard/jobs";

    render(<Sidebar {...props} />);

    expect(currentItems()).toEqual(["Job Board"]);
  });

  it("keeps the tool link current on its nested routes", () => {
    navigation.pathname = "/dashboard/jobs/snapshot-42";

    render(<Sidebar {...props} />);

    expect(currentItems()).toEqual(["Job Board"]);
  });
});
