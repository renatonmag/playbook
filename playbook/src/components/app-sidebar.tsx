import { For } from "solid-js";
import { A } from "@solidjs/router";
import SquareTerminal from "lucide-solid/icons/square-terminal";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "~/components/ui/sidebar";
import { NavPBDocuments } from "./nav-pb-documents";

const items = [
  {
    title: "Home",
    url: "#",
    icon: IconHome,
  },
  {
    title: "Inbox",
    url: "#",
    icon: IconMail,
  },
  {
    title: "Calendar",
    url: "#",
    icon: IconCalendar,
  },
  {
    title: "Search",
    url: "#",
    icon: IconSearch,
  },
  {
    title: "Settings",
    url: "#",
    icon: IconSettings,
  },
];

const navMain = [
  {
    title: "Playground",
    url: "#",
    icon: SquareTerminal,
    isActive: true,
    items: [
      {
        title: "History",
        url: "#",
      },
      {
        title: "Starred",
        url: "#",
      },
      {
        title: "Settings",
        url: "#",
      },
    ],
  },
];

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarContent>
        <NavPBDocuments items={navMain} />
      </SidebarContent>
    </Sidebar>
  );
}
