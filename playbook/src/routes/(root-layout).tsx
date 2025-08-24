import { createSignal } from "solid-js";

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";

export default function RootLayout(props: any) {
  const [isCollapsed, setIsCollapsed] = createSignal(false);
  return (
    <SidebarProvider>
      <div class="flex flex-col">
        <div class="min-h-8 flex-1 bg-white"></div>
        {props.children}
      </div>
    </SidebarProvider>
  );
}
