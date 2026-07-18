import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  File,
  FileText,
  FileUp,
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
import { Button } from "@heydesk/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@heydesk/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@heydesk/ui/components/dropdown-menu";
import { Input } from "@heydesk/ui/components/input";

import { LogoMark } from "@/components/logo";
import { pagesQueryOptions } from "@/features/page/page.queries";
import type { PageSummary } from "@/features/page/page.types";
import { documentsQueryOptions } from "@/features/document/document.queries";
import { preloadDocumentView } from "@/features/document/components/lazy-document-view";
import type { DocumentSummary } from "@/features/document/document.types";
import type { WorkspaceSummary } from "../workspace.types";

type WorkspaceSidebarProps = {
  workspace: WorkspaceSummary;
  onCreateDocument: (name: string) => Promise<void>;
  onImportDocument: (file: File) => Promise<void>;
  onCreatePage: () => void;
  onOpenPage: (path: string) => void;
  onOpenDocument: (path: string) => void;
  onOpenHome: () => void;
  onSwitchWorkspace: () => void;
  activePagePath: string | null;
  activeDocumentPath: string | null;
};

export function WorkspaceSidebar({
  workspace,
  onCreateDocument,
  onImportDocument,
  onCreatePage,
  onOpenPage,
  onOpenDocument,
  onOpenHome,
  onSwitchWorkspace,
  activePagePath,
  activeDocumentPath,
}: WorkspaceSidebarProps) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const pagesQuery = useQuery(pagesQueryOptions(workspace.id));
  const documentsQuery = useQuery(documentsQueryOptions(workspace.id));
  const filteredPages = useFilteredItems(pagesQuery.data ?? [], query);
  const filteredDocuments = useFilteredItems(
    (documentsQuery.data ?? []).map(documentNavigationItem),
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
                isActive={activePagePath === null && activeDocumentPath === null}
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
          onOpen={onOpenPage}
          activePath={activePagePath}
          loading={pagesQuery.isPending}
          searchQuery={query}
        />
        <ContentSection
          addLabel="Create document"
          document
          items={filteredDocuments}
          label="Documents"
          addControl={
            <DocumentAddMenu
              onCreate={onCreateDocument}
              onImport={onImportDocument}
            />
          }
          onAdd={() => undefined}
          onOpen={onOpenDocument}
          onItemIntent={() => void preloadDocumentView()}
          activePath={activeDocumentPath}
          loading={documentsQuery.isPending}
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
  items: NavigationItem[];
  label: string;
  onAdd: () => void;
  addControl?: ReactNode;
  onOpen: (path: string) => void;
  activePath: string | null;
  loading: boolean;
  searchQuery: string;
  onItemIntent?: () => void;
};

function ContentSection({
  addLabel,
  document = false,
  items,
  label,
  onAdd,
  addControl,
  onOpen,
  activePath,
  loading,
  searchQuery,
  onItemIntent,
}: ContentSectionProps) {
  const ItemIcon = document ? FileText : File;

  return (
    <Collapsible className="group/content-section" defaultOpen>
      <SidebarGroup>
        <SidebarGroupLabel render={<CollapsibleTrigger />}>
          <ChevronRight className="transition-transform group-data-open/content-section:rotate-90" />
          {label}
        </SidebarGroupLabel>
        {addControl ?? (
          <SidebarGroupAction aria-label={addLabel} onClick={onAdd} title={addLabel}>
            <Plus />
          </SidebarGroupAction>
        )}
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    className="pl-7"
                    isActive={activePath === item.path}
                    onClick={() => onOpen(item.path)}
                    onFocus={onItemIntent}
                    onPointerEnter={onItemIntent}
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

type NavigationItem = Pick<PageSummary, "path" | "title">;

function documentNavigationItem(document: DocumentSummary): NavigationItem {
  return { path: document.path, title: document.name };
}

function useFilteredItems(items: NavigationItem[], query: string) {
  return useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return items;
    return items.filter((item) =>
      `${item.title} ${item.path}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [items, query]);
}

function DocumentAddMenu({
  onCreate,
  onImport,
}: {
  onCreate: (name: string) => Promise<void>;
  onImport: (file: File) => Promise<void>;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(name.trim());
      setDialogOpen(false);
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create document.");
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await onImport(file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not import document.");
      setDialogOpen(true);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Add document"
          className="absolute top-3.5 right-3 flex aspect-square w-5 items-center justify-center rounded-xl p-0 text-sidebar-foreground outline-hidden transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          title="Add document"
        >
          <Plus className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => setDialogOpen(true)}>
            <FileText /> New document
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => inputRef.current?.click()}>
            <FileUp /> Import Word document
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={inputRef}
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="sr-only"
        onChange={(event) => void importFile(event.target.files?.[0])}
        type="file"
      />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>New Word document</DialogTitle>
              <DialogDescription>Create an editable document in this workspace.</DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              className="mt-5"
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              placeholder="Document name"
              value={name}
            />
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
            <DialogFooter className="mt-6">
              <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
              <Button disabled={busy || !name.trim()} type="submit">
                {busy ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
