import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  File,
  FileText,
  Home,
  Plus,
  Search,
  Settings,
} from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@heydesk/ui/components/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@heydesk/ui/components/sidebar";

import { LogoMark } from "@/components/logo";
import { artifactsQueryOptions } from "@/features/artifact/artifact.queries";
import type { ArtifactSummary } from "@/features/artifact/artifact.types";
import type { WorkspaceSummary } from "../workspace.types";

type WorkspaceSidebarProps = {
  workspace: WorkspaceSummary;
  onCreateDocument: () => void;
  onCreatePage: () => void;
  onOpenArtifact: (path: string) => void;
  onOpenHome: () => void;
  onSwitchWorkspace: () => void;
  activeArtifactPath: string | null;
};

export function WorkspaceSidebar({
  workspace,
  onCreateDocument,
  onCreatePage,
  onOpenArtifact,
  onOpenHome,
  onSwitchWorkspace,
  activeArtifactPath,
}: WorkspaceSidebarProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const artifactsQuery = useQuery(artifactsQueryOptions(workspace.id));
  const filteredPages = useFilteredItems(
    artifactsQuery.data?.filter((artifact) => artifact.kind === "page") ?? [],
    query,
  );
  const filteredDocuments = useFilteredItems(
    artifactsQuery.data?.filter((artifact) => artifact.kind === "document") ?? [],
    query,
  );

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-3 p-3">
        <button
          aria-label="Switch workspace"
          className="flex h-8 w-full items-center gap-2 overflow-hidden px-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          onClick={onSwitchWorkspace}
          type="button"
        >
          <LogoMark className="size-5 shrink-0 text-logo-mark" />
          <span className="truncate font-brand text-base font-semibold leading-5">
            Heydesk
          </span>
          <span className="sr-only">Current workspace: {workspace.name}</span>
        </button>

        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <SidebarInput
            ref={searchRef}
            className="border-sidebar-border bg-sidebar pl-8 pr-10 shadow-none focus-visible:border-ring"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            type="search"
            value={query}
          />
          <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[10px] text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeArtifactPath === null}
                onClick={onOpenHome}
                tooltip="Home"
              >
                <Home />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <ContentSection
          addLabel="Create page"
          items={filteredPages}
          label="Pages"
          onAdd={onCreatePage}
          onOpen={onOpenArtifact}
          activePath={activeArtifactPath}
          loading={artifactsQuery.isPending}
          searchQuery={query}
        />
        <ContentSection
          addLabel="Create document"
          document
          items={filteredDocuments}
          label="Documents"
          onAdd={onCreateDocument}
          onOpen={onOpenArtifact}
          activePath={activeArtifactPath}
          loading={artifactsQuery.isPending}
          searchQuery={query}
        />
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings">
              <Settings />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

type ContentSectionProps = {
  addLabel: string;
  document?: boolean;
  items: ArtifactSummary[];
  label: string;
  onAdd: () => void;
  onOpen: (path: string) => void;
  activePath: string | null;
  loading: boolean;
  searchQuery: string;
};

function ContentSection({
  addLabel,
  document = false,
  items,
  label,
  onAdd,
  onOpen,
  activePath,
  loading,
  searchQuery,
}: ContentSectionProps) {
  const ItemIcon = document ? FileText : File;

  return (
    <Collapsible className="group/content-section" defaultOpen>
      <SidebarGroup>
        <SidebarGroupLabel render={<CollapsibleTrigger />}>
          <ChevronRight className="transition-transform group-data-open/content-section:rotate-90" />
          {label}
        </SidebarGroupLabel>
        <SidebarGroupAction aria-label={addLabel} onClick={onAdd} title={addLabel}>
          <Plus />
        </SidebarGroupAction>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    className="pl-7"
                    isActive={activePath === item.path}
                    onClick={() => onOpen(item.path)}
                    size="sm"
                    tooltip={item.path}
                  >
                    <ItemIcon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {!loading && items.length === 0 && (
                <li className="px-7 py-2 text-xs text-muted-foreground">
                  {searchQuery ? "No matches" : `No ${label.toLowerCase()} yet`}
                </li>
              )}
              {loading && (
                <li className="px-7 py-2 text-xs text-muted-foreground">Loading…</li>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function useFilteredItems(items: ArtifactSummary[], query: string) {
  return useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) =>
      `${item.title} ${item.path}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [items, query]);
}
