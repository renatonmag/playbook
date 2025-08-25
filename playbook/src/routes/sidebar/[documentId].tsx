import { createEffect, For, Match, Show, Switch } from "solid-js";
import { A, useNavigate, useParams } from "@solidjs/router";
import Ellipsis from "lucide-solid/icons/ellipsis";
import NotepadText from "lucide-solid/icons/notebook-text";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarTrigger,
} from "~/components/ui/sidebar";
import {
  IconCalendar,
  IconChevronDown,
  IconHome,
  IconMail,
  IconRocket,
  IconSearch,
  IconSettings,
} from "~/components/icons";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Button } from "~/components/ui/button";
import { Icon } from "@kobalte/core/dropdown-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import Document from "~/components/document";
import { api } from "../../../convex/_generated/api";
import { useQuery } from "convex-solidjs";
import { createQuery } from "../../../cvxsolid";
import { useGlobalStore } from "~/stores/storeContext";

const items = [
  {
    title: "Ombro cabeça ombro",
    icon: IconRocket,
    url: "#",
    items: [
      {
        title: "Entrada",
        url: "#",
        icon: NotepadText,
      },
      {
        title: "Saida",
        url: "#",
        icon: NotepadText,
      },
      {
        title: "Observações",
        url: "#",
        icon: NotepadText,
      },
      {
        title: "Memória",
        url: "#",
        icon: NotepadText,
      },
      {
        title: "Prompts",
        url: "#",
        icon: NotepadText,
      },
    ],
  },
];

export default function AppSidebar(props: any) {
  // const query = useQuery(api.documents.get, { id: params.documentId });
  const navigate = useNavigate();
  const [gStore, actions] = useGlobalStore();
  const params = useParams();
  return (
    <SidebarProvider class="bg-gray-50">
      <Sidebar class="border-none " collapsible="icon">
        <SidebarHeader class="bg-white border-b-[6px] border-gray-50">
          <span class="font-mono ml-1.5">PLAYBOOK</span>
        </SidebarHeader>
        <SidebarContent class="bg-white">
          <SidebarGroup>
            <SidebarGroupLabel>Documentos</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <For each={items}>
                  {(item) => (
                    <Collapsible>
                      <SidebarMenuItem>
                        <CollapsibleTrigger class="w-full flex">
                          <SidebarMenuButton as={A} href={item.url}>
                            <item.icon />
                            <div>{item.title}</div>
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                as="span"
                                class="ml-auto cursor-pointer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Ellipsis class="size-5 " />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent class="w-48">
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const id =
                                      actions.createDocument("Untitled");
                                    navigate(`/sidebar/${id}`);
                                  }}
                                >
                                  <span>Create document</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span>Commit</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span>Push</span>
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </SidebarMenuButton>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <SidebarMenuSub>
                            <For each={gStore.documents.documents}>
                              {(doc) => (
                                <SidebarMenuSubItem>
                                  <SidebarMenuSubButton
                                    as={A}
                                    href={`/sidebar/${doc.id}`}
                                    isActive={params.documentId === doc.id}
                                  >
                                    <NotepadText />
                                    {doc.title}
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              )}
                            </For>
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  )}
                </For>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <div class="bg-white h-[42px]"></div>
        <div class="h-1.5 bg-gray-50"></div>
        <div class="flex bg-gray-50 border-l-[6px] h-full border-gray-50 gap-1.5">
          <div class="bg-white flex-2">
            <SidebarTrigger />
            <Document />
          </div>
          <div class="bg-white flex-1"></div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
