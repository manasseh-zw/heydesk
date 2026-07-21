import { useQuery } from "@tanstack/react-query";
import {
  File,
  FileText,
  FileUp,
  Folder,
  FolderOpen,
  Folders,
  Home,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { Button } from "@heydesk/ui/components/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@heydesk/ui/components/collapsible";
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
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@heydesk/ui/components/sidebar";

import { preloadDocumentView } from "@/features/document/components/lazy-document-view";
import { documentsQueryOptions } from "@/features/document/document.queries";
import type { DocumentSummary } from "@/features/document/document.types";
import { pagesQueryOptions } from "@/features/page/page.queries";
import type { PageSummary } from "@/features/page/page.types";
import type { WorkspaceSummary } from "../workspace.types";

type WorkspaceSidebarProps = {
  workspace: WorkspaceSummary;
  onCreateDocument: (name: string) => Promise<void>;
  onDeleteDocument: (path: string) => Promise<void>;
  onImportDocument: (file: File) => Promise<void>;
  onCreatePage: (name: string) => Promise<void>;
  onDeletePage: (path: string) => Promise<void>;
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
  onDeleteDocument,
  onImportDocument,
  onCreatePage,
  onDeletePage,
  onOpenPage,
  onOpenDocument,
  onOpenHome,
  onSwitchWorkspace,
  activePagePath,
  activeDocumentPath,
}: WorkspaceSidebarProps) {
  const { setOpen } = useSidebar();
  const isDesktop = Boolean(window.heydeskDesktop);
  const [query, setQuery] = useState("");
  const [creatingKind, setCreatingKind] = useState<
    "page" | "document" | null
  >(null);
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
        setOpen(true);
        window.requestAnimationFrame(() => {
          searchRef.current?.focus();
        });
      }
    };

    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [setOpen]);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className={isDesktop ? "gap-2 px-3 pb-3 pt-0" : "p-3"}>
        {isDesktop && (
          <div
            aria-hidden="true"
            className="h-12 shrink-0 [-webkit-app-region:drag]"
          />
        )}

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
                className="font-normal text-sidebar-foreground/85 data-active:font-normal"
                isActive={
                  activePagePath === null && activeDocumentPath === null
                }
                onClick={onOpenHome}
                tooltip="Home"
              >
                <Home strokeWidth={1.6} />
                <span>Home</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <ContentSection
          addLabel="Create page"
          items={filteredPages}
          label="Pages"
          creating={creatingKind === "page"}
          onAdd={() => setCreatingKind("page")}
          onCancelCreate={() => setCreatingKind(null)}
          onCreateItem={async (name) => {
            await onCreatePage(name);
            setCreatingKind(null);
          }}
          onOpen={onOpenPage}
          onDelete={onDeletePage}
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
              onImport={onImportDocument}
              onStartCreate={() => setCreatingKind("document")}
            />
          }
          creating={creatingKind === "document"}
          onAdd={() => undefined}
          onCancelCreate={() => setCreatingKind(null)}
          onCreateItem={async (name) => {
            await onCreateDocument(name);
            setCreatingKind(null);
          }}
          onOpen={onOpenDocument}
          onDelete={onDeleteDocument}
          onItemIntent={() => void preloadDocumentView()}
          activePath={activeDocumentPath}
          loading={documentsQuery.isPending}
          searchQuery={query}
        />
      </SidebarContent>

      <SidebarFooter>
        <Button
          className="w-full justify-start font-normal"
          onClick={onSwitchWorkspace}
          size="sm"
          title={`Current workspace: ${workspace.name}`}
          type="button"
          variant="ghost"
        >
          <Folders />
          Change workspace
        </Button>
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
  creating?: boolean;
  onCancelCreate?: () => void;
  onCreateItem?: (name: string) => Promise<void>;
  onOpen: (path: string) => void;
  onDelete?: (path: string) => Promise<void>;
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
  creating = false,
  onCancelCreate,
  onCreateItem,
  onOpen,
  onDelete,
  activePath,
  loading,
  searchQuery,
  onItemIntent,
}: ContentSectionProps) {
  const ItemIcon = document ? FileText : File;
  const [open, setOpen] = useState(true);
  const SectionIcon = open ? FolderOpen : Folder;

  useEffect(() => {
    if (creating) setOpen(true);
  }, [creating]);

  return (
    <Collapsible
      className="group/content-section"
      onOpenChange={setOpen}
      open={open}
    >
      <SidebarGroup>
        <SidebarGroupLabel
          className="gap-2 text-[13px] font-normal text-sidebar-foreground/65"
          render={<CollapsibleTrigger />}
        >
          <SectionIcon strokeWidth={1.5} />
          {label}
        </SidebarGroupLabel>
        {addControl ?? (
          <SidebarGroupAction
            aria-label={addLabel}
            onClick={onAdd}
            title={addLabel}
          >
            <Plus strokeWidth={1.5} />
          </SidebarGroupAction>
        )}
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {creating && onCancelCreate && onCreateItem && (
                <InlineCreateItem
                  document={document}
                  onCancel={onCancelCreate}
                  onCreate={onCreateItem}
                />
              )}
              {items.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    className="pl-7 font-normal text-sidebar-foreground/85 data-active:font-normal [&_svg]:text-sidebar-foreground/70"
                    isActive={activePath === item.path}
                    onClick={() => onOpen(item.path)}
                    onFocus={onItemIntent}
                    onPointerEnter={onItemIntent}
                    size="sm"
                    tooltip={item.path}
                  >
                    <ItemIcon strokeWidth={1.45} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                  {onDelete && (
                    <ContentItemActions
                      item={item}
                      kind={document ? "document" : "page"}
                      onDelete={onDelete}
                    />
                  )}
                </SidebarMenuItem>
              ))}
              {!creating && !loading && items.length === 0 && (
                <li className="px-7 py-2 text-xs text-muted-foreground">
                  {searchQuery ? "No matches" : `No ${label.toLowerCase()} yet`}
                </li>
              )}
              {loading && (
                <li className="px-7 py-2 text-xs text-muted-foreground">
                  Loading…
                </li>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  );
}

function ContentItemActions({
  item,
  kind,
  onDelete,
}: {
  item: NavigationItem;
  kind: "page" | "document";
  onDelete: (path: string) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDelete(item.path);
      setConfirming(false);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : `Could not delete ${kind}.`,
      );
      setBusy(false);
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <SidebarMenuAction
              aria-label={`${kind === "page" ? "Page" : "Document"} options for ${item.title}`}
              showOnHover
            />
          }
        >
          <MoreHorizontal className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-28 min-w-28 rounded-lg p-0.5"
        >
          <DropdownMenuItem
            className="gap-1.5 rounded-md px-1.5 py-1 text-xs font-normal [&_svg]:size-3"
            onClick={() => setConfirming(true)}
            variant="destructive"
          >
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{item.title}”?</DialogTitle>
            <DialogDescription>
              This permanently removes the {kind} and its assistant history
              from this workspace.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Cancel
            </DialogClose>
            <Button
              disabled={busy}
              onClick={() => void remove()}
              type="button"
              variant="destructive"
            >
              {busy ? "Deleting…" : `Delete ${kind}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
      `${item.title} ${item.path}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [items, query]);
}

function DocumentAddMenu({
  onImport,
  onStartCreate,
}: {
  onImport: (file: File) => Promise<void>;
  onStartCreate: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      await onImport(file);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Could not import document.",
      );
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
          disabled={busy}
          title="Add document"
        >
          <Plus className="size-4" strokeWidth={1.5} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-40 min-w-40 rounded-xl p-1"
          finalFocus={false}
        >
          <DropdownMenuItem
            className="gap-2 rounded-lg px-2 py-1.5 font-normal whitespace-nowrap [&_svg]:size-3.5"
            onClick={onStartCreate}
          >
            <FileText /> New document
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2 rounded-lg px-2 py-1.5 font-normal whitespace-nowrap [&_svg]:size-3.5"
            onClick={() => inputRef.current?.click()}
          >
            <FileUp /> Import document
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
      <Dialog
        open={Boolean(error)}
        onOpenChange={(open) => {
          if (!open) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Could not import document</DialogTitle>
            <DialogDescription>{error}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button type="button" variant="outline" />}>
              Close
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function InlineCreateItem({
  document,
  onCancel,
  onCreate,
}: {
  document: boolean;
  onCancel: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const ItemIcon = document ? FileText : File;

  useEffect(() => {
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, []);

  const commit = async () => {
    const nextName = name.trim();
    if (!nextName) {
      onCancel();
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onCreate(nextName);
    } catch (caught) {
      busyRef.current = false;
      setBusy(false);
      setError(
        caught instanceof Error
          ? caught.message
          : `Could not create ${document ? "document" : "page"}.`,
      );
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  };

  return (
    <SidebarMenuItem>
      <form
        className="flex min-w-0 items-center gap-2 pl-7 pr-2"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void commit();
        }}
      >
        <ItemIcon className="size-4 shrink-0" strokeWidth={1.45} />
        <Input
          aria-label={document ? "Document name" : "Page name"}
          autoFocus
          className="h-7 min-w-0 rounded-none border-0 bg-transparent px-0 text-sm shadow-none outline-none focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
          disabled={busy}
          maxLength={120}
          onBlur={() => {
            if (!busyRef.current) void commit();
          }}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          ref={inputRef}
          value={name}
        />
      </form>
      {error && (
        <p className="px-2 pt-1 pl-13 text-[11px] leading-4 text-destructive">
          {error}
        </p>
      )}
    </SidebarMenuItem>
  );
}
