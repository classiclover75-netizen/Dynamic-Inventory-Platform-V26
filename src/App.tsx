import { shouldDisableImagePreviewActions } from "./lib/imagePreviewActions";
import { RetiredSourcesOverviewModal } from "./components/RetiredSourcesOverviewModal";
import { setPageVersion } from './lib/pageVersion';
import { ActiveSourcesOverviewModal } from "./components/ActiveSourcesOverviewModal";
import React, { useState, useMemo, useEffect, useRef, useCallback, useDeferredValue } from "react";

import { createPortal } from "react-dom";
import {
  Settings,
  Plus,
  X,
  Trash2,
  RefreshCw,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Lock,
  Undo2,
  Redo2,
  History,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  useReactTable,
  getCoreRowModel,
} from "@tanstack/react-table";
import {
  DragDropContext,
  Droppable,
  Draggable,
  DropResult,
} from "@hello-pangea/dnd";
import { Button, Input } from "./components/ui";
import { ModalStackProvider } from './lib/modalStack';
import { ToastProvider, useToast } from "./components/ToastProvider";
import { CopyPopupNotification } from "./components/CopyPopupNotification";
import { CreatePageModal } from "./components/CreatePageModal";
import { AddRowModal } from "./components/AddRowModal";
import { BulkApplySourceModal } from "./components/BulkApplySourceModal";
import { ActivePageSettingsModal } from "./components/ActivePageSettingsModal";
import { ManageTrackerColumnsModal } from "./components/ManageTrackerColumnsModal";
import { RelinkTrackerModal } from "./components/RelinkTrackerModal";
import { StorageModeBanner } from './components/StorageModeBanner';
import { TrackerLinkStatusBanner } from "./components/TrackerLinkStatusBanner";
import { checkTrackerLinkHealth } from "./lib/trackerLinkHealth";
import { RenamePageModal } from "./components/RenamePageModal";
import { CreateColumnModal } from "./components/CreateColumnModal";
import { EditColumnModal } from "./components/EditColumnModal";
import { ConfirmationModal } from "./components/ConfirmationModal";
import { DeletePageModal } from "./components/DeletePageModal";
import { ImagePreviewModal } from "./components/ImagePreviewModal";
import { ReorderPagesModal } from "./components/ReorderPagesModal";
import { ReorderSearchBarsModal } from "./components/ReorderSearchBarsModal";
import { ExcelImportModal } from "./components/ExcelImportModal";
import { ExcelExportModal } from "./components/ExcelExportModal";
import { ExportChoiceModal } from "./components/ExportChoiceModal";
import { DuplicateFinderModal } from "./components/DuplicateFinderModal";
import { GlobalCombinationCopyBoxes } from "./components/GlobalCombinationCopyBoxes";
import { GlobalCopyBoxesSettingsModal } from "./components/GlobalCopyBoxesSettingsModal";
import { QuickRangePanel } from "./components/QuickRangePanel";
import { TopHeaderBar } from "./components/TopHeaderBar";
import { PageTabsBar } from "./components/PageTabsBar";
import { SearchBarsSection } from "./components/SearchBarsSection";
import { useImportExport } from "./hooks/useImportExport";
import { useTrackerActions } from "./hooks/useTrackerActions";
import { useTrackerSourcePreload } from "./hooks/useTrackerSourcePreload";
import { useTableHover } from "./hooks/useTableHover";
import { useSaveActions } from "./hooks/useSaveActions";
import { useInlineEdit } from "./hooks/useInlineEdit";
import { useSourceColorSync } from "./hooks/useSourceColorSync";
import { filterAndSortTrackerRows } from "./lib/trackerSortUtils";
import { findAllLinkedTrackers, buildTrackerOrder } from "./lib/trackerOrderSync";
import { createPageSafe, renamePageSafe, deletePageSafe } from "./lib/pageMutations";
import { TableView } from "./components/TableView";
import { ColumnResizeHandle } from "./components/ColumnResizeHandle";
import { CreateTrackerSelectionModal } from "./components/CreateTrackerSelectionModal";
import { decodeHtmlEntities, renderHighlightedText, parseMultiSource } from "./lib/appUtils";
import { savePageConfig, patchRow, deleteRow, putRows, appendPageRows, bulkPatchRows } from "./lib/api";
import { renamePageRefs, cleanDeletedPageRefs } from "./lib/pageRefSync";
import {
  AppState,
  Column,
  PageConfig,
  RowData,
} from "./types";

const initialConfig: PageConfig = {
  rowReorderEnabled: false,
  hoverPreviewEnabled: false,
  columns: [
    {
      key: "sr",
      name: "Row No.",
      type: "system_serial" as const,
      locked: true,
      movable: false,
    },
  ],
};





function AppContent() {
  const [state, setState] = useState<AppState>({
    pages: [],
    activePage: "",
    pageConfigs: {},
    pageRows: {},
    globalRowNoWidth: 100,
    sourceSuggestionsEnabled: false,
    pageLinks: {},
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{
    message: string;
    percent: number | null;
  }>({ message: "Verifying and packaging backup, please wait...", percent: null });
  const [clearDBModal, setClearDBModal] = useState({
    isOpen: false,
    step: 1,
    yesLeft: true,
  });
  const [maxSearchHistory, setMaxSearchHistory] = useState(10);
  const [showHistoryLimitModal, setShowHistoryLimitModal] = useState(false);
  const [tempHistoryLimit, setTempHistoryLimit] = useState(10);
  const [trackerSelectionModalSource, setTrackerSelectionModalSource] =
    useState<string | null>(null);

  const [localSettings, setLocalSettings] = useState({ ghostHighlight: false });

  useEffect(() => {
    const saved = localStorage.getItem("inventory_local_settings");
    if (saved) {
      setLocalSettings(JSON.parse(saved));
    }
  }, []);

  const handleUpdateLocalSetting = (key: "ghostHighlight", value: boolean) => {
    const newSettings = { ...localSettings, [key]: value };
    setLocalSettings(newSettings);
    localStorage.setItem(
      "inventory_local_settings",
      JSON.stringify(newSettings),
    );
    toast(`${key} updated for this device`);
  };

  const handleClearEntireDB = async () => {
    try {
      const response = await fetch("/api/admin/hard-clear", {
        method: "POST"
      });
      if (!response.ok) {
        throw new Error("Server rejected hard-clear request");
      }
      const result = await response.json();
      if (!result.success) {
        throw new Error("Server reported failure clearing database");
      }
      
      toast("Database cleared completely!");
      setState((prev) => ({
        ...prev,
        pages: [],
        pageConfigs: {},
        pageRows: {},
        activePage: "",
      }));
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      console.error(err);
      toast("Failed to clear database");
    }
  };

  const getImageUrl = (val: any, isThumb = false) => {
    if (!val) return "";
    const imgData = typeof val === "object" && val !== null ? val.data : val;
    if (!imgData) return "";

    if (
      typeof imgData === "string" &&
      (imgData.startsWith("data:image") || /^https?:\/\//i.test(imgData))
    ) {
      if (isThumb && imgData.includes('/uploads/')) {
        const filename = imgData.split('/uploads/').pop()?.split('?')[0];
        if (filename) return `/uploads/thumb/${filename}`;
      }
      return imgData;
    }

    if (typeof imgData === "string" && imgData.startsWith("/uploads/")) {
      if (isThumb) {
        const filename = imgData.split('/uploads/').pop()?.split('?')[0];
        if (filename) return `/uploads/thumb/${filename}`;
      }
      return imgData;
    }

    return isThumb ? `/uploads/thumb/${imgData}` : `/uploads/${imgData}`;
  };

  const { handleTableMouseOver, handleTableMouseOut } = useTableHover();

  useEffect(() => {
    fetch("/api/state")
      .then(async (res) => {
        if (!res.ok) throw new Error("Server returned " + res.status);
        const text = await res.text();
        try {
          return JSON.parse(text);
        } catch (e) {
          throw new Error("Invalid JSON response");
        }
      })
      .then((data) => {
        if (data && !data.error) {
          const urlParams = new URLSearchParams(window.location.search);
          const urlPage = urlParams.get("page");
          const isValidPage =
            urlPage && data.pages && data.pages.includes(urlPage);

          setState((prev) => ({
            ...prev,
            pages: data.pages || [],
            globalRowNoWidth: data.globalRowNoWidth || prev.globalRowNoWidth,
            globalCopyBoxes: data.globalCopyBoxes !== undefined ? data.globalCopyBoxes : prev.globalCopyBoxes,
            sourceSuggestionsEnabled: data.sourceSuggestionsEnabled ?? prev.sourceSuggestionsEnabled,
            pageLinks: data.pageLinks || {},
            activePage: isValidPage
              ? urlPage
              : data.pages && data.pages.length > 0 && !prev.activePage
                ? data.pages[0]
                : prev.activePage,
          }));
          if (data.maxSearchHistory) setMaxSearchHistory(data.maxSearchHistory);
        }
      })
      .catch((err) => console.error("Failed to fetch initial state:", err))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (state.activePage) {
      window.history.replaceState(
        null,
        "",
        "?page=" + encodeURIComponent(state.activePage),
      );
    }
  }, [state.activePage]);

  const fetchPageData = React.useCallback(async (pageName: string) => {
    try {
      const res = await fetch(`/api/pages/${encodeURIComponent(pageName)}`);
      let data: any = {}; try { data = await res.json(); } catch(e) {}
      if (data && !data.error) {
        setPageVersion(data.name, data.rowsVersion);
        setState((prev) => ({
          ...prev,
          pageConfigs: {
            ...prev.pageConfigs,
            [data.name]: data.config,
          },
          pageRows: {
            ...prev.pageRows,
            [data.name]: data.rows,
          },
        }));
        return { config: data.config, rows: data.rows, name: data.name };
      }
    } catch (err) {
      console.error("Failed to fetch page data:", err);
    }
    return null;
  }, []);

  const loadSourcePageIfNeeded = React.useCallback(async (sourcePageName: string) => {
    if (!sourcePageName) return null;
    let config = state.pageConfigs[sourcePageName];
    let rows = state.pageRows[sourcePageName];
    if (config && rows) return { config, rows, name: sourcePageName };
    
    const targetName = sourcePageName.trim().toLowerCase();
    const actualName = state.pages.find(p => p.trim().toLowerCase() === targetName);
    
    if (actualName) {
      setIsLoading(true);
      const res = await fetchPageData(actualName);
      setIsLoading(false);
      return res;
    }
    return null;
  }, [state.pageConfigs, state.pageRows, state.pages, fetchPageData]);

  useEffect(() => {
    if (!state.activePage) return;

    const oldFetchPageData = async (pageName: string) => {
      try {
        const res = await fetch(`/api/pages/${encodeURIComponent(pageName)}`);
        let data: any = {}; try { data = await res.json(); } catch(e) {}
        if (data && !data.error) {
          setPageVersion(data.name, data.rowsVersion);
          setState((prev) => ({
            ...prev,
            pageConfigs: {
              ...prev.pageConfigs,
              [data.name]: data.config,
            },
            pageRows: {
              ...prev.pageRows,
              [data.name]: data.rows,
            },
          }));
          return data.config;
        }
      } catch (err) {
        console.error("Failed to fetch page data:", err);
      }
      return null;
    };

    const loadData = async () => {
      let activeConfig = state.pageConfigs[state.activePage];

      if (!activeConfig) {
        setIsLoading(true);
        activeConfig = await oldFetchPageData(state.activePage);
      }

      if (
        activeConfig &&
        activeConfig.secondarySearchPage &&
        !state.pageConfigs[activeConfig.secondarySearchPage]
      ) {
        setIsLoading(true);
        await oldFetchPageData(activeConfig.secondarySearchPage);
      }

      setIsLoading(false);
    };

    const activeConfig = state.pageConfigs[state.activePage];
    if (
      !activeConfig ||
      (activeConfig.secondarySearchPage &&
        !state.pageConfigs[activeConfig.secondarySearchPage])
    ) {
      loadData();
    }
  }, [state.activePage, state.pageConfigs]);




  const [activePopupId, setActivePopupId] = useState<string | null>(null);
  const [activeAnchor, setActiveAnchor] = useState<HTMLElement | null>(null);

  const [pageSearchQueries, setPageSearchQueries] = useState<
    Record<string, string>
  >({});
  const [primarySearchTags, setPrimarySearchTags] = useState<string[]>([]);
  const [secondarySearchTags, setSecondarySearchTags] = useState<string[]>([]);
  const currentSearch = pageSearchQueries[state.activePage] || "";
  const deferredSearch = useDeferredValue(currentSearch);
  const [secondarySearchQuery, setSecondarySearchQuery] = useState("");
  const deferredSecondarySearch = useDeferredValue(secondarySearchQuery);
  const [activeSearchView, setActiveSearchView] = useState<
    "primary" | "secondary"
  >("primary");
  const [showTopSettings, setShowTopSettings] = useState(false);
  const [isDupModalOpen, setIsDupModalOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);


  const pendingSavesRef = useRef(0);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pendingSavesRef.current > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  const activeSecPage =
    state.pageConfigs[state.activePage]?.secondarySearchPage;

  const handleClosePopup = React.useCallback(() => {
    setActivePopupId(null);
  }, []);

  const [importProgress, setImportProgress] = useState<{
    message: string;
    percent: number | null;
    currentFile: string | null;
  }>({ message: "Processing...", percent: null, currentFile: null });

  const {
    handleExportData,
    handleVerifiedExport,
    handleImportPageData,
    handleImportData,
    refetchAndHydrateState,
  } = useImportExport({
    state,
    setState,
    toast,
    maxSearchHistory,
    setMaxSearchHistory,
    setIsExporting,
    setExportProgress,
    setIsImporting,
    setImportProgress,
    fileInputRef,
  });
  const [trackerFilter, setTrackerFilter] = useState<
    "all" | "low" | "zero" | "high"
  >("all");
  const [activeFilterSaleCol, setActiveFilterSaleCol] = useState<string | null>(
    null,
  );
  const [trackerSort, setTrackerSort] = useState<"none" | "high" | "low">(
    "none",
  );
  const [trackerQtySort, setTrackerQtySort] = useState<
    "none" | "total_high" | "total_low" | "remaining_high" | "remaining_low"
  >("none");
  const [showArchived, setShowArchived] = useState(false);
  const [inlineEdit, setInlineEdit] = useState<{
    id: string;
    colKey: string;
    val: string;
    history?: string[];
    historyPointer?: number;
  } | null>(null);
  const [isSalePromptOpen, setIsSalePromptOpen] = useState(false);
  const [isSumModalOpen, setIsSumModalOpen] = useState(false);
  const [sumStartCol, setSumStartCol] = useState<string>("");
  const [sumEndCol, setSumEndCol] = useState<string>("");
  const [sumStartSearchQuery, setSumStartSearchQuery] = useState("");
  const [sumEndSearchQuery, setSumEndSearchQuery] = useState("");
  const [activeCustomSum, setActiveCustomSum] = useState<{
    startName: string;
    endName: string;
    keys: string[];
    selectedSources: string[];
  } | null>(null);
  const [sumSelectedSources, setSumSelectedSources] = useState<string[]>([]);
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);
  const [isRetiredSourcesOverviewOpen, setRetiredSourcesOverviewOpen] = useState(false);
  const [retiredOverviewFilterSources, setRetiredOverviewFilterSources] = useState<string[] | null>(null);
  const [isActiveSourcesOverviewOpen, setActiveSourcesOverviewOpen] = useState(false);
  const [activeOverviewFilterSources, setActiveOverviewFilterSources] = useState<string[] | null>(null);
  const [isRetiredOverviewStandalone, setIsRetiredOverviewStandalone] = useState(false);
  const [isArchiveDeleteModalOpen, setIsArchiveDeleteModalOpen] =
    useState(false);
  const [archiveDeleteSearchQuery, setArchiveDeleteSearchQuery] = useState("");
  const [archiveSearchQuery, setArchiveSearchQuery] = useState("");
  const [customSaleName, setCustomSaleName] = useState("");
  const [selectedArchiveCols, setSelectedArchiveCols] = useState<Set<string>>(
    new Set(),
  );
  const [archiveBulkDeleteConfirm, setArchiveBulkDeleteConfirm] = useState<{
    type: "normal" | "smart";
    step: number;
  } | null>(null);


  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setShowTopSettings(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const handleGlobalUndoPrevent = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "z" || e.key === "Z" || e.key === "y" || e.key === "Y")
      ) {
        const target = e.target as HTMLElement;
        // Block native undo completely if the user is NOT actively focused on an input.
        // This stops background inputs from reverting when clicking on empty space.
        if (
          target.tagName !== "INPUT" &&
          target.tagName !== "TEXTAREA" &&
          !target.isContentEditable
        ) {
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handleGlobalUndoPrevent, true);
    return () =>
      window.removeEventListener("keydown", handleGlobalUndoPrevent, true);
  }, []);

  // Modals state
  const [modals, setModals] = useState({
    createPage: false,
    addRow: false,
    activePageSettings: false,
    renamePage: false,
    createColumn: false,
    imagePreview: false,
    editColumn: false,
    reorderPages: false,
    reorderSearchBars: false,
    excelImport: false,
    excelExport: false,
    exportChoice: false,
    globalCopyBoxesSettings: false,
    manageTrackerColumns: false,
    bulkApplySource: false,
    relinkTracker: false,
  });

  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingPageName, setEditingPageName] = useState<string | null>(null);
  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [isDeletePageModalOpen, setIsDeletePageModalOpen] = useState(false);
  const [bulkApplyContext, setBulkApplyContext] = useState<{pageName: string, colKey: string, sourceName: string, sourceColor: string} | null>(null);
  const [pendingTrackerSync, setPendingTrackerSync] = useState<string | null>(null);
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    onConfirm: () => void;
  } | null>(null);
  const [previewContext, setPreviewContext] = useState<{
    rowId: string;
    imageKey: string;
    pageName: string;
    disableActions?: boolean;
  } | null>(null);
  const [returnToSettings, setReturnToSettings] = useState(false);
  const [returnToImagePreview, setReturnToImagePreview] = useState(false);
  const primParentRef = useRef<HTMLDivElement>(null);
  const [hoveredImage, setHoveredImage] = useState<{
    url: string;
    x: number;
    y: number;
  } | null>(null);

  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [excelImportData, setExcelImportData] = useState<{
    rows: any[];
    headers: string[];
  }>({ rows: [], headers: [] });
  const [box1Value, setBox1Value] = useState("");
  const [box2Value, setBox2Value] = useState("");

  useEffect(() => {
    setSelectedRowIds(new Set());
  }, [state.activePage]);

  const handleToggleMagicPasteColumn = (colKey: string) => {
    setState((prev) => {
      const pageConfig = prev.pageConfigs[prev.activePage];
      if (!pageConfig || !pageConfig.columns) return prev;

      const updatedColumns = pageConfig.columns.map((col) =>
        col.key === colKey
          ? { ...col, magicPasteDisabled: !col.magicPasteDisabled }
          : col,
      );

      return {
        ...prev,
        pageConfigs: {
          ...prev.pageConfigs,
          [prev.activePage]: {
            ...pageConfig,
            columns: updatedColumns,
          },
        },
      };
    });
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const sourceIdx = result.source.index;
    const destIdx = result.destination.index;
    if (sourceIdx === destIdx) return;

    const draggedRowId = result.draggableId;
    const targetPage = state.activePage;
    const rows = [...(state.pageRows[targetPage] || [])];
    const isMultiDrag =
      selectedRowIds.has(draggedRowId) && selectedRowIds.size > 1;
    let newRows: RowData[] = [];

    if (isMultiDrag) {
      const selectedRows = rows.filter((r) => selectedRowIds.has(r.id));
      const remainingRows = rows.filter((r) => !selectedRowIds.has(r.id));

      let insertIdx = destIdx;
      if (sourceIdx < destIdx) {
        insertIdx = destIdx - selectedRows.length + 1;
      }

      remainingRows.splice(insertIdx, 0, ...selectedRows);
      newRows = remainingRows;
    } else {
      const draggedIdx = rows.findIndex((r) => r.id === draggedRowId);
      if (draggedIdx === -1) return;

      const [draggedRow] = rows.splice(draggedIdx, 1);
      rows.splice(destIdx, 0, draggedRow);
      newRows = rows;
    }

    try {
      await bulkPatchRows(targetPage, { order: newRows.map(r => r.id) });

      const linkedTrackers = findAllLinkedTrackers(targetPage, state.pageConfigs, state.pageLinks);
      const trackerUpdates: Record<string, RowData[]> = {};

      await Promise.allSettled(
        linkedTrackers.map(async (trackerName) => {
          const trackerRows = state.pageRows[trackerName] || [];
          if (trackerRows.length > 0) {
            const order = buildTrackerOrder(newRows, trackerRows);
            if (order.length === 0) return;

            await bulkPatchRows(trackerName, { order }, true);

            const trackerRowMap = new Map(trackerRows.map(r => [String(r.id), r]));
            const newTrackerRows = order
              .map(idStr => trackerRowMap.get(idStr))
              .filter((r): r is RowData => Boolean(r));

            trackerUpdates[trackerName] = newTrackerRows;
          } else {
            const order = newRows.map(r => String(r.id || '')).filter(id => Boolean(id));
            if (order.length === 0) return;
            await bulkPatchRows(trackerName, { order }, true);
            return;
          }
        })
      );

      setState((prev) => ({
        ...prev,
        pageRows: {
          ...prev.pageRows,
          [targetPage]: newRows,
          ...trackerUpdates,
        },
      }));
    } catch (err) {
      console.error(err);
      toast("Failed to save reordered rows to database");
    }
  };

  const toggleModal = React.useCallback(
    (modal: keyof typeof modals, value: boolean) => {
      setModals((prev) => ({ ...prev, [modal]: value }));
    },
    [],
  );

  const closeAllModals = React.useCallback(() => {
    setModals({
      createPage: false,
      addRow: false,
      activePageSettings: false,
      renamePage: false,
      createColumn: false,
      editColumn: false,
      imagePreview: false,
      reorderPages: false,
      reorderSearchBars: false,
      excelImport: false,
      excelExport: false,
      exportChoice: false,
      globalCopyBoxesSettings: false,
      bulkApplySource: false,
      manageTrackerColumns: false,
    });
    setEditingRowId(null);
    setEditingPageName(null);
    setEditingColumn(null);
    setPreviewContext(null);
    setReturnToSettings(false);
    setReturnToImagePreview(false);
  }, []);

  const rawActiveConfig = state.pageConfigs[state.activePage] || initialConfig;
  const activeConfig = { ...rawActiveConfig, columns: rawActiveConfig.columns || [] };
  const activeRows = state.pageRows[state.activePage] || [];



  const handleToggleColumnArchive = async (
    colKey: string,
    currentStatus: boolean,
  ) => {
    if (!activeConfig) return;
    const updatedColumns = activeConfig.columns.map((c) =>
      c.key === colKey ? { ...c, archived: !currentStatus } : c,
    );
    const updatedConfig = { ...activeConfig, columns: updatedColumns };

    try {
      await savePageConfig(state.activePage, updatedConfig);
      setState((prev) => ({
        ...prev,
        pageConfigs: { ...prev.pageConfigs, [state.activePage]: updatedConfig },
      }));
    } catch (err) {
      console.error(err);
      toast("Failed to update archive status");
    }
  };

  const handleBulkArchiveToggle = async (hideAll: boolean) => {
    if (!activeConfig) return;
    const updatedColumns = activeConfig.columns.map((c) =>
      c.type === "sale_tracker" ? { ...c, archived: hideAll } : c,
    );
    const updatedConfig = { ...activeConfig, columns: updatedColumns };

    try {
      await savePageConfig(state.activePage, updatedConfig);
      setState((prev) => ({
        ...prev,
        pageConfigs: { ...prev.pageConfigs, [state.activePage]: updatedConfig },
      }));
      toast(hideAll ? "All sale columns hidden!" : "All sale columns visible!");
    } catch (err) {
      console.error(err);
      toast("Failed to update columns");
    }
  };


  const { handleSaveInlineEdit } = useInlineEdit({
    state,
    setState,
    toast,
    pendingSavesRef,
    setInlineEdit,
  });

  const handleCreatePage = async (name: string, columns: Column[]) => {
    const columnsWithDefaults = columns.map((c) => ({
      ...c,
      width: c.width || 150,
    }));

    const newConfig = {
      rowReorderEnabled: false,
      hoverPreviewEnabled: false,
      columns: [
        {
          key: "sr",
          name: "Row No.",
          type: "system_serial" as const,
          locked: true,
          movable: false,
          width: state.globalRowNoWidth || 100,
        },
        ...columnsWithDefaults,
      ],
    };

    try {
      await createPageSafe(name, newConfig);

      setState((prev) => ({
        ...prev,
        pages: [...prev.pages, name],
        activePage: name,
        pageConfigs: {
          ...prev.pageConfigs,
          [name]: newConfig,
        },
        pageRows: {
          ...prev.pageRows,
          [name]: [],
        },
      }));
      toggleModal("createPage", false);
      toast(
        `Page "${name}" created. Added: Row No. + ${columns.length} custom column(s).`,
      );
    } catch (err: any) {
      console.error(err);
      toast(err.message || "Failed to create page in database");
    }
  };

  const handleRenamePage = async (newName: string) => {
    const oldName = state.activePage;
    const trimmedNewName = newName.trim();
    if (!trimmedNewName) {
      return;
    }
    if (state.pages.includes(trimmedNewName) && trimmedNewName !== oldName) {
      toast("A page with this name already exists");
      return;
    }
    try {
      await renamePageSafe(oldName, trimmedNewName);

      setState((prev) => {
        const newPages = prev.pages.map((p) => (p === oldName ? trimmedNewName : p));
        const newConfigs = { ...prev.pageConfigs };
        const newRows = { ...prev.pageRows };

        newConfigs[trimmedNewName] = newConfigs[oldName];
        delete newConfigs[oldName];

        newRows[trimmedNewName] = newRows[oldName];
        delete newRows[oldName];

        const syncedConfigs = renamePageRefs(newConfigs, oldName, trimmedNewName);

        return {
          ...prev,
          pages: newPages,
          activePage: trimmedNewName,
          pageConfigs: syncedConfigs,
          pageRows: newRows,
        };
      });
      closeAllModals();
      setReturnToSettings(false);
      toast(`Page renamed to: ${trimmedNewName}`);
    } catch (err: any) {
      console.error(err);
      toast(err.message || "Failed to rename page in database");
    }
  };

  const handleDeleteColumnOptions = async (
    column: Column,
    deleteType: "normal" | "smart",
  ) => {
    if (!state.activePage) return;

    // Create new array minus the deleted column
    const updatedColumns = activeConfig.columns.filter(
      (c) => c.key !== column.key,
    );

    // Save updated config
    const newConfig = { ...activeConfig, columns: updatedColumns };

    const updatedRows = activeRows.map((row) => {
      const newRow = { ...row };

      if (deleteType === "smart" && column.type === "sale_tracker") {
        const rawTotal = String(row.total_qty || "");
        if (rawTotal.trim().startsWith("[")) {
          try {
            const totalSources = parseMultiSource(row.total_qty);
            const saleSources = parseMultiSource(row[column.key]);
            
            const updatedSources = totalSources.map((ts: any) => {
              const saleEntry = saleSources.find((ss: any) => ss.source === ts.source);
              const deduction = saleEntry ? (parseFloat(String(saleEntry.qty)) || 0) : 0;
              return {
                ...ts,
                qty: (parseFloat(String(ts.qty)) || 0) - deduction
              };
            });
            newRow.total_qty = JSON.stringify(updatedSources);
          } catch (err) {
            // On parse error, leave unchanged
          }
        } else {
          const saleValue = parseFloat(String(row[column.key] || 0)) || 0;
          const totalQty = parseFloat(String(row.total_qty || 0)) || 0;
          newRow.total_qty = String(totalQty - saleValue);
        }
      }

      delete newRow[column.key];
      return newRow;
    });

    const saved = await handleSaveRows(updatedRows, state.activePage, true, "replace");
    if (saved) {
      await handleSaveActivePageSettings(newConfig, false);
      toast(`Column "${column.name}" deleted successfully (${deleteType} mode).`);
    }
  };


  const handleDeletePage = async (pageName?: string, extraConfirmationSteps: number = 1) => {
    const pageToDelete = pageName || state.activePage;
    
    const performDeletion = async () => {
      try {
        await deletePageSafe(pageToDelete);

        setState((prev) => {
          const linkedTrackers = Object.entries(prev.pageConfigs)
            .filter(([name, config]: [string, any]) => config.linkedSourcePage === pageToDelete)
            .map(([name]) => name);

          const newPages = prev.pages.filter((p) => p !== pageToDelete && !linkedTrackers.includes(p));

          // Safety Verification Check: Deep clone to guarantee immutability
          // ensures other pages like 'Main Page' have zero risk of shared reference mutation
          const newConfigs = JSON.parse(JSON.stringify(prev.pageConfigs));
          const newRows = JSON.parse(JSON.stringify(prev.pageRows));

          // Strictly target and remove ONLY the selected page's data and its linked trackers
          delete newConfigs[pageToDelete];
          delete newRows[pageToDelete];
          
          linkedTrackers.forEach(trackerName => {
            delete newConfigs[trackerName];
            delete newRows[trackerName];
          });

          const deletedNames = [pageToDelete, ...linkedTrackers];
          const syncedConfigs = cleanDeletedPageRefs(newConfigs, deletedNames);

          let nextActivePage = prev.activePage;
          if (pageToDelete === prev.activePage || linkedTrackers.includes(prev.activePage)) {
            nextActivePage = newPages.length > 0 ? newPages[0] : "";
          }

          return {
            ...prev,
            pages: newPages,
            activePage: nextActivePage,
            pageConfigs: syncedConfigs,
            pageRows: newRows,
          };
        });
        closeAllModals();
        toast(`Page "${pageToDelete}" deleted`);
      } catch (err: any) {
        console.error(err);
        toast(err.message || "Failed to delete page from database");
      }
    };

    const triggerExtraStep = (currentStep: number) => {
      if (currentStep > extraConfirmationSteps) {
        performDeletion();
        return;
      }

      if (currentStep === extraConfirmationSteps) {
        // FINAL
        setConfirmationModal({
          isOpen: true,
          title: 'Final Warning',
          message: `Final confirmation. ${pageToDelete} and everything listed above will be deleted permanently. Images that are not used by any other row will also be deleted from disk. This cannot be recovered without a backup.`,
          confirmLabel: 'PERMANENTLY DELETE',
          onConfirm: () => { setTimeout(() => triggerExtraStep(currentStep + 1), 0); }
        });
      } else {
        // MIDDLE
        setConfirmationModal({
          isOpen: true,
          title: 'Additional Warning',
          message: `Second confirmation. Deleting ${pageToDelete} removes its rows and its tracker links from this database. This action cannot be undone and there is no recycle bin. Do you still want to continue?`,
          confirmLabel: 'Yes, I understand',
          onConfirm: () => { setTimeout(() => triggerExtraStep(currentStep + 1), 0); }
        });
      }
    };

    try {
      const res = await fetch(`/api/pages/delete-impact?name=${encodeURIComponent(pageToDelete)}`);
      if (!res.ok) throw new Error('Impact check failed');
      const data = await res.json();
      
      if (data.linkedPages && data.linkedPages.length > 0) {
        setConfirmationModal({
          isOpen: true,
          title: 'Confirm Deletion',
          message: `Deleting this page will also permanently delete the linked tracker pages: ${data.linkedPages.join(', ')}. A total of ${data.linkedRowCount + data.rowCount} rows will be removed across all of them. This action cannot be undone.`,
          onConfirm: () => { setTimeout(() => triggerExtraStep(1), 0); }
        });
      } else {
        setConfirmationModal({
          isOpen: true,
          title: 'Confirm Deletion',
          message: `Deleting page "${pageToDelete}" will remove ${data.rowCount} rows. This action cannot be undone.`,
          onConfirm: () => { setTimeout(() => triggerExtraStep(1), 0); }
        });
      }
    } catch (e) {
      console.error('Failed to fetch delete impact', e);
      setConfirmationModal({
        isOpen: true,
        title: 'Confirm Deletion',
        message: `Deleting page "${pageToDelete}". This action cannot be undone.`,
        onConfirm: () => { setTimeout(() => triggerExtraStep(1), 0); }
      });
    }
  };

  const handleClearPageData = async (pageName: string) => {
    try {
      const res = await putRows(pageName, []);

      if (!res.ok) {
        if (res.status === 409) {
          toast("Someone else changed this page while you were editing. Your change was not saved to avoid overwriting their work. The page has been refreshed, please redo your change.", 6000);
          if (refetchAndHydrateState) {
            await refetchAndHydrateState();
          }
          return;
        }
        throw new Error("Database failed to clear page data");
      }

      setState((prev) => ({
        ...prev,
        pageRows: {
          ...prev.pageRows,
          [pageName]: [],
        },
      }));
      toast("All data cleared successfully");
    } catch (err) {
      console.error(err);
      toast("Failed to clear page data");
    }
  };

  const { handleSaveActivePageSettings, handleSaveRows } = useSaveActions({
    state,
    setState,
    toast,
    toggleModal,
    editingRowId,
    setEditingRowId,
    setConfirmationModal,
    setPrimarySearchTags,
    primParentRef,
    returnToImagePreview,
    setReturnToImagePreview,
    returnToSettings,
    setReturnToSettings,
    refetchAndHydrateState,
    loadPageData: fetchPageData,
  });

  const { handlePropagateSourceColors } = useSourceColorSync({
    state,
    setState,
    toast,
  });

  const handleSaveColumnWidth = useCallback(async (colId: string, newWidth: number, targetPageOverride?: string) => {
    const pageToUpdate = targetPageOverride || state.activePage;
    if (!pageToUpdate) return;

    setState(prev => {
      const pageConfig = prev.pageConfigs[pageToUpdate];
      if (!pageConfig || !pageConfig.columns) return prev;

      const colIndex = pageConfig.columns.findIndex(c => c.key === colId);
      if (colIndex === -1) return prev;

      const updatedColumns = [...pageConfig.columns];
      updatedColumns[colIndex] = { ...updatedColumns[colIndex], width: newWidth };

      return {
        ...prev,
        pageConfigs: {
          ...prev.pageConfigs,
          [pageToUpdate]: {
            ...pageConfig,
            columns: updatedColumns
          }
        }
      };
    });

    try {
      const currentConfig = state.pageConfigs[pageToUpdate];
      if (!currentConfig || !currentConfig.columns) return;
      
      const colIndex = currentConfig.columns.findIndex(c => c.key === colId);
      if(colIndex === -1) return;
      
      const updatedColumns = [...currentConfig.columns];
      updatedColumns[colIndex] = { ...updatedColumns[colIndex], width: newWidth };

      await fetch('/api/pages/update-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: pageToUpdate,
          config: { ...currentConfig, columns: updatedColumns }
        })
      });
    } catch (err) {
      console.error("Error saving column width:", err);
    }
  }, [state.activePage, state.pageConfigs, setState]);

  const handleCreateColumns = async (newColumns: Column[]) => {
    // Set default width of 150 for all new columns
    const columnsWithDefaults = newColumns.map((c) => ({
      ...c,
      width: c.width || 150,
    }));

    const updatedConfig = {
      ...state.pageConfigs[state.activePage],
      columns: [
        ...state.pageConfigs[state.activePage].columns,
        ...columnsWithDefaults,
      ],
    };

    try {
      await savePageConfig(state.activePage, updatedConfig);

      setState((prev) => ({
        ...prev,
        pageConfigs: {
          ...prev.pageConfigs,
          [state.activePage]: updatedConfig,
        },
      }));

      closeAllModals();
      setReturnToSettings(false);
      toast(`${newColumns.length} column(s) added to ${state.activePage}`);
    } catch (err) {
      console.error(err);
      toast("Failed to add columns to database");
    }
  };

  const handleEditColumnClick = (col: Column) => {
    setEditingColumn(col);
    setReturnToSettings(true);
    toggleModal("activePageSettings", false);
    toggleModal("editColumn", true);
  };

  const handleToggleColumnPin = async (colKey: string) => {
    const currentCols = state.pageConfigs[state.activePage]?.columns || [];
    const newCols = currentCols.map((c) =>
      c.key === colKey ? { ...c, pinned: !c.pinned } : c,
    );
    const updatedConfig = {
      ...state.pageConfigs[state.activePage],
      columns: newCols,
    };
    await handleSaveActivePageSettings(updatedConfig, false);
  };

  const handleSaveEditedColumn = async (updatedCol: Column) => {
    const currentCols = state.pageConfigs[state.activePage]?.columns || [];
    const newCols = currentCols.map((c) =>
      c.key === updatedCol.key ? updatedCol : c,
    );
    const updatedConfig = {
      ...state.pageConfigs[state.activePage],
      columns: newCols,
    };

    try {
      await savePageConfig(state.activePage, updatedConfig);

      setState((prev) => ({
        ...prev,
        pageConfigs: {
          ...prev.pageConfigs,
          [state.activePage]: updatedConfig,
        },
      }));

      closeAllModals();
      setEditingColumn(null);
      setReturnToSettings(false);
      toast(`Column "${updatedCol.name}" updated successfully`);
    } catch (err) {
      console.error(err);
      toast("Failed to update column in database");
    }
  };

  const handleUpdateColumnPreview = (updatedCol: Column) => {
    setState((prev) => {
      const currentCols = prev.pageConfigs[state.activePage]?.columns || [];
      const newCols = currentCols.map((c) =>
        c.key === updatedCol.key ? updatedCol : c,
      );
      return {
        ...prev,
        pageConfigs: {
          ...prev.pageConfigs,
          [state.activePage]: {
            ...prev.pageConfigs[state.activePage],
            columns: newCols,
          },
        },
      };
    });
  };


  const {
    handleSyncTracker,
    handleCreateTracker,
    handleAddSaleColumn,
    handleBulkDeleteSaleColumns,
    handleManageTrackerColumns,
  } = useTrackerActions({
    state,
    setState,
    toast,
    activeConfig,
    activeRows,
    customSaleName,
    setCustomSaleName,
    setIsSalePromptOpen,
    activeFilterSaleCol,
    setActiveFilterSaleCol,
    setSelectedArchiveCols,
    handleSaveActivePageSettings,
    handleSaveRows,
    loadSourcePageIfNeeded,
  });

  useTrackerSourcePreload({ state, setState });

  const handleRelinkTrackerSuccess = async (trackerName: string, newSourcePage: string, newConfig: PageConfig) => {
    setState((prev) => ({
      ...prev,
      pageConfigs: {
        ...prev.pageConfigs,
        [trackerName]: newConfig
      }
    }));
    setPendingTrackerSync(trackerName);
  };

  useEffect(() => {
    if (pendingTrackerSync) {
      handleSyncTracker(pendingTrackerSync);
      setPendingTrackerSync(null);
    }
  }, [pendingTrackerSync, handleSyncTracker]);

  const handleApplySourceToAll = async (pageName: string, colKey: string, sourceName: string, sourceColor: string) => {
    setBulkApplyContext({ pageName, colKey, sourceName, sourceColor });
    toggleModal("addRow", false);
    toggleModal("bulkApplySource", true);
  };

  const handleConfirmBulkApply = async (
    selectedRowIds: Set<string>,
    sourcesToApply: { source: string; color: string }[],
  ) => {
    if (!bulkApplyContext) return;
    const { pageName, colKey } = bulkApplyContext;

    try {
      const rows = state.pageRows[pageName] || [];
      let hasChanges = false;
      const updatesMap: any = {};
      const updatedRows = rows.map((r) => {
        if (!selectedRowIds.has(String(r.id))) return r;

        let rowModified = false;
        const arr = parseMultiSource(r[colKey]);

        sourcesToApply.forEach((sToApply) => {
          if (!arr.find((x: any) => x.source === sToApply.source)) {
            arr.push({ source: sToApply.source, qty: 0, color: sToApply.color });
            rowModified = true;
            hasChanges = true;
          }
        });

        if (rowModified) {
          const newVal = JSON.stringify(arr);
          updatesMap[r.id] = { [colKey]: newVal };
          return { ...r, [colKey]: newVal };
        }
        return r;
      });

      if (!hasChanges) {
        toast(`Selected sources are already present in all selected rows.`);
        toggleModal("bulkApplySource", false);
        return;
      }

      const res = await bulkPatchRows(pageName, { updates: updatesMap });

      if (!res.ok) throw new Error("Failed to update bulk sources");

      setState((prev) => ({
        ...prev,
        pageRows: {
          ...prev.pageRows,
          [pageName]: updatedRows,
        },
      }));
      toast(
        `Successfully applied ${sourcesToApply.length} source(s) to ${selectedRowIds.size} rows`,
      );
      toggleModal("bulkApplySource", false);
    } catch (err: any) {
      console.error(err);
      toast("Error applying source to selected rows: " + err.message);
    }
  };

  const handleDeleteRow = async (rowId: string, pageName?: string) => {
    const targetPage = pageName || state.activePage;

    // Safety Verification Check: Force string conversion to prevent strict equality mismatch
    const safeRowId = String(rowId);
    try {
      await deleteRow(targetPage, safeRowId);

      setState((prev) => ({
        ...prev,
        pageRows: {
          ...prev.pageRows,
          // Safety Check: Double check filtering directly on prev state to avoid stale closures
          [targetPage]: (prev.pageRows[targetPage] || []).filter(
            (r) => String(r.id) !== safeRowId,
          ),
        },
      }));

      // Auto-sync trackers (delete row)
      const linkedTrackers = Object.entries(state.pageConfigs)
        .filter(
          ([_, c]) => (c as PageConfig).linkedSourcePage === targetPage,
        )
        .map(([name]) => name);

      for (const trackerName of linkedTrackers) {
        const trackerRows = state.pageRows[trackerName] || [];
        const newTrackerRows = trackerRows.filter(
          (r) => String(r.id) !== safeRowId,
        );
        if (newTrackerRows.length < trackerRows.length) {
          await deleteRow(trackerName, safeRowId);
          setState((prev) => ({
            ...prev,
            pageRows: { ...prev.pageRows, [trackerName]: newTrackerRows },
          }));
        }
      }

      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        next.delete(safeRowId);
        next.delete(rowId); // Clean both potential type keys safely
        return next;
      });

      if (String(previewContext?.rowId) === safeRowId) {
        setPreviewContext(null);
      }
      if (String(editingRowId) === safeRowId) {
        setEditingRowId(null);
      }
      setHoveredImage(null);
      toast("Row deleted");
    } catch (err) {
      console.error(err);
      toast("Failed to delete row from database");
    }
  };

  const handleReplaceImage = async (newImage: any, pageName?: string) => {
    if (!previewContext) return;
    const targetPage = pageName || previewContext.pageName;
    const currentRows = [...(state.pageRows[targetPage] || [])];
    const idx = currentRows.findIndex((r) => r.id === previewContext.rowId);
    if (idx >= 0) {
      currentRows[idx] = {
        ...currentRows[idx],
        [previewContext.imageKey]: newImage.data || newImage,
      };
    }

    try {
      await patchRow(targetPage, previewContext.rowId, { [previewContext.imageKey]: newImage.data || newImage });

      setState((prev) => ({
        ...prev,
        pageRows: {
          ...prev.pageRows,
          [targetPage]: currentRows,
        },
      }));
      toast("Image replaced successfully");
    } catch (err) {
      console.error(err);
      toast("Failed to replace image in database");
    }
  };

  const handleDeleteImage = async (
    rowId: string,
    imageKey: string,
    pageName?: string,
  ) => {
    const targetPage =
      pageName || previewContext?.pageName || state.activePage;
    const currentRows = [...(state.pageRows[targetPage] || [])];
    const idx = currentRows.findIndex((r) => r.id === rowId);
    if (idx >= 0) {
      currentRows[idx] = { ...currentRows[idx], [imageKey]: "" };
    }

    try {
      await patchRow(targetPage, rowId, { [imageKey]: "" });

      setState((prev) => ({
        ...prev,
        pageRows: {
          ...prev.pageRows,
          [targetPage]: currentRows,
        },
      }));
      setPreviewContext(null);
      setHoveredImage(null);
      toast("Image deleted");
    } catch (err) {
      console.error(err);
      toast("Failed to delete image from database");
    }
  };

  const sortRows = (rows: RowData[], columns: Column[]) => {
    const sortableColumns = columns
      .filter((c) => c.sortEnabled && c.key !== "sr")
      .sort((a, b) => (a.sortPriority || 0) - (b.sortPriority || 0));

    if (sortableColumns.length === 0) return rows;

    return [...rows].sort((a, b) => {
      for (const col of sortableColumns) {
        const key = col.key;
        let valA = a[key];
        let valB = b[key];

        if (valA === null || valA === undefined) valA = "";
        if (valB === null || valB === undefined) valB = "";

        let comparison = 0;
        if (col.type === "number") {
          const numA = parseFloat(valA);
          const numB = parseFloat(valB);
          if (!isNaN(numA) && !isNaN(numB)) comparison = numA - numB;
          else if (isNaN(numA) && !isNaN(numB)) comparison = 1;
          else if (!isNaN(numA) && isNaN(numB)) comparison = -1;
          else comparison = 0;
        } else if (col.type === "date") {
          const dateA = new Date(valA).getTime();
          const dateB = new Date(valB).getTime();
          if (!isNaN(dateA) && !isNaN(dateB)) comparison = dateA - dateB;
          else if (isNaN(dateA) && !isNaN(dateB)) comparison = 1;
          else if (!isNaN(dateA) && isNaN(dateB)) comparison = -1;
          else comparison = 0;
        } else {
          // Added .trim() to fix hidden spacing issues in sorting
          comparison = String(valA)
            .trim()
            .toLowerCase()
            .localeCompare(String(valB).trim().toLowerCase());
        }

        if (comparison !== 0) {
          return col.sortDirection === "asc" ? comparison : -comparison;
        }
      }
      return 0;
    });
  };

  const activeColumnsWithSum = useMemo(() => {
    // Enforce explicit 150px width for total and remaining columns so they never shrink
    let cols = [...activeConfig.columns].map((c) => {
      if (c.key === "total_qty" || c.key === "remaining_qty") {
        return { ...c, width: c.width || 150 };
      }
      return c;
    });

    if (activeCustomSum) {
      const remIdx = cols.findIndex((c) => c.key === "remaining_qty");
      if (remIdx !== -1) {
        cols.splice(remIdx + 1, 0, {
          key: "custom_temp_sum",
          name: activeCustomSum.endName ? `Sum (${activeCustomSum.startName} to ${activeCustomSum.endName})` : activeCustomSum.startName,
          type: "number",
          locked: true,
          sortEnabled: true,
          archived: false,
          width: 150,
        } as any);
      }
    }
    return cols;
  }, [activeConfig.columns, activeCustomSum]);

  const uniqueSourcesInRange = useMemo(() => {
    if (!isSumModalOpen || !activeConfig.isTrackerPage) return [];
    const startIdx = activeConfig.columns.findIndex(
      (c) => c.key === sumStartCol,
    );
    const endIdx = activeConfig.columns.findIndex((c) => c.key === sumEndCol);
    if (startIdx === -1 || endIdx === -1) return [];

    const minIdx = Math.min(startIdx, endIdx);
    const maxIdx = Math.max(startIdx, endIdx);
    const keys = activeConfig.columns
      .slice(minIdx, maxIdx + 1)
      .map((c) => c.key);

    const allSources = new Set<string>();
    activeRows.forEach((row) => {
      // 1. Scan global sources from total_qty
      const totalSources = parseMultiSource(row.total_qty);
      const rowSourceNames = new Set<string>();
      totalSources.forEach((s: any) => {
        if (s.source) {
          allSources.add(s.source);
          rowSourceNames.add(s.source);
        }
      });

      // 2. Scan specific range columns (Self-heal: only include if exists in total_qty)
      keys.forEach((k) => {
        const parsed = parseMultiSource(row[k]);
        parsed.forEach((s: any) => {
          if (s.source && rowSourceNames.has(s.source)) {
            allSources.add(s.source);
          }
        });
      });
    });
    return Array.from(allSources).sort((a, b) => a.localeCompare(b));
  }, [isSumModalOpen, sumStartCol, sumEndCol, activeConfig.columns, activeRows]);

  const activeRowsWithSum = useMemo(() => {
    if (!activeCustomSum || !activeConfig.isTrackerPage) return activeRows;
    const selected = activeCustomSum.selectedSources || [];
    return activeRows.map((r) => {
      let totalQty = 0;
      const breakdownMap: Record<string, number> = {};
      const validSources = new Set(parseMultiSource(r.total_qty).map((s: any) => s.source));
      activeCustomSum.keys.forEach((k) => {
        const sources = parseMultiSource(r[k]);
        sources.forEach((s: any) => {
          if (validSources.has(s.source) && (selected.length === 0 || selected.includes(s.source))) {
            totalQty += parseFloat(String(s.qty)) || 0;
            breakdownMap[s.source] = (breakdownMap[s.source] || 0) + (parseFloat(String(s.qty)) || 0);
          }
        });
      });

      const breakdown = Object.entries(breakdownMap).map(([source, qty]) => {
        let color = "bg-gray-100 text-gray-800 border-gray-200";
        // Attempt to find original color
        activeCustomSum.keys.some(k => {
          const srcObj = parseMultiSource(r[k]).find((so: any) => so.source === source);
          if (srcObj && srcObj.color) {
            color = srcObj.color;
            return true;
          }
          return false;
        });
        return { source, qty, color };
      }).sort((a, b) => a.source.localeCompare(b.source));

      return {
        ...r,
        custom_temp_sum: String(totalQty),
        custom_temp_sum_breakdown: JSON.stringify(breakdown),
      };
    });
  }, [activeRows, activeCustomSum, activeConfig.isTrackerPage]);

  const compileSearchQueries = useCallback((activeQueries: string[]) => {
    return activeQueries.map((query) => {
      const lowerQuery = query.toLowerCase();
      let searchString = lowerQuery;
      let prefix: string | null = null;
      let matchedColTargetString: string | null = null;
      const colonIndex = lowerQuery.indexOf(":");

      if (colonIndex > 0) {
        prefix = lowerQuery.substring(0, colonIndex).trim();
        matchedColTargetString = lowerQuery.substring(colonIndex + 1).trim();
      }

      const compileTokens = (str: string) => {
        const rawTokens = str.split(/\s+/).filter(Boolean);
        return rawTokens.map((t) => {
          let regex: RegExp;
          try {
            const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            let bStart = "";
            let bEnd = "";
            if (/^[0-9]/.test(t)) {
              bStart = "";
              bEnd = "";
            } else if (/^[a-zA-Z]/.test(t)) {
              if (t.length <= 2) {
                bStart = "(?<![a-zA-Z])";
                bEnd = "(?![a-zA-Z]{2,})";
              }
            }
            regex = new RegExp(bStart + escaped + bEnd, "i");
          } catch (e) {
            regex = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
          }
          return regex;
        });
      };

      return {
        prefix,
        defaultTokens: compileTokens(lowerQuery),
        suffixTokens: matchedColTargetString !== null ? compileTokens(matchedColTargetString) : [],
      };
    });
  }, []);

  const buildSearchIndex = useCallback((rows: any[], columns: any[]) => {
    const indexMap = new Map();
    rows.forEach(row => {
      const colData = columns
        .map((col) => {
          if (col.key === "sr" || col.type === "image" || col.type === "file")
            return null;
          const val = row[col.key];
          const strVal = Array.isArray(val)
            ? val.join(" ")
            : val !== null && val !== undefined
              ? String(val)
              : "";
          const cleanVal = decodeHtmlEntities(strVal)
            .replace(/<!--[\s\S]*?-->/g, "")
            .replace(/<br\s*\/?>/gi, " ")
            .replace(/&nbsp;/gi, " ")
            .toLowerCase();
          return { name: col.name.toLowerCase(), val: cleanVal };
        })
        .filter(Boolean) as { name: string; val: string }[];

      const globalBlob = colData.map((c) => c.val).join(" ");
      indexMap.set(row.id, { colData, globalBlob });
    });
    return indexMap;
  }, []);

  const primarySearchIndex = useMemo(() => {
    return buildSearchIndex(activeRowsWithSum, activeColumnsWithSum);
  }, [activeRowsWithSum, activeColumnsWithSum, buildSearchIndex]);

  const secondarySearchIndex = useMemo(() => {
    if (!activeConfig.secondarySearchPage) return new Map();
    const secRows = state.pageRows[activeConfig.secondarySearchPage] || [];
    const secConfig = state.pageConfigs[activeConfig.secondarySearchPage];
    if (!secConfig) return new Map();
    return buildSearchIndex(secRows, secConfig.columns);
  }, [state.pageRows, state.pageConfigs, activeConfig.secondarySearchPage, buildSearchIndex]);

  const filteredRows = useMemo(() => {
    let rows = activeRowsWithSum;
    const activeQueries = [...primarySearchTags, deferredSearch.trim()].filter(
      Boolean,
    );
    if (activeQueries.length > 0) {
      const compiledQueries = compileSearchQueries(activeQueries);
      
      rows = rows.filter((row) => {
        const indexData = primarySearchIndex.get(row.id);
        const colData = indexData ? indexData.colData : [];
        const globalBlob = indexData ? indexData.globalBlob : "";

        return compiledQueries.some((cQuery) => {
          let targetBlob = globalBlob;
          let tokensToUse = cQuery.defaultTokens;

          if (cQuery.prefix !== null) {
            const matchedCol = colData.find(
              (c) => c.name.includes(cQuery.prefix!) || cQuery.prefix!.includes(c.name),
            );
            if (matchedCol) {
              targetBlob = matchedCol.val;
              tokensToUse = cQuery.suffixTokens;
            }
          }

          if (tokensToUse.length === 0) return true;
          return tokensToUse.every((regex) => regex.test(targetBlob));
        });
      });
    }
    if (activeConfig.isTrackerPage) {
      rows = filterAndSortTrackerRows({
        rows,
        originalRows: activeRowsWithSum,
        columns: activeConfig.columns,
        trackerFilter,
        trackerSort,
        trackerQtySort,
        activeFilterSaleCol,
        minStockAlert: activeConfig.minStockAlert,
        linkedSourcePage: activeConfig.linkedSourcePage,
        autoSortBySales: activeConfig.autoSortBySales,
      });
    }

    return sortRows(rows, activeConfig.columns);
  }, [
    activeRowsWithSum,
    deferredSearch,
    primarySearchTags,
    activeColumnsWithSum,
    activeConfig.isTrackerPage,
    activeConfig.linkedSourcePage,
    activeConfig.autoSortBySales,
    activeConfig.minStockAlert,
    trackerFilter,
    trackerSort,
    trackerQtySort,
  ]);

  const secondaryFilteredRows = useMemo(() => {
    if (!activeConfig.secondarySearchPage) return [];
    const secRows = state.pageRows[activeConfig.secondarySearchPage] || [];
    const secConfig = state.pageConfigs[activeConfig.secondarySearchPage];
    if (!secConfig) return [];

    let rows = secRows;
    const activeQueries = [
      ...secondarySearchTags,
      deferredSecondarySearch.trim(),
    ].filter(Boolean);
    if (activeQueries.length > 0) {
      const compiledQueries = compileSearchQueries(activeQueries);
      
      rows = rows.filter((row) => {
        const indexData = secondarySearchIndex.get(row.id);
        const colData = indexData ? indexData.colData : [];
        const globalBlob = indexData ? indexData.globalBlob : "";

        return compiledQueries.some((cQuery) => {
          let targetBlob = globalBlob;
          let tokensToUse = cQuery.defaultTokens;

          if (cQuery.prefix !== null) {
            const matchedCol = colData.find(
              (c) => c.name.includes(cQuery.prefix!) || cQuery.prefix!.includes(c.name),
            );
            if (matchedCol) {
              targetBlob = matchedCol.val;
              tokensToUse = cQuery.suffixTokens;
            }
          }

          if (tokensToUse.length === 0) return true;
          return tokensToUse.every((regex) => regex.test(targetBlob));
        });
      });
    }
    if (secConfig.isTrackerPage) {
      rows = filterAndSortTrackerRows({
        rows,
        originalRows: secRows,
        columns: secConfig.columns,
        trackerFilter,
        trackerSort,
        trackerQtySort,
        activeFilterSaleCol,
        minStockAlert: secConfig.minStockAlert,
        linkedSourcePage: secConfig.linkedSourcePage,
        autoSortBySales: secConfig.autoSortBySales,
      });
    }

    return sortRows(rows, secConfig.columns);
  }, [
    state.pageRows,
    state.pageConfigs,
    activeConfig.secondarySearchPage,
    deferredSecondarySearch,
    secondarySearchTags,
    trackerFilter,
    trackerSort,
    trackerQtySort,
  ]);



  const primaryQueries = [...primarySearchTags, currentSearch.trim()].filter(
    Boolean,
  );
  const secondaryQueries = [
    ...secondarySearchTags,
    secondarySearchQuery.trim(),
  ].filter(Boolean);

  const isSecondaryActive =
    activeSearchView === "secondary" &&
    !!(
      activeConfig.secondarySearchPage &&
      state.pageConfigs[activeConfig.secondarySearchPage]
    );

  const displayConfig = isSecondaryActive
    ? state.pageConfigs[activeConfig.secondarySearchPage!]
    : { ...activeConfig, columns: activeColumnsWithSum };
  const displayRows = isSecondaryActive ? secondaryFilteredRows : filteredRows;
  const displayQueries = isSecondaryActive ? secondaryQueries : primaryQueries;

  const primVisibleColumns = useMemo(() => {
    const pConfig = state.pageConfigs[state.activePage];
    if (!pConfig || !pConfig.columns) return [];
    return pConfig.columns
      .filter((col) => showArchived || !col.archived)
      .map((col) => ({
        id: col.key,
        accessorKey: col.key,
        header: () => col.name,
        size:
          col.width ||
          (col.key === "sr"
            ? state.globalRowNoWidth || 100
            : col.type === "image"
              ? 137
              : 150),
      }));
  }, [
    state.activePage,
    state.pageConfigs,
    showArchived,
    state.globalRowNoWidth,
  ]);

  const secVisibleColumns = useMemo(() => {
    const secPage = activeConfig.secondarySearchPage;
    if (!secPage || !state.pageConfigs[secPage]) return [];
    const secConfig = state.pageConfigs[secPage];
    return secConfig.columns
      .filter((col) => showArchived || !col.archived)
      .map((col) => ({
        id: col.key,
        accessorKey: col.key,
        header: () => col.name,
        size:
          col.width ||
          (col.key === "sr"
            ? state.globalRowNoWidth || 100
            : col.type === "image"
              ? 137
              : 150),
      }));
  }, [
    activeConfig.secondarySearchPage,
    state.pageConfigs,
    showArchived,
    state.globalRowNoWidth,
  ]);

  const primTable = useReactTable({
    data: filteredRows || [],
    columns: primVisibleColumns,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  });

  const secTable = useReactTable({
    data: secondaryFilteredRows || [],
    columns: secVisibleColumns,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  });

  useEffect(() => {
    primTable.resetColumnSizing();
  }, [state.activePage, primTable]);

  useEffect(() => {
    secTable.resetColumnSizing();
  }, [activeConfig.secondarySearchPage, secTable]);

  const primSizingInfo = primTable.getState().columnSizingInfo;
  const primSizing = primTable.getState().columnSizing;

  const secSizingInfo = secTable.getState().columnSizingInfo;
  const secSizing = secTable.getState().columnSizing;

  const prevPrimResizing = useRef<string | boolean | undefined>(false);
  const prevPrimPage = useRef<string>(state.activePage);
  useEffect(() => {
    const wasResizing = prevPrimResizing.current;
    const isResizing = primSizingInfo?.isResizingColumn;
    prevPrimResizing.current = isResizing;

    if (isResizing) {
      prevPrimPage.current = state.activePage;
    }

    if (wasResizing && !isResizing && typeof wasResizing === "string") {
      const finalWidth = primSizing[wasResizing];
      if (finalWidth) {
        handleSaveColumnWidth(wasResizing, finalWidth as number, prevPrimPage.current);
      }
    }
  }, [primSizingInfo?.isResizingColumn, primSizing, state.activePage, handleSaveColumnWidth]);

  const prevSecResizing = useRef<string | boolean | undefined>(false);
  const prevSecPage = useRef<string | null>(activeConfig.secondarySearchPage || null);
  useEffect(() => {
    const wasResizing = prevSecResizing.current;
    const isResizing = secSizingInfo?.isResizingColumn;
    prevSecResizing.current = isResizing;

    const secPage = activeConfig.secondarySearchPage;
    if (isResizing) {
      prevSecPage.current = secPage || null;
    }

    if (wasResizing && !isResizing && typeof wasResizing === "string") {
      const finalWidth = secSizing[wasResizing];
      if (finalWidth && prevSecPage.current) {
        handleSaveColumnWidth(wasResizing, finalWidth as number, prevSecPage.current);
      }
    }
  }, [
    secSizingInfo?.isResizingColumn,
    secSizing,
    activeConfig.secondarySearchPage,
    handleSaveColumnWidth
  ]);

  const secParentRef = useRef<HTMLDivElement>(null);

  const primVirtualizer = useVirtualizer({
    count: filteredRows.length,
    getScrollElement: () => primParentRef.current,
    estimateSize: () => state.pageConfigs[state.activePage]?.rowHeight || 100,
    overscan: 5,
  });

  const secVirtualizer = useVirtualizer({
    count: secondaryFilteredRows.length,
    getScrollElement: () => secParentRef.current,
    estimateSize: () => {
      const secPage = activeConfig.secondarySearchPage;
      return state.pageConfigs[secPage || ""]?.rowHeight || 100;
    },
    overscan: 5,
  });
  const savedPrimScroll = useRef(0);
  const savedSecScroll = useRef(0);
  const wasPrimSearchActive = useRef(false);
  const wasSecSearchActive = useRef(false);

  const prevPrimQueries = useRef<string[]>([]);
  const prevSecQueries = useRef<string[]>([]);
  const [ghostPrimQueries, setGhostPrimQueries] = useState<string[]>([]);
  const [ghostSecQueries, setGhostSecQueries] = useState<string[]>([]);
  const latestPrimFilteredIds = useRef<Set<string>>(new Set());
  const latestSecFilteredIds = useRef<Set<string>>(new Set());
  const [ghostPrimIds, setGhostPrimIds] = useState<Set<string>>(new Set());
  const [ghostSecIds, setGhostSecIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Primary
    if (primaryQueries.length > 0 && !wasPrimSearchActive.current) {
      prevPrimQueries.current = primaryQueries;
      setGhostPrimQueries([]);
      setGhostPrimIds(new Set());
      wasPrimSearchActive.current = true;
    } else if (primaryQueries.length === 0 && wasPrimSearchActive.current) {
      wasPrimSearchActive.current = false;
      if (localSettings.ghostHighlight) {
        setGhostPrimQueries(prevPrimQueries.current);
        setGhostPrimIds(latestPrimFilteredIds.current);
        setTimeout(() => {
          if (primParentRef.current)
            primParentRef.current.scrollTop = savedPrimScroll.current;
        }, 100);
      }
    }

    // Secondary
    if (secondaryQueries.length > 0 && !wasSecSearchActive.current) {
      prevSecQueries.current = secondaryQueries;
      setGhostSecQueries([]);
      setGhostSecIds(new Set());
      wasSecSearchActive.current = true;
    } else if (secondaryQueries.length === 0 && wasSecSearchActive.current) {
      wasSecSearchActive.current = false;
      if (localSettings.ghostHighlight) {
        setGhostSecQueries(prevSecQueries.current);
        setGhostSecIds(latestSecFilteredIds.current);
        setTimeout(() => {
          if (secParentRef.current)
            secParentRef.current.scrollTop = savedSecScroll.current;
        }, 100);
      }
    }
  }, [primaryQueries.length, secondaryQueries.length]);

  useEffect(() => {
    if (primaryQueries.length > 0)
      latestPrimFilteredIds.current = new Set(
        filteredRows.map((r) => String(r.id)),
      );
  }, [filteredRows, primaryQueries.length]);

  useEffect(() => {
    if (secondaryQueries.length > 0)
      latestSecFilteredIds.current = new Set(
        secondaryFilteredRows.map((r) => String(r.id)),
      );
  }, [secondaryFilteredRows, secondaryQueries.length]);

  useEffect(() => {
    const handleGlobalTableNav = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;

      const activeVirtualizer = isSecondaryActive
        ? secVirtualizer
        : primVirtualizer;
      const activeParentRef = isSecondaryActive ? secParentRef : primParentRef;
      const activeRowsCount = isSecondaryActive
        ? secondaryFilteredRows.length
        : filteredRows.length;

      if (e.key === "Home") {
        e.preventDefault();
        activeVirtualizer.scrollToIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        activeVirtualizer.scrollToIndex(activeRowsCount - 1);
      } else if (e.key === "PageUp") {
        e.preventDefault();
        if (activeParentRef.current)
          activeParentRef.current.scrollTop -=
            activeParentRef.current.clientHeight;
      } else if (e.key === "PageDown") {
        e.preventDefault();
        if (activeParentRef.current)
          activeParentRef.current.scrollTop +=
            activeParentRef.current.clientHeight;
      }
    };

    window.addEventListener("keydown", handleGlobalTableNav);
    return () => window.removeEventListener("keydown", handleGlobalTableNav);
  }, [
    isSecondaryActive,
    primVirtualizer,
    secVirtualizer,
    filteredRows.length,
    secondaryFilteredRows.length,
  ]);


  const currentLowStockIds = useMemo(() => {
    let trackerConfig = activeConfig.isTrackerPage ? activeConfig : null;
    let trackerRows = activeRows;

    if (!trackerConfig) {
      // If on source page, find its linked tracker
      const linkedEntry = Object.entries(state.pageConfigs).find(
        ([, cfg]) => (cfg as PageConfig).linkedSourcePage === state.activePage,
      );
      if (linkedEntry) {
        trackerConfig = linkedEntry[1] as PageConfig;
        trackerRows = state.pageRows[linkedEntry[0]] || [];
      }
    }

    if (trackerConfig) {
      const minStock = trackerConfig.minStockAlert || 5;
      const saleCols = trackerConfig.columns.filter(
        (c) => c.type === "sale_tracker",
      );
      const ids = new Set<string>();
      trackerRows.forEach((row) => {
        const totalSources = parseMultiSource(row.total_qty);
        let remaining = 0;
        totalSources.forEach((ts: any) => {
          const tQty = parseFloat(ts.qty) || 0;
          let totalSaleForSource = 0;
          saleCols.forEach((sc: any) => {
            const sales = parseMultiSource(row[sc.key]);
            const saleEntry = sales.find((s: any) => s.source === ts.source);
            if (saleEntry) totalSaleForSource += (parseFloat(saleEntry.qty) || 0);
          });
          remaining += (tQty - totalSaleForSource);
        });
        
        if (remaining <= minStock) {
          ids.add(String(row.id));
        }
      });
      return ids;
    }
    return null; // Return null if no tracker logic applies to current page
  }, [
    activeConfig,
    activeRows,
    state.activePage,
    state.pageConfigs,
    state.pageRows,
  ]);

  const tableContent = (
    <div className="w-full flex-1 min-h-0 flex flex-col text-[#333] text-left m-0 p-0">
      {isSecondaryActive && (
        <div className="bg-[#e8edf2] px-3 py-1.5 text-sm font-bold text-[#2b579a] border-y border-[#d8d8d8]">
          Viewing Secondary Data: {activeConfig.secondarySearchPage}
        </div>
      )}
      {displayConfig.isTrackerPage && (
        <div className="bg-[#e8edf2] px-3 py-2 flex flex-wrap gap-2 border-b border-[#d8d8d8] items-center">
          <button
            onClick={() => setIsSalePromptOpen(true)}
            className="bg-[#217346] text-white px-3 py-1.5 rounded text-xs font-bold shadow hover:bg-[#1e6b41]"
          >
            ➕ Add Sale Column
          </button>
          {activeCustomSum ? (
            <button
              onClick={() => setActiveCustomSum(null)}
              className="bg-purple-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow hover:bg-purple-700 flex items-center gap-1"
            >
              ❌ Clear Sum
            </button>
          ) : (
            <button
              onClick={() => {
                const saleCols = activeConfig.columns.filter(
                  (c) => c.type === "sale_tracker",
                );
                if (saleCols.length > 0) {
                  setSumStartCol(saleCols[0].key);
                  setSumEndCol(saleCols[saleCols.length - 1].key);
                }
                setSumStartSearchQuery("");
                setSumEndSearchQuery("");
                setSumSelectedSources([]);
                setIsSumModalOpen(true);
              }}
              className="bg-purple-100 text-purple-800 border border-purple-300 px-3 py-1.5 rounded text-xs font-bold shadow-sm hover:bg-purple-200 flex items-center gap-1"
            >
              📊 Range Sum
            </button>
          )}
          <button
            onClick={() => setIsArchiveModalOpen(true)}
            className="bg-amber-600 text-white px-3 py-1.5 rounded text-xs font-bold shadow hover:bg-amber-700 flex items-center gap-1"
          >
            🗄️ Archive Column
          </button>
          {!activeConfig.isTrackerPage && (
            <label className="flex items-center gap-1 text-xs font-bold text-gray-700 ml-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded"
              />{" "}
              Show History
            </label>
          )}
          <div className="flex-1"></div>
          <div className="flex flex-wrap gap-3 items-center">
            {/* Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded shadow-sm border border-gray-200">
              <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                🔍 Filter:
              </span>
              <select
                value={trackerFilter}
                onChange={(e) => setTrackerFilter(e.target.value as any)}
                className="text-xs font-bold text-[#2b579a] border-none outline-none cursor-pointer bg-transparent"
              >
                <option value="all">🟢 All Data (Reset)</option>
                <option value="high">⭐ High Sale</option>
                <option value="zero">0️⃣ Zero Sale</option>
                <option value="low">🚨 Low Stock</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded shadow-sm border border-gray-200">
              <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                ↕️ Sort by Sale Column:
              </span>
              <select
                value={trackerSort}
                onChange={(e) => setTrackerSort(e.target.value as any)}
                className="text-xs font-bold text-[#2b579a] border-none outline-none cursor-pointer bg-transparent"
              >
                <option value="none">🟢 Default (Reset)</option>
                <option value="high">⬆️ High Sale First</option>
                <option value="low">⬇️ Low Sale First</option>
              </select>
            </div>

            {/* Qty Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded shadow-sm border border-gray-200">
              <span className="text-xs font-bold text-gray-500 flex items-center gap-1">
                📦 Qty:
              </span>
              <select
                value={trackerQtySort}
                onChange={(e) => setTrackerQtySort(e.target.value as any)}
                className="text-xs font-bold text-[#2b579a] border-none outline-none cursor-pointer bg-transparent"
              >
                <option value="none">🟢 Default (Reset)</option>
                <option value="total_high">⬆️ Total Qty: High to Low</option>
                <option value="total_low">⬇️ Total Qty: Low to High</option>
                <option value="remaining_high">⬆️ Remaining Qty: High to Low</option>
                <option value="remaining_low">⬇️ Remaining Qty: Low to High</option>
              </select>
            </div>
          </div>
        </div>
      )}
      {(() => {
        const isGhostActive =
          displayQueries.length === 0 &&
          (isSecondaryActive
            ? ghostSecQueries.length > 0
            : ghostPrimQueries.length > 0);
        const finalQueries =
          displayQueries.length > 0
            ? displayQueries
            : isSecondaryActive
              ? ghostSecQueries
              : ghostPrimQueries;
        const originalRows = isSecondaryActive
          ? state.pageRows[activeConfig.secondarySearchPage!] || []
          : activeRows;
        const ghostIds = isSecondaryActive ? ghostSecIds : ghostPrimIds;
        return (
          <TableView
            config={displayConfig}
            rows={displayRows}
            queries={finalQueries}
            isSecondary={isSecondaryActive}
            originalRows={originalRows}
            activeFilterSaleCol={activeFilterSaleCol}
            isGhost={isGhostActive}
            ghostIds={ghostIds}
            showArchived={showArchived}
            setBox1Value={setBox1Value}
            setBox2Value={setBox2Value}
            activeAnchor={activeAnchor}
            state={state}
            activeConfig={activeConfig}
            inlineEdit={inlineEdit}
            setInlineEdit={setInlineEdit}
            selectedRowIds={selectedRowIds}
            setSelectedRowIds={setSelectedRowIds}
            setHoveredImage={setHoveredImage}
            activePopupId={activePopupId}
            setActivePopupId={setActivePopupId}
            setActiveAnchor={setActiveAnchor}
            setEditingRowId={setEditingRowId}
            setEditingPageName={setEditingPageName}
            setPreviewContext={setPreviewContext}
            primTable={primTable}
            secTable={secTable}
            primVirtualizer={primVirtualizer}
            secVirtualizer={secVirtualizer}
            primParentRef={primParentRef}
            secParentRef={secParentRef}
            savedPrimScroll={savedPrimScroll}
            savedSecScroll={savedSecScroll}
            handleClosePopup={handleClosePopup}
            handleDragEnd={handleDragEnd}
            onTogglePinColumn={handleToggleColumnPin}
            onOpenRetiredOverview={(sources?: string[]) => {
              setRetiredOverviewFilterSources(sources || null);
              setIsRetiredOverviewStandalone(true);
              setRetiredSourcesOverviewOpen(true);
            }}
            onOpenActiveSourceOverview={(sources?: string[]) => {
              setActiveOverviewFilterSources(sources || null);
              setActiveSourcesOverviewOpen(true);
            }}
            handleSaveColumnWidth={handleSaveColumnWidth}
            handleSaveInlineEdit={handleSaveInlineEdit}
            handleTableMouseOver={handleTableMouseOver}
            handleTableMouseOut={handleTableMouseOut}
            getImageUrl={getImageUrl}
            toggleModal={toggleModal}
          />
        );
      })()}
    </div>
  );

  const trackerLinkHealth = React.useMemo(() => {
    try {
      if (!state.activePage) {
        return {
          status: 'not_a_tracker',
          sourcePageName: null,
          sourcePageExists: false,
          sourceRowCount: 0,
          trackerRowCount: 0,
          matchedRowCount: 0,
          missingInTrackerCount: 0,
          ghostRowCount: 0,
          issues: []
        } as any;
      }
      return checkTrackerLinkHealth(state.activePage, state.pageConfigs, state.pageRows, state.pages);
    } catch (e) {
      console.error("Error computing tracker health:", e);
      return { status: 'not_a_tracker', issues: [] } as any;
    }
  }, [state.activePage, state.pageConfigs, state.pageRows, state.pages]);


  const trackerLinkHealthByPage = React.useMemo(() => {
    const map: Record<string, any> = {};
    for (const page of state.pages) {
      try {
        map[page] = checkTrackerLinkHealth(page, state.pageConfigs, state.pageRows, state.pages);
      } catch (e) {
        console.error(`Error computing tracker health for ${page}:`, e);
        map[page] = { status: 'not_a_tracker', issues: [] };
      }
    }
    return map;
  }, [state.pages, state.pageConfigs, state.pageRows]);

  const isAnyModalOpen =
    Object.values(modals).some((v) => v) ||
    isDupModalOpen ||
    showHistoryLimitModal ||
    clearDBModal.isOpen ||
    isImporting ||
    isExporting;

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden w-full gap-2 pl-2 pr-2 pt-[7px] pb-[6px] ml-0 bg-[#f4f7f6] text-[#333] font-sans box-border">
      <TopHeaderBar
        activePage={state.activePage}
        showTopSettings={showTopSettings}
        setShowTopSettings={setShowTopSettings}
        settingsRef={settingsRef}
        fileInputRef={fileInputRef}
        toggleModal={toggleModal}
        maxSearchHistory={maxSearchHistory}
        setTempHistoryLimit={setTempHistoryLimit}
        setShowHistoryLimitModal={setShowHistoryLimitModal}
        setConfirmationModal={setConfirmationModal}
        setClearDBModal={setClearDBModal}
        localSettings={localSettings}
        handleUpdateLocalSetting={handleUpdateLocalSetting}
        handleImportData={handleImportData}
        setIsDeletePageModalOpen={setIsDeletePageModalOpen}
      />

      <PageTabsBar pages={state.pages} activePage={state.activePage} setState={setState} healthByPage={trackerLinkHealthByPage} />

      {activeConfig.copyBoxConfig && activeConfig.showCopyBoxes !== false && (
        <GlobalCombinationCopyBoxes
          settings={activeConfig.copyBoxConfig}
          box1Value={box1Value}
          box2Value={box2Value}
        />
      )}

      <SearchBarsSection
        activePage={state.activePage}
        activeConfig={activeConfig}
        isAnyModalOpen={isAnyModalOpen}
        pageSearchQueries={pageSearchQueries}
        setPageSearchQueries={setPageSearchQueries}
        setSecondarySearchQuery={setSecondarySearchQuery}
        setActiveSearchView={setActiveSearchView}
        primarySearchTags={primarySearchTags}
        setPrimarySearchTags={setPrimarySearchTags}
        secondarySearchTags={secondarySearchTags}
        setSecondarySearchTags={setSecondarySearchTags}
        maxSearchHistory={maxSearchHistory}
        visibleRowCount={displayRows.length}
        totalRowCount={isSecondaryActive ? (state.pageRows[activeConfig.secondarySearchPage!] || []).length : activeRowsWithSum.length}
        isSearchActive={isSecondaryActive ? secondaryQueries.length > 0 : primaryQueries.length > 0}
      />
      <StorageModeBanner />
      <TrackerLinkStatusBanner health={trackerLinkHealth} />
      <div className="flex-1 min-h-0 overflow-hidden border border-gray-400 rounded-md bg-white flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-[#2b579a] text-base font-bold text-center p-5 flex-col">
            <RefreshCw className="animate-spin mb-2" size={32} />
            Loading Page Data...
          </div>
        ) : !state.activePage ? (
          <div className="flex-1 flex items-center justify-center text-[#90a4ae] text-base font-bold text-center p-5 flex-col">
            Blank Workspace Area
            <br />
            <span className="text-xs font-semibold text-[#b0bec5]">
              (search bar intentionally kept as requested)
            </span>
          </div>
        ) : (
          tableContent
        )}
      </div>

      <CreatePageModal
        isOpen={modals.createPage}
        onClose={closeAllModals}
        onCreate={handleCreatePage}
        existingPages={state.pages}
      />

      <BulkApplySourceModal
        isOpen={modals.bulkApplySource}
        onClose={closeAllModals}
        rows={state.pageRows[bulkApplyContext?.pageName || state.activePage] || []}
        columns={state.pageConfigs[bulkApplyContext?.pageName || state.activePage]?.columns || []}
        context={bulkApplyContext}
        onConfirm={handleConfirmBulkApply}
        decodeHtmlEntities={decodeHtmlEntities}
        parseMultiSource={parseMultiSource}
        getImageUrl={getImageUrl}
      />

      <AddRowModal
        isOpen={modals.addRow}
        sourceSuggestionsEnabled={state.sourceSuggestionsEnabled}
        onToggleSourceSuggestions={async (val) => {
          setState((prev) => ({ ...prev, sourceSuggestionsEnabled: val }));
          try {
            await fetch("/api/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                globalCopyBoxes: state.globalCopyBoxes,
                globalRowNoWidth: state.globalRowNoWidth,
                maxSearchHistory,
                pageOrder: state.pages,
                sourceSuggestionsEnabled: val,
              }),
            });
            toast("Source suggestions " + (val ? "enabled" : "disabled"));
          } catch (err) {
            console.error("Failed to save settings:", err);
            toast("Failed to save settings");
          }
        }}
        onClose={closeAllModals}
        onApplySourceToAll={handleApplySourceToAll}
        onPropagateSourceColors={handlePropagateSourceColors}
        onBack={
          returnToImagePreview && previewContext?.rowId && previewContext?.imageKey
            ? () => {
                setModals((prev) => ({ ...prev, addRow: false, imagePreview: true }));
                setEditingRowId(null);
                setEditingPageName(null);
                setReturnToImagePreview(false);
              }
            : returnToSettings
              ? () => {
                  closeAllModals();
                  toggleModal("activePageSettings", true);
                }
              : undefined
        }
        backText={
          returnToImagePreview && previewContext?.rowId && previewContext?.imageKey
            ? "Back to Image Preview"
            : "Back to Active Page Settings"
        }
        onSave={(rows) =>
          handleSaveRows(
            rows,
            previewContext?.pageName || editingPageName || undefined,
          )
        }
        onDelete={(id) => {
          handleDeleteRow(
            id,
            previewContext?.pageName || editingPageName || undefined,
          );
          closeAllModals();
        }}
        columns={
          previewContext
            ? state.pageConfigs[previewContext.pageName]?.columns || []
            : editingPageName
              ? state.pageConfigs[editingPageName]?.columns || []
              : activeConfig.columns
        }
        editingRow={
          editingRowId
            ? (
                state.pageRows[
                  previewContext?.pageName ||
                    editingPageName ||
                    state.activePage
                ] || []
              ).find((r) => r.id === editingRowId) || null
            : null
        }
        editingRowIndex={
          editingRowId
            ? (
                state.pageRows[
                  previewContext?.pageName ||
                    editingPageName ||
                    state.activePage
                ] || []
              ).findIndex((r) => r.id === editingRowId)
            : -1
        }
        activePage={
          previewContext?.pageName || editingPageName || state.activePage
        }
        allRows={state.pageRows[previewContext?.pageName || editingPageName || state.activePage] || []}
        allPagesRows={state.pageRows}
        isLiveTracker={!!rawActiveConfig.linkedSourcePage}
        onToggleMagicPasteColumn={handleToggleMagicPasteColumn}
        setConfirmationModal={setConfirmationModal}
        getImageUrl={getImageUrl}
      />

      {modals.manageTrackerColumns && rawActiveConfig.linkedSourcePage && (
        <ManageTrackerColumnsModal
          isOpen={modals.manageTrackerColumns}
          onClose={closeAllModals}
          onBack={() => {
            closeAllModals();
            toggleModal("activePageSettings", true);
          }}
          activeConfig={rawActiveConfig}
          pageConfigs={state.pageConfigs}
          pageRows={state.pageRows}
          onSave={async (cols) => {
            await handleManageTrackerColumns(cols);
            closeAllModals();
          }}
          onOpenRelinkTracker={() => {
            toggleModal("manageTrackerColumns", false);
            toggleModal("relinkTracker", true);
          }}
        />
      )}
      
      <ActivePageSettingsModal
        isOpen={modals.activePageSettings}
        onClose={closeAllModals}
        activePage={state.activePage}
        pageConfig={state.activePage ? activeConfig : null}
        pageRows={state.pageRows}
        pageConfigs={state.pageConfigs}
        onSave={handleSaveActivePageSettings}
        onDeleteColumn={handleDeleteColumnOptions}
        onSyncTracker={handleSyncTracker}
        onOpenRelinkTracker={() => {
          toggleModal("activePageSettings", false);
          toggleModal("relinkTracker", true);
        }}
        onManageTrackerColumns={async () => {
          if (activeConfig.linkedSourcePage) {
            await loadSourcePageIfNeeded(activeConfig.linkedSourcePage);
          }
          setReturnToSettings(true);
          toggleModal("activePageSettings", false);
          toggleModal("manageTrackerColumns", true);
        }}
        onRenamePage={() => {
          setReturnToSettings(true);
          toggleModal("activePageSettings", false);
          toggleModal("renamePage", true);
        }}
        onCreateColumn={() => {
          setReturnToSettings(true);
          toggleModal("activePageSettings", false);
          toggleModal("createColumn", true);
        }}
        onAddRow={() => {
          setReturnToSettings(true);
          toggleModal("activePageSettings", false);
          toggleModal("addRow", true);
        }}
        onEditColumn={handleEditColumnClick}
        onDeletePage={handleDeletePage}
        onReorderSearchBars={() => {
          setReturnToSettings(true);
          toggleModal("activePageSettings", false);
          toggleModal("reorderSearchBars", true);
        }}
        onImportExcel={() => {
          setReturnToSettings(true);
          toggleModal("activePageSettings", false);
          toggleModal("excelImport", true);
        }}
        onExportExcel={() => {
          setReturnToSettings(true);
          toggleModal("activePageSettings", false);
          toggleModal("excelExport", true);
        }}
        onImportPageJson={(file) => {
          handleImportPageData(file);
        }}
        onFindDuplicates={() => {
          setReturnToSettings(true);
          toggleModal("activePageSettings", false);
          setIsDupModalOpen(true);
        }}
        onClearPageData={() => handleClearPageData(state.activePage)}
        existingPages={state.pages}
        setConfirmationModal={setConfirmationModal}
        onCreateTracker={async (sourcePage) => {
          await loadSourcePageIfNeeded(sourcePage);
          setTrackerSelectionModalSource(sourcePage);
          closeAllModals();
        }}
        onConfigureCopyBoxes={() => {
          setReturnToSettings(true);
          toggleModal("activePageSettings", false);
          toggleModal("globalCopyBoxesSettings", true);
        }}
      />

      {modals.relinkTracker && rawActiveConfig.linkedSourcePage && (
        <RelinkTrackerModal
          isOpen={modals.relinkTracker}
          onClose={closeAllModals}
          trackerName={state.activePage}
          trackerConfig={rawActiveConfig}
          pageConfigs={state.pageConfigs}
          onRelinkSuccess={handleRelinkTrackerSuccess}
        />
      )}

      <CreateTrackerSelectionModal
        isOpen={!!trackerSelectionModalSource}
        onClose={() => setTrackerSelectionModalSource(null)}
        sourcePage={trackerSelectionModalSource || ""}
        sourceColumns={
          trackerSelectionModalSource
            ? state.pageConfigs[trackerSelectionModalSource]?.columns || []
            : []
        }
        sourceRows={
          trackerSelectionModalSource
            ? state.pageRows[trackerSelectionModalSource] || []
            : []
        }
        onConfirm={(selectedColKeys) => {
          if (trackerSelectionModalSource) {
            handleCreateTracker(trackerSelectionModalSource, selectedColKeys);
          }
          setTrackerSelectionModalSource(null);
        }}
      />

      <RenamePageModal
        isOpen={modals.renamePage}
        onClose={closeAllModals}
        onBack={() => {
          closeAllModals();
          toggleModal("activePageSettings", true);
        }}
        activePage={state.activePage}
        onRename={handleRenamePage}
        existingPages={state.pages}
      />

      <CreateColumnModal
        isOpen={modals.createColumn}
        onClose={closeAllModals}
        onBack={() => {
          closeAllModals();
          toggleModal("activePageSettings", true);
        }}
        onSave={handleCreateColumns}
        existingColumns={activeConfig.columns}
      />

      <EditColumnModal
        isOpen={modals.editColumn}
        onClose={closeAllModals}
        onBack={() => {
          closeAllModals();
          toggleModal("activePageSettings", true);
        }}
        onSave={handleSaveEditedColumn}
        onUpdate={handleUpdateColumnPreview}
        column={editingColumn}
        existingColumns={activeConfig.columns}
        rows={state.pageRows[state.activePage] || []}
      />

      
      <RetiredSourcesOverviewModal
        pageName={state.activePage}
        isOpen={isRetiredSourcesOverviewOpen}
        initialSelectedSources={retiredOverviewFilterSources}
        onClose={() => {
          setRetiredSourcesOverviewOpen(false);
          if (!isRetiredOverviewStandalone) {
            setIsArchiveModalOpen(true);
          } else {
            setIsRetiredOverviewStandalone(false);
          }
        }}
        rows={activeRows}
        columns={activeConfig?.columns || []}
        initialColWidths={activeConfig?.retiredOverviewColWidths || {}}
        onSaveColWidths={(w) => handleSaveActivePageSettings({ ...activeConfig, retiredOverviewColWidths: w } as any, false)}
        initialPinnedCols={activeConfig?.retiredOverviewPinnedCols || []}
        onSavePinnedCols={(c) => handleSaveActivePageSettings({ ...activeConfig, retiredOverviewPinnedCols: c } as any, false)}
        onImageClick={(rowId, imageKey) => {
          setPreviewContext({ rowId, imageKey, pageName: state.activePage, disableActions: true });
          toggleModal("imagePreview", true);
        }}
      />
      <ActiveSourcesOverviewModal
        pageName={state.activePage}
        isOpen={isActiveSourcesOverviewOpen}
        initialSelectedSources={activeOverviewFilterSources}
        onClose={() => {
          setActiveSourcesOverviewOpen(false);
        }}
        rows={activeRows}
        columns={activeConfig?.columns || []}
        initialColWidths={activeConfig?.activeOverviewColWidths || {}}
        onSaveColWidths={(w) => handleSaveActivePageSettings({ ...activeConfig, activeOverviewColWidths: w } as any, false)}
        initialPinnedCols={activeConfig?.activeOverviewPinnedCols || []}
        onSavePinnedCols={(c) => handleSaveActivePageSettings({ ...activeConfig, activeOverviewPinnedCols: c } as any, false)}
        onImageClick={(rowId, imageKey) => {
          setPreviewContext({ rowId, imageKey, pageName: state.activePage, disableActions: true });
          toggleModal("imagePreview", true);
        }}
      />

      {/* ConfirmationModal is now global */}

      
      <DeletePageModal
        isOpen={isDeletePageModalOpen}
        onClose={() => setIsDeletePageModalOpen(false)}
        state={state}
        setState={setState}
        setConfirmationModal={setConfirmationModal}
        onDeletePage={handleDeletePage}
      />

      <ConfirmationModal
        isOpen={!!confirmationModal?.isOpen}
        onClose={() => setConfirmationModal(null)}
        onConfirm={() => {
          if (confirmationModal?.onConfirm) {
            confirmationModal.onConfirm();
          }
          setConfirmationModal(null);
        }}
        title={confirmationModal?.title}
        message={confirmationModal?.message}
        confirmLabel={confirmationModal?.confirmLabel}
      />

      <ImagePreviewModal
        isOpen={modals.imagePreview}
        onClose={closeAllModals}
        actionsDisabled={shouldDisableImagePreviewActions(previewContext, state.pageConfigs)}
        row={
          previewContext
            ? (state.pageRows[previewContext.pageName] || []).find(
                (r) => r.id === previewContext.rowId,
              ) || null
            : null
        }
        imageColKey={previewContext?.imageKey || ""}
        columns={
          previewContext
            ? state.pageConfigs[previewContext.pageName]?.columns || []
            : activeConfig.columns
        }
        rowIndex={
          previewContext
            ? (state.pageRows[previewContext.pageName] || []).findIndex(
                (r) => r.id === previewContext.rowId,
              )
            : -1
        }
        onEditRow={() => {
          setReturnToImagePreview(true);
          toggleModal("imagePreview", false);
          setEditingRowId(previewContext?.rowId || null);
          setEditingPageName(previewContext?.pageName || null);
          toggleModal("addRow", true);
        }}
        onReplaceImage={(newImage) =>
          handleReplaceImage(newImage, previewContext?.pageName)
        }
        onDeleteImage={(rowId, imageKey) =>
          handleDeleteImage(rowId, imageKey, previewContext?.pageName)
        }
        activePopupId={activePopupId}
        setActivePopupId={setActivePopupId}
        activeAnchor={activeAnchor}
        setActiveAnchor={setActiveAnchor}
        pageName={previewContext?.pageName || state.activePage}
        onCopy={(item, colKey, pageName) => {
          const activeCopyCfg =
            state.pageConfigs[state.activePage]?.copyBoxConfig;
          if (activeCopyCfg) {
            if (
              activeCopyCfg.box1.sourcePage === pageName &&
              activeCopyCfg.box1.sourceColumn === colKey
            ) {
              setBox1Value(item);
            }
            if (
              activeCopyCfg.box2.sourcePage === pageName &&
              activeCopyCfg.box2.sourceColumn === colKey
            ) {
              setBox2Value(item);
            }
          }
        }}
        getImageUrl={getImageUrl}
      />

      <ReorderPagesModal
        isOpen={modals.reorderPages}
        onClose={closeAllModals}
        pages={state.pages}
        onReorder={async (newPages) => {
          setState((prev) => ({ ...prev, pages: newPages }));
          try {
            await fetch("/api/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                globalCopyBoxes: state.globalCopyBoxes,
                globalRowNoWidth: state.globalRowNoWidth,
                maxSearchHistory,
                pageOrder: newPages,
                sourceSuggestionsEnabled: state.sourceSuggestionsEnabled,
              }),
            });
          } catch (err) {
            console.error("Failed to save page order:", err);
            toast("Failed to save page order to database");
          }
        }}
      />

      <ReorderSearchBarsModal
        isOpen={modals.reorderSearchBars}
        onClose={() => {
          closeAllModals();
          setReturnToSettings(false);
        }}
        onBack={() => {
          closeAllModals();
          toggleModal("activePageSettings", true);
          setReturnToSettings(false);
        }}
        order={activeConfig.searchBarOrder || ["primary", "secondary"]}
        activePageName={state.activePage}
        secondaryPageName={activeConfig.secondarySearchPage || ""}
        onReorder={(newOrder) => {
          setState((prev) => ({
            ...prev,
            pageConfigs: {
              ...prev.pageConfigs,
              [state.activePage]: {
                ...prev.pageConfigs[state.activePage],
                searchBarOrder: newOrder,
              },
            },
          }));
        }}
      />

      <ExcelImportModal
        isOpen={modals.excelImport}
        onClose={closeAllModals}
        onBack={() => {
          closeAllModals();
          toggleModal("activePageSettings", true);
        }}
        existingColumns={activeConfig.columns}
        existingRows={activeRows}
        importRows={excelImportData.rows}
        setImportRows={(rows) =>
          setExcelImportData((prev) => ({ ...prev, rows }))
        }
        headers={excelImportData.headers}
        setHeaders={(headers) =>
          setExcelImportData((prev) => ({ ...prev, headers }))
        }
        onImport={async (newRows, newColumns) => {
          const currentCols = state.pageConfigs[state.activePage]?.columns || [];
          const updatedCols = [...currentCols, ...newColumns];
          const updatedConfig = {
            ...state.pageConfigs[state.activePage],
            columns: updatedCols,
          };
          const updatedRows = [
            ...(state.pageRows[state.activePage] || []),
            ...newRows,
          ];

          try {
            await Promise.all([
              savePageConfig(state.activePage, updatedConfig),
              appendPageRows(state.activePage, newRows),
            ]);

            setState((prev) => ({
              ...prev,
              pageConfigs: {
                ...prev.pageConfigs,
                [state.activePage]: updatedConfig,
              },
              pageRows: {
                ...prev.pageRows,
                [state.activePage]: updatedRows,
              },
            }));
            toast("Excel data imported successfully");
          } catch (err) {
            console.error(err);
            toast("Failed to import Excel data to database");
          }
        }}
        getImageUrl={getImageUrl}
      />

      {/* --- CUSTOM SUM MODAL --- */}
      {isSumModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-[600px] max-w-[95vw] shadow-2xl">
            <h3 className="text-lg font-bold mb-1 text-purple-800">
              📊 Calculate Range Sum
            </h3>
            <p className="text-xs text-gray-500 mb-5">
              Search and select the range. The total will appear next to
              Remaining Qty.
            </p>

            <QuickRangePanel 
              saleColumns={activeConfig.columns.filter(c => c.type === 'sale_tracker')}
              onSelectQuickRange={(keys, startName, endName) => {
                setActiveCustomSum({
                  startName,
                  endName,
                  keys,
                  selectedSources: sumSelectedSources
                });
                setIsSumModalOpen(false);
                toast(`Sum range calculated for ${startName}`);
              }}
              onToast={toast}
            />
            <div className="flex flex-row gap-4 mb-6">
              {/* Start Column Group */}
              <div className="flex-1 p-3 bg-purple-50/50 rounded-lg border border-purple-100">
                <label className="text-xs font-bold text-purple-700 block mb-2 uppercase tracking-wider">
                  Step 1: Start Column
                </label>
                <input
                  type="text"
                  placeholder="🔍 Search start date..."
                  className="w-full border border-gray-300 p-2 rounded text-sm mb-2 outline-none focus:border-purple-500 bg-white"
                  value={sumStartSearchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSumStartSearchQuery(val);
                    if (val.trim() !== "") {
                      const matched = activeConfig.columns.find(
                        (c) =>
                          c.type === "sale_tracker" &&
                          val
                            .toLowerCase()
                            .split(" ")
                            .filter(Boolean)
                            .every((term) =>
                              c.name.toLowerCase().includes(term),
                            ),
                      );
                      if (matched) setSumStartCol(matched.key);
                    }
                  }}
                />
                <div className="w-full border border-gray-300 rounded overflow-y-auto bg-white max-h-[130px] shadow-inner">
                  {activeConfig.columns
                    .filter(
                      (c) =>
                        c.type === "sale_tracker" &&
                        (sumStartSearchQuery
                          .toLowerCase()
                          .split(" ")
                          .filter(Boolean)
                          .every((term) =>
                            c.name.toLowerCase().includes(term),
                          ) ||
                          c.key === sumStartCol),
                    )
                    .map((c) => (
                      <div
                        key={c.key}
                        onClick={() => setSumStartCol(c.key)}
                        className={`p-2 text-sm cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors flex items-center ${sumStartCol === c.key ? "bg-purple-100 text-purple-900 font-bold border-l-4 border-purple-600" : "hover:bg-purple-50 text-gray-700 border-l-4 border-transparent"}`}
                      >
                        {renderHighlightedText(c.name, sumStartSearchQuery)}
                      </div>
                    ))}
                  {activeConfig.columns.filter(
                    (c) =>
                      c.type === "sale_tracker" &&
                      (sumStartSearchQuery
                        .toLowerCase()
                        .split(" ")
                        .filter(Boolean)
                        .every((term) => c.name.toLowerCase().includes(term)) ||
                        c.key === sumStartCol),
                  ).length === 0 && (
                    <div className="p-3 text-sm text-gray-400 text-center italic font-semibold">
                      No dates found
                    </div>
                  )}
                </div>
              </div>

              {/* End Column Group */}
              <div className="flex-1 p-3 bg-purple-50/50 rounded-lg border border-purple-100">
                <label className="text-xs font-bold text-purple-700 block mb-2 uppercase tracking-wider">
                  Step 2: End Column
                </label>
                <input
                  type="text"
                  placeholder="🔍 Search end date..."
                  className="w-full border border-gray-300 p-2 rounded text-sm mb-2 outline-none focus:border-purple-500 bg-white"
                  value={sumEndSearchQuery}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSumEndSearchQuery(val);
                    if (val.trim() !== "") {
                      const matched = [...activeConfig.columns].reverse().find(
                        (c) =>
                          c.type === "sale_tracker" &&
                          val
                            .toLowerCase()
                            .split(" ")
                            .filter(Boolean)
                            .every((term) =>
                              c.name.toLowerCase().includes(term),
                            ),
                      );
                      if (matched) setSumEndCol(matched.key);
                    }
                  }}
                />
                <div className="w-full border border-gray-300 rounded overflow-y-auto bg-white max-h-[130px] shadow-inner">
                  {activeConfig.columns
                    .filter(
                      (c) =>
                        c.type === "sale_tracker" &&
                        (sumEndSearchQuery
                          .toLowerCase()
                          .split(" ")
                          .filter(Boolean)
                          .every((term) =>
                            c.name.toLowerCase().includes(term),
                          ) ||
                          c.key === sumEndCol),
                    )
                    .map((c) => (
                      <div
                        key={c.key}
                        onClick={() => setSumEndCol(c.key)}
                        className={`p-2 text-sm cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors flex items-center ${sumEndCol === c.key ? "bg-purple-100 text-purple-900 font-bold border-l-4 border-purple-600" : "hover:bg-purple-50 text-gray-700 border-l-4 border-transparent"}`}
                      >
                        {renderHighlightedText(c.name, sumEndSearchQuery)}
                      </div>
                    ))}
                  {activeConfig.columns.filter(
                    (c) =>
                      c.type === "sale_tracker" &&
                      (sumEndSearchQuery
                        .toLowerCase()
                        .split(" ")
                        .filter(Boolean)
                        .every((term) => c.name.toLowerCase().includes(term)) ||
                        c.key === sumEndCol),
                  ).length === 0 && (
                    <div className="p-3 text-sm text-gray-400 text-center italic font-semibold">
                      No dates found
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Step 3: Filter by Source */}
            <div className="mb-6 p-4 bg-purple-50/50 rounded-lg border border-purple-100">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bold text-purple-700 uppercase tracking-wider">
                  Step 3: Filter by Source (Optional)
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setSumSelectedSources(uniqueSourcesInRange)}
                    className="text-[10px] font-extrabold text-purple-600 hover:text-purple-800 uppercase tracking-tight"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSumSelectedSources([])}
                    className="text-[10px] font-extrabold text-red-600 hover:text-red-800 uppercase tracking-tight"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 p-3 bg-white rounded-md border border-purple-100 min-h-[50px]">
                {uniqueSourcesInRange.length > 0 ? (
                  uniqueSourcesInRange.map((source) => {
                    const isSelected = sumSelectedSources.includes(source);
                    return (
                      <button
                        key={source}
                        onClick={() => {
                          setSumSelectedSources((prev) =>
                            prev.includes(source)
                              ? prev.filter((s) => s !== source)
                              : [...prev, source],
                          );
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all border flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-purple-600 text-white border-purple-700 shadow-md transform scale-105"
                            : "bg-white text-gray-600 border-gray-200 hover:border-purple-300 hover:bg-purple-50"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${isSelected ? "bg-white" : "bg-purple-300"}`} />
                        {source}
                      </button>
                    );
                  })
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-400 italic font-medium">
                    Select a range above to populate source filters
                  </div>
                )}
              </div>
              <p className="text-[10px] text-gray-400 mt-2 italic">
                * If no sources are selected, the entire range total will be calculated.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsSumModalOpen(false)}
                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-bold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const saleCols = activeConfig.columns.filter(
                    (c) => c.type === "sale_tracker",
                  );
                  const idx1 = saleCols.findIndex((c) => c.key === sumStartCol);
                  const idx2 = saleCols.findIndex((c) => c.key === sumEndCol);

                  if (idx1 === -1 || idx2 === -1) {
                    toast("Invalid columns selected");
                    return;
                  }

                  const startIdx = Math.min(idx1, idx2);
                  const endIdx = Math.max(idx1, idx2);

                  const keysToSum = saleCols
                    .slice(startIdx, endIdx + 1)
                    .map((c) => c.key);

                  setActiveCustomSum({
                    startName: saleCols[startIdx].name,
                    endName: saleCols[endIdx].name,
                    keys: keysToSum,
                    selectedSources: sumSelectedSources,
                  });

                  setIsSumModalOpen(false);
                  toast(
                    `Calculated sum for ${keysToSum.length} columns.`,
                  );
                }}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded font-bold text-sm shadow-md transition-colors"
              >
                Calculate Sum
              </button>
            </div>
          </div>
        </div>
      )}

      <ExportChoiceModal
        isOpen={modals.exportChoice}
        onClose={closeAllModals}
        onVerifiedExport={handleVerifiedExport}
        onUnverifiedExport={handleExportData}
      />

      <ExcelExportModal
        isOpen={modals.excelExport}
        activeFilterSaleCol={activeFilterSaleCol}
        onClose={closeAllModals}
        onBack={() => {
          closeAllModals();
          toggleModal("activePageSettings", true);
        }}
        pageName={state.activePage}
        columns={activeCustomSum ? activeColumnsWithSum : activeConfig.columns}
        rows={activeCustomSum ? activeRowsWithSum : activeRows}
        lowStockIds={currentLowStockIds}
        isTrackerPage={activeConfig.isTrackerPage}
        linkedSourcePage={activeConfig.linkedSourcePage}
        autoSortBySales={activeConfig.autoSortBySales}
        minStockAlert={activeConfig.minStockAlert}
                initialTrackerQtySort={trackerQtySort}
      />

      <GlobalCopyBoxesSettingsModal
        isOpen={modals.globalCopyBoxesSettings}
        onClose={closeAllModals}
        state={state}
        onSave={async (settings) => {
          try {
            const updatedConfig = {
              ...state.pageConfigs[state.activePage],
              copyBoxConfig: settings,
            };
            await savePageConfig(state.activePage, updatedConfig);
            setState((prev) => ({
              ...prev,
              pageConfigs: {
                ...prev.pageConfigs,
                [state.activePage]: updatedConfig,
              },
            }));
            toast("Page Copy Boxes Settings saved");
          } catch (err) {
            console.error(err);
            toast("Failed to save settings to database");
          }
        }}
      />

      <DuplicateFinderModal
        isOpen={isDupModalOpen}
        onClose={() => {
          setIsDupModalOpen(false);
          setReturnToSettings(false);
        }}
        onBack={() => {
          setIsDupModalOpen(false);
          toggleModal("activePageSettings", true);
        }}
        rows={activeRows}
        columns={activeConfig.columns}
        onDeleteRow={(rowId) => {
          setConfirmationModal({
            isOpen: true,
            title: "Confirm Row Deletion",
            message:
              "Are you sure you want to delete this row? This action cannot be undone.",
            onConfirm: () => {
              handleDeleteRow(rowId);
            },
          });
        }}
      />

      {hoveredImage &&
        createPortal(
          <div
            className="fixed z-[9999] pointer-events-none bg-white p-1 rounded-lg shadow-2xl border border-gray-200"
            style={{
              left: hoveredImage.x + 20,
              top: Math.min(hoveredImage.y - 100, window.innerHeight - 320),
              width: "350px",
              height: "350px",
            }}
          >
            <img
              src={getImageUrl(hoveredImage.url)}
              alt="Hover Preview"
              className="w-full h-full object-contain"
            />
          </div>,
          document.body,
        )}

      {isExporting && (
        <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm text-white">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Processing...{" "}
              {exportProgress.percent !== null && `${exportProgress.percent}%`}
            </h2>
            <p className="text-gray-500 text-center mb-4">
              {exportProgress.message}
            </p>
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              {exportProgress.percent !== null ? (
                <div
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: `${exportProgress.percent}%` }}
                ></div>
              ) : (
                <div className="bg-blue-500 h-full animate-[shimmer_2s_infinite]"></div>
              )}
            </div>
          </div>
        </div>
      )}

      {isImporting && (
        <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/50 backdrop-blur-sm text-white">
          <div className="bg-white p-8 rounded-2xl shadow-2xl flex flex-col items-center max-w-sm w-full mx-4">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
            <h2 className="text-2xl font-bold text-gray-800 mb-2">
              Processing...{" "}
              {importProgress.percent !== null && `${importProgress.percent}%`}
            </h2>
            <p className="text-gray-500 text-center mb-4">
              {importProgress.message}
            </p>
            {importProgress.currentFile && (
              <p className="text-gray-400 text-xs text-center mb-2 truncate w-full" title={importProgress.currentFile}>{importProgress.currentFile}</p>
            )}
            <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
              {importProgress.percent !== null ? (
                <div
                  className="bg-blue-500 h-full transition-all duration-300"
                  style={{ width: `${importProgress.percent}%` }}
                ></div>
              ) : (
                <div className="bg-blue-500 h-full animate-[shimmer_2s_infinite]"></div>
              )}
            </div>
            <p className="mt-4 text-xs text-amber-600 font-medium bg-amber-50 px-3 py-1 rounded-full">
              Please do not close this window
            </p>
          </div>
        </div>
      )}

      {showHistoryLimitModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white p-5 rounded-lg shadow-2xl max-w-sm w-full m-4">
            <h3 className="text-base font-bold text-[#2b579a] mb-2">
              🕒 Search History Limit
            </h3>
            <p className="text-xs text-gray-600 mb-4">
              Set maximum undo/redo states to keep in memory.
            </p>
            <input
              type="number"
              min="1"
              max="500"
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full border border-gray-300 rounded p-2 text-sm mb-4 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={tempHistoryLimit}
              onChange={(e) => setTempHistoryLimit(Number(e.target.value))}
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowHistoryLimitModal(false)}
              >
                Cancel
              </Button>
              <Button
                variant="green"
                onClick={async () => {
                  try {
                    await fetch("/api/settings", {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        globalRowNoWidth: state.globalRowNoWidth,
                        maxSearchHistory: tempHistoryLimit,
                        sourceSuggestionsEnabled: state.sourceSuggestionsEnabled,
                      }),
                    });
                    setMaxSearchHistory(tempHistoryLimit);
                    setShowHistoryLimitModal(false);
                    toast("Limit updated to " + tempHistoryLimit);
                  } catch (err) {
                    toast("Failed to save settings");
                  }
                }}
              >
                Save Limit
              </Button>
            </div>
          </div>
        </div>
      )}

      {clearDBModal.isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white p-6 rounded-lg shadow-2xl max-w-sm w-full border border-red-200 m-4">
            <h3 className="text-lg font-bold text-red-600 mb-2">
              ⚠️ Danger: Clear Database
            </h3>
            <p className="text-sm text-gray-700 mb-5 font-medium min-h-[60px]">
              {clearDBModal.step === 1 &&
                "Step 1/3: Are you sure you want to completely wipe all pages, columns, and data? This cannot be undone."}
              {clearDBModal.step === 2 &&
                "Step 2/3: Are you ABSOLUTELY sure? All your uploaded images and rows will be permanently deleted from the server."}
              {clearDBModal.step === 3 &&
                "Final Step 3/3: This is your last warning. Click Yes to factory reset the entire software."}
            </p>
            <div className="flex gap-3">
              {clearDBModal.yesLeft ? (
                <>
                  <button
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded font-bold text-sm transition-colors border-0 cursor-pointer shadow-sm"
                    onClick={() => {
                      if (clearDBModal.step < 3) {
                        setClearDBModal({
                          isOpen: true,
                          step: clearDBModal.step + 1,
                          yesLeft: Math.random() > 0.5,
                        });
                      } else {
                        setClearDBModal({ ...clearDBModal, isOpen: false });
                        handleClearEntireDB();
                      }
                    }}
                  >
                    Yes, Clear It
                  </button>
                  <button
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded font-bold text-sm transition-colors border-0 cursor-pointer shadow-sm"
                    onClick={() =>
                      setClearDBModal({ isOpen: false, step: 1, yesLeft: true })
                    }
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 py-2 rounded font-bold text-sm transition-colors border-0 cursor-pointer shadow-sm"
                    onClick={() =>
                      setClearDBModal({ isOpen: false, step: 1, yesLeft: true })
                    }
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded font-bold text-sm transition-colors border-0 cursor-pointer shadow-sm"
                    onClick={() => {
                      if (clearDBModal.step < 3) {
                        setClearDBModal({
                          isOpen: true,
                          step: clearDBModal.step + 1,
                          yesLeft: Math.random() > 0.5,
                        });
                      } else {
                        setClearDBModal({ ...clearDBModal, isOpen: false });
                        handleClearEntireDB();
                      }
                    }}
                  >
                    Yes, Clear It
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {isSalePromptOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-[350px] shadow-2xl">
            <h3 className="text-lg font-bold mb-1 text-[#2b579a]">
              Enter Sale Date
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Enter custom duration (e.g., "24-25 April")
            </p>
            <input
              autoFocus
              className="w-full border-2 border-[#d7dde1] p-2.5 rounded-md mb-5 outline-none focus:border-[#2b579a] text-sm font-semibold"
              placeholder="e.g. 24-25 April"
              value={customSaleName}
              onChange={(e) => setCustomSaleName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddSaleColumn()}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsSalePromptOpen(false)}
                className="px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSaleColumn}
                className="px-4 py-1.5 bg-[#2b579a] hover:bg-[#1a3c6d] text-white rounded font-bold text-sm"
              >
                Create Column
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ARCHIVE COLUMNS MODAL --- */}
      {isArchiveModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-[500px] shadow-2xl min-h-[400px] flex flex-col">
            <div className="flex justify-between items-center mb-1">
              <h3 className="text-lg font-bold text-[#2b579a]">
                Archive Columns
              </h3>
              <div className="flex gap-2">
                {activeConfig?.isTrackerPage && (
                  <button
                    onClick={() => {
                      setIsArchiveModalOpen(false);
                      setRetiredOverviewFilterSources(null);
                      setRetiredSourcesOverviewOpen(true);
                    }}
                    className="px-3 py-1 bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 rounded shadow-sm text-xs font-bold flex items-center gap-1 transition-colors"
                  >
                    🗄️ Retired Sources
                  </button>
                )}
                <button
                  onClick={() => {
                    setIsArchiveModalOpen(false);
                    setIsArchiveDeleteModalOpen(true);
                    setSelectedArchiveCols(new Set());
                  }}
                  className="px-3 py-1 bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 rounded shadow-sm text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  🗑️ Delete Columns
                </button>
              </div>
            </div>

            <p className="text-xs text-gray-500 mb-3">
              Manually hide or show your custom sale date columns.
            </p>

            <div className="mb-3 flex flex-col gap-2">
              <input
                type="text"
                autoFocus
                placeholder="🔍 Search dates or columns..."
                className="w-full border-2 border-[#d7dde1] p-2 rounded-md outline-none focus:border-[#2b579a] text-sm font-semibold transition-colors"
                value={archiveSearchQuery}
                onChange={(e) => setArchiveSearchQuery(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => handleBulkArchiveToggle(false)}
                  className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 rounded text-xs font-bold transition-colors border border-green-200 shadow-sm"
                >
                  👁️ Show All
                </button>
                <button
                  onClick={() => handleBulkArchiveToggle(true)}
                  className="px-3 py-1.5 bg-red-50 text-red-700 hover:bg-red-100 rounded text-xs font-bold transition-colors border border-red-200 shadow-sm"
                >
                  🙈 Hide All
                </button>
              </div>
            </div>

            {/* Columns List */}
            <div className="max-h-[300px] overflow-y-auto border-2 border-gray-100 rounded-md p-2 mb-4 bg-gray-50 flex-1">
              {archiveSearchQuery === "" &&
                (() => {
                  const saleCols =
                    activeConfig?.columns.filter(
                      (c) => c.type === "sale_tracker",
                    ) || [];
                  const latestColName =
                    saleCols.length > 0 ? saleCols[0].name : "";
                  return (
                    <div
                      className={`flex justify-between items-center p-2.5 border-b border-gray-200 bg-white mb-1 rounded shadow-sm transition-colors ${activeFilterSaleCol === null ? "bg-blue-50 border border-blue-300" : "hover:bg-gray-50"}`}
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-700">
                          Latest Sale (Default){" "}
                          {latestColName && (
                            <span className="text-sm font-semibold text-[#FFA500] ml-1">
                              ({latestColName})
                            </span>
                          )}
                        </span>
                        {activeFilterSaleCol === null && (
                          <span className="text-[10px] font-bold text-blue-600 mt-0.5">
                            Current Target
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setActiveFilterSaleCol(null)}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${activeFilterSaleCol === null ? "bg-[#2b579a] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300"}`}
                      >
                        {activeFilterSaleCol === null
                          ? "🎯 Target"
                          : "Set Target"}
                      </button>
                    </div>
                  );
                })()}
              {activeConfig?.columns
                .filter(
                  (c) =>
                    c.type === "sale_tracker" &&
                    c.name
                      .toLowerCase()
                      .includes(archiveSearchQuery.toLowerCase()),
                )
                .map((col) => (
                  <div
                    key={col.key}
                    className={`flex justify-between items-center p-2.5 border-b border-gray-200 last:border-b-0 mb-1 rounded shadow-sm transition-colors ${activeFilterSaleCol === col.key ? "bg-blue-50 border border-blue-300" : "bg-white hover:bg-gray-50"}`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold text-gray-700">
                          {renderHighlightedText(col.name, archiveSearchQuery)}
                        </span>
                        {activeFilterSaleCol === col.key && (
                          <span className="text-[10px] font-bold text-blue-600 mt-0.5">
                            Current Target
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => {
                          setActiveFilterSaleCol(col.key);
                          if (col.archived)
                            handleToggleColumnArchive(col.key, true);
                        }}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${activeFilterSaleCol === col.key ? "bg-[#2b579a] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-300"}`}
                      >
                        {activeFilterSaleCol === col.key
                          ? "🎯 Target"
                          : "Set Target"}
                      </button>
                      <button
                        onClick={() =>
                          handleToggleColumnArchive(col.key, !!col.archived)
                        }
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${col.archived ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-red-100 text-red-700 hover:bg-red-200"}`}
                      >
                        {col.archived ? "👁️ Show" : "🙈 Hide"}
                      </button>
                    </div>
                  </div>
                ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => {
                  setIsArchiveModalOpen(false);
                  setArchiveSearchQuery("");
                }}
                className="px-5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-bold text-sm transition-colors shadow-sm"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ARCHIVE DELETE MODAL --- */}
      {isArchiveDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-[9999] flex items-center justify-center">
          <div className="bg-white p-6 rounded-lg w-[500px] shadow-2xl min-h-[400px] flex flex-col">
            <h3 className="text-lg font-bold mb-1 text-red-700">
              Delete Sale Columns
            </h3>

            {archiveBulkDeleteConfirm ? (
              <div className="flex-1 flex flex-col justify-center items-center text-center p-4 animate-in zoom-in duration-200">
                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-4">
                  {archiveBulkDeleteConfirm.type === "smart" ? (
                    <RefreshCw size={32} />
                  ) : (
                    <Trash2 size={32} />
                  )}
                </div>
                <h4 className="text-xl font-bold text-gray-800 mb-2">
                  {archiveBulkDeleteConfirm.type === "smart"
                    ? "Smart Delete"
                    : `Normal Delete (${archiveBulkDeleteConfirm.step}/2)`}
                </h4>
                <p className="text-sm text-gray-600 mb-8 font-medium">
                  {archiveBulkDeleteConfirm.type === "smart"
                    ? `Are you sure? This will permanently deduct sales of ${selectedArchiveCols.size} columns from Total Qty before deleting.`
                    : archiveBulkDeleteConfirm.step === 1
                      ? `Are you sure you want to normal delete ${selectedArchiveCols.size} selected columns? (Use if created by mistake)`
                      : `ABSOLUTELY sure? This deletes data and reverts remaining quantity for all ${selectedArchiveCols.size} columns.`}
                </p>
                <div className="flex gap-3 w-full">
                  <button
                    onClick={() => setArchiveBulkDeleteConfirm(null)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      if (
                        archiveBulkDeleteConfirm.type === "normal" &&
                        archiveBulkDeleteConfirm.step === 1
                      ) {
                        setArchiveBulkDeleteConfirm({
                          type: "normal",
                          step: 2,
                        });
                      } else {
                        handleBulkDeleteSaleColumns(
                          Array.from(selectedArchiveCols),
                          archiveBulkDeleteConfirm.type,
                        );
                        setArchiveBulkDeleteConfirm(null);
                      }
                    }}
                    className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold shadow-lg transition-colors"
                  >
                    {archiveBulkDeleteConfirm.type === "normal" &&
                    archiveBulkDeleteConfirm.step === 1
                      ? "Yes, Continue"
                      : "Confirm Delete"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  Select old sale columns you want to permanently remove.
                </p>

                <div className="mb-3 flex flex-col gap-2">
                  <input
                    type="text"
                    autoFocus
                    placeholder="🔍 Search columns to delete..."
                    className="w-full border-2 border-[#d7dde1] p-2 rounded-md outline-none focus:border-red-400 text-sm font-semibold transition-colors"
                    value={archiveDeleteSearchQuery}
                    onChange={(e) =>
                      setArchiveDeleteSearchQuery(e.target.value)
                    }
                  />
                  <div className="flex justify-between items-center">
                    <button
                      onClick={() => {
                        const filteredCols =
                          activeConfig?.columns.filter(
                            (c) =>
                              c.type === "sale_tracker" &&
                              c.name
                                .toLowerCase()
                                .includes(
                                  archiveDeleteSearchQuery.toLowerCase(),
                                ),
                          ) || [];
                        if (
                          selectedArchiveCols.size === filteredCols.length &&
                          filteredCols.length > 0
                        ) {
                          setSelectedArchiveCols(new Set());
                        } else {
                          setSelectedArchiveCols(
                            new Set(filteredCols.map((c) => c.key)),
                          );
                        }
                      }}
                      className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-bold transition-colors border border-gray-300 shadow-sm"
                    >
                      {activeConfig?.columns.filter(
                        (c) =>
                          c.type === "sale_tracker" &&
                          c.name
                            .toLowerCase()
                            .includes(archiveDeleteSearchQuery.toLowerCase()),
                      ).length === selectedArchiveCols.size &&
                      selectedArchiveCols.size > 0
                        ? "☒ Deselect All"
                        : "☑ Select All"}
                    </button>
                  </div>

                  {selectedArchiveCols.size > 0 && (
                    <div className="flex gap-2 justify-between items-center p-2 bg-red-50 border border-red-200 rounded-md mt-1 animate-in fade-in">
                      <span className="text-[11px] font-bold text-red-800">
                        {selectedArchiveCols.size} selected
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() =>
                            setArchiveBulkDeleteConfirm({
                              type: "normal",
                              step: 1,
                            })
                          }
                          className="px-2 py-1 bg-white text-gray-700 border border-gray-300 hover:bg-gray-100 rounded text-[10px] font-bold transition-colors shadow-sm"
                        >
                          🗑️ Normal Delete
                        </button>
                        <button
                          onClick={() =>
                            setArchiveBulkDeleteConfirm({
                              type: "smart",
                              step: 1,
                            })
                          }
                          className="px-2 py-1 bg-red-600 text-white hover:bg-red-700 rounded text-[10px] font-bold transition-colors shadow-sm"
                        >
                          🧠 Smart Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Columns List to Delete */}
                <div className="max-h-[300px] overflow-y-auto border-2 border-gray-100 rounded-md p-2 mb-4 bg-gray-50 flex-1">
                  {activeConfig?.columns
                    .filter(
                      (c) =>
                        c.type === "sale_tracker" &&
                        c.name
                          .toLowerCase()
                          .includes(archiveDeleteSearchQuery.toLowerCase()),
                    )
                    .map((col) => (
                      <div
                        key={col.key}
                        className={`flex justify-between items-center p-2.5 border-b border-gray-200 last:border-b-0 mb-1 rounded shadow-sm transition-colors bg-white hover:bg-red-50`}
                      >
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            className="w-4 h-4 accent-red-600 cursor-pointer"
                            checked={selectedArchiveCols.has(col.key)}
                            onChange={(e) => {
                              const next = new Set(selectedArchiveCols);
                              if (e.target.checked) next.add(col.key);
                              else next.delete(col.key);
                              setSelectedArchiveCols(next);
                            }}
                          />
                          <div className="flex flex-col">
                            <span
                              className="text-sm font-semibold text-gray-700 cursor-pointer"
                              onClick={() => {
                                const next = new Set(selectedArchiveCols);
                                if (next.has(col.key)) next.delete(col.key);
                                else next.add(col.key);
                                setSelectedArchiveCols(next);
                              }}
                            >
                              {renderHighlightedText(
                                col.name,
                                archiveDeleteSearchQuery,
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  {activeConfig?.columns.filter(
                    (c) => c.type === "sale_tracker",
                  ).length === 0 && (
                    <div className="text-sm text-gray-500 text-center p-4 font-semibold">
                      No custom sale columns found yet.
                    </div>
                  )}
                  {activeConfig?.columns.filter(
                    (c) =>
                      c.type === "sale_tracker" &&
                      c.name
                        .toLowerCase()
                        .includes(archiveDeleteSearchQuery.toLowerCase()),
                  ).length === 0 &&
                    archiveDeleteSearchQuery !== "" && (
                      <div className="text-sm text-red-500 text-center p-4 font-semibold">
                        No columns match your search "{archiveDeleteSearchQuery}
                        ".
                      </div>
                    )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    onClick={() => {
                      setIsArchiveDeleteModalOpen(false);
                      setIsArchiveModalOpen(true);
                      setArchiveDeleteSearchQuery("");
                      setSelectedArchiveCols(new Set());
                      setArchiveBulkDeleteConfirm(null);
                    }}
                    className="px-5 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-bold text-sm transition-colors shadow-sm"
                  >
                    Back to Archive
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ModalStackProvider>
        <AppContent />
      </ModalStackProvider>
    </ToastProvider>
  );
}
