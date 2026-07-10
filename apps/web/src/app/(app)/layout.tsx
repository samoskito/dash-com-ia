import { Suspense, type ReactNode } from "react";
import { AppShell } from "../../components/app-shell";
import { WorkspaceAccessGate } from "../../components/workspace-access-gate";
import ProductRouteLoading from "./loading";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <AppShell workspace={null}>
          <ProductRouteLoading />
        </AppShell>
      }
    >
      <WorkspaceAccessGate>{children}</WorkspaceAccessGate>
    </Suspense>
  );
}
