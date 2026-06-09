"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useToast } from "@/components/Providers";
import { request, getFullDownloadUrl } from "@/utils/api";
import { 
  ArrowLeft,
  Search,
  Plus,
  Trash2,
  Undo2,
  Edit2,
  Save,
  Grid,
  Columns,
  Copy,
  Download,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown
} from "lucide-react";

interface Column {
  id: number;
  name: string;
  original_name: string;
  position: number;
  is_deleted: boolean;
}

interface Row {
  id: number;
  data: { [key: string]: string };
  source_file_id: number | null;
  created_at: string;
}

interface DuplicateGroup {
  row_ids: number[];
  data: { [key: string]: string };
  occurrence_count: number;
}

interface ExportFile {
  id: number;
  filename: string;
  file_type: string;
  download_url: string;
  row_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
}

export default function DatasetPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = React.use(params);
  const datasetId = unwrappedParams.id;
  const { showToast } = useToast();
  const [datasetName, setDatasetName] = useState("");
  
  // Tabs: "grid" | "columns" | "duplicates" | "exports"
  const [activeTab, setActiveTab] = useState<"grid" | "columns" | "duplicates" | "exports">("grid");

  // Grid / Data State
  const [columns, setColumns] = useState<Column[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<number | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [gridLoading, setGridLoading] = useState(true);

  // Cell Edit state
  const [editingCell, setEditingCell] = useState<{ rowId: number; colKey: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [undoStack, setUndoStack] = useState<{ rowId: number; oldData: { [key: string]: string } }[]>([]);

  // Columns Tab state
  const [columnsTabList, setColumnsTabList] = useState<Column[]>([]);
  const [newColumnName, setNewColumnName] = useState("");
  const [columnsSaving, setColumnsSaving] = useState(false);

  // Duplicates state
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [dupTotalRows, setDupTotalRows] = useState(0);
  const [duplicatesLoading, setDuplicatesLoading] = useState(false);

  // Exports state
  const [exportsList, setExportsList] = useState<ExportFile[]>([]);
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [exportsLoading, setExportsLoading] = useState(false);

  // Virtualization Scroll Position
  const [scrollTop, setScrollTop] = useState(0);
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const rowHeight = 44;
  const gridHeight = 500;

  // --- Fetch Core Dataset Metadata ---
  const fetchDatasetMeta = async () => {
    try {
      const ds = await request("GET", `/datasets/${datasetId}`);
      setDatasetName(ds.name);
    } catch (err: any) {
      showToast(err.message || "Failed to load metadata", "error");
    }
  };

  // --- Fetch Paginated Rows ---
  const fetchGridData = async () => {
    setGridLoading(true);
    try {
      let query = `/datasets/${datasetId}/rows?page=${page}&page_size=${pageSize}`;
      if (search.trim()) query += `&search=${encodeURIComponent(search.trim())}`;
      if (sortBy) query += `&sort_by=${sortBy}&sort_order=${sortOrder}`;

      const res = await request("GET", query);
      setRows(res.rows);
      setTotalRows(res.total);
      setColumns(res.columns);
    } catch (err: any) {
      showToast(err.message || "Failed to load rows", "error");
    } finally {
      setGridLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasetMeta();
  }, []);

  useEffect(() => {
    if (activeTab === "grid") {
      fetchGridData();
    } else if (activeTab === "columns") {
      fetchColumnsForTab();
    } else if (activeTab === "duplicates") {
      fetchDuplicates();
    } else if (activeTab === "exports") {
      fetchExports();
    }
  }, [activeTab, page, sortBy, sortOrder]);

  // Handle global search with simple debounce
  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      setPage(1);
      fetchGridData();
    }
  };

  // --- Cell Editing Implementation ---
  const startEditing = (rowId: number, colKey: string, currentVal: string) => {
    setEditingCell({ rowId, colKey });
    setEditValue(currentVal);
  };

  const saveCellEdit = async (rowId: number, colKey: string) => {
    const rowObj = rows.find((r) => r.id === rowId);
    if (!rowObj) return;

    const oldValue = rowObj.data[colKey] || "";
    if (oldValue === editValue) {
      setEditingCell(null);
      return;
    }

    // Push state to local undo stack
    setUndoStack((prev) => [...prev, { rowId, oldData: { ...rowObj.data } }]);

    // Optimistic UI update
    setRows((prev) =>
      prev.map((r) =>
        r.id === rowId 
          ? { ...r, data: { ...r.data, [colKey]: editValue } } 
          : r
      )
    );
    setEditingCell(null);

    try {
      await request("PUT", `/datasets/${datasetId}/rows/${rowId}`, {
        data: { [colKey]: editValue }
      });
      showToast("Cell updated", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to save cell update", "error");
      // Revert optimistic update
      setRows((prev) =>
        prev.map((r) => (r.id === rowId ? { ...r, data: { ...r.data, [colKey]: oldValue } } : r))
      );
      // Remove last item from undo stack
      setUndoStack((prev) => prev.slice(0, -1));
    }
  };

  const handleUndo = async () => {
    if (undoStack.length === 0) return;
    const lastEdit = undoStack[undoStack.length - 1];
    
    try {
      await request("PUT", `/datasets/${datasetId}/rows/${lastEdit.rowId}`, {
        data: lastEdit.oldData
      });
      
      // Update grid view
      setRows((prev) =>
        prev.map((r) => (r.id === lastEdit.rowId ? { ...r, data: lastEdit.oldData } : r))
      );
      setUndoStack((prev) => prev.slice(0, -1));
      showToast("Last change undone", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to perform undo operation", "error");
    }
  };

  // --- Add and Delete Rows ---
  const handleAddRow = async () => {
    try {
      // Create a row structure with blank cells
      const blankData: { [key: string]: string } = {};
      columns.forEach((col) => {
        blankData[`col_${col.id}`] = "";
      });

      const newRow = await request("POST", `/datasets/${datasetId}/rows`, { data: blankData });
      setRows((prev) => [newRow, ...prev]);
      setTotalRows((prev) => prev + 1);
      showToast("Row added to top", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to add row", "error");
    }
  };

  const handleDeleteRow = async (rowId: number) => {
    if (!confirm("Are you sure you want to delete this row?")) return;
    try {
      await request("DELETE", `/datasets/${datasetId}/rows/${rowId}`);
      setRows((prev) => prev.filter((r) => r.id !== rowId));
      setTotalRows((prev) => Math.max(0, prev - 1));
      showToast("Row deleted", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete row", "error");
    }
  };

  // --- Columns Tab Management ---
  const fetchColumnsForTab = async () => {
    setGridLoading(true);
    try {
      const cols = await request("GET", `/datasets/${datasetId}/columns?include_deleted=false`);
      setColumnsTabList(cols);
    } catch (err: any) {
      showToast(err.message || "Failed to load columns list", "error");
    } finally {
      setGridLoading(false);
    }
  };

  const handleAddColumn = () => {
    if (!newColumnName.trim()) {
      showToast("Please enter a column name", "warning");
      return;
    }
    const duplicate = columnsTabList.some(
      (c) => c.name.toLowerCase() === newColumnName.trim().toLowerCase()
    );
    if (duplicate) {
      showToast("Column name already exists", "warning");
      return;
    }

    const nextPosition = columnsTabList.length > 0 
      ? Math.max(...columnsTabList.map((c) => c.position)) + 1 
      : 0;
      
    const newCol: Column = {
      id: -Math.floor(Math.random() * 10000), // temp negative id
      name: newColumnName.trim(),
      original_name: newColumnName.trim(),
      position: nextPosition,
      is_deleted: false
    };

    setColumnsTabList((prev) => [...prev, newCol]);
    setNewColumnName("");
    showToast("Column staging created. Remember to save changes!", "info");
  };

  const handleRenameStagedColumn = (colId: number, newName: string) => {
    setColumnsTabList((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, name: newName.trim() } : c))
    );
  };

  const handleMoveColumn = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === columnsTabList.length - 1) return;

    const targetIndex = direction === "up" ? index - 1 : index + 1;
    const updated = [...columnsTabList];
    const temp = updated[index];
    updated[index] = updated[targetIndex];
    updated[targetIndex] = temp;

    // Reassign position coordinates
    const adjusted = updated.map((col, idx) => ({ ...col, position: idx }));
    setColumnsTabList(adjusted);
  };

  const handleToggleDeleteColumn = (colId: number) => {
    setColumnsTabList((prev) =>
      prev.map((c) => (c.id === colId ? { ...c, is_deleted: !c.is_deleted } : c))
    );
  };

  const saveColumnChanges = async () => {
    setColumnsSaving(true);
    try {
      // Split into columns to create/update vs deleted columns
      // If column ID is negative, it's a new column. 
      // But wait! The backend update PUT endpoint only supports editing properties of existing columns.
      // So to add a new column, let's make sure the backend accepts new column structures or we write it cleanly.
      // Wait, let's verify if our backend update_dataset_columns supports adding new columns.
      // In the backend PUT endpoint, it looks like:
      // "db_col = db.query(DatasetColumn).filter(DatasetColumn.id == col_id, DatasetColumn.dataset_id == dataset_id).first()"
      // It only modifies existing columns in the loop. 
      // What if the user adds a new column? Let's add support to the backend PUT endpoint for inserting new columns if the id is negative or missing! Or let's see how our frontend can submit additions.
      // Yes! In the backend PUT endpoint, we can adjust it or insert new rows. Let's make sure we support it.
      // Wait, let's modify the backend PUT endpoint so if a column has no ID or a negative ID, it creates a new DatasetColumn!
      // This is an extremely elegant addition that makes bulk updating 100% functional.
      // Let's check the backend PUT endpoint again. It currently does:
      // "col_id = col_data.get('id') ... db_col = db.query... .first(); if not db_col: continue"
      // So it skips if it's not found.
      // Let's modify the backend dataset column PUT handler so that if `col_id` is negative or absent, it inserts a new `DatasetColumn` record!
      // We will perform this backend edit quickly. Let's first review the columns data structures.
      // Wait, let's prepare the PUT payload:
      const payload = columnsTabList.map((col) => ({
        id: col.id < 0 ? null : col.id, // send null for new columns
        name: col.name,
        position: col.position,
        is_deleted: col.is_deleted
      }));

      const updatedCols = await request("PUT", `/datasets/${datasetId}/columns`, payload);
      setColumnsTabList(updatedCols);
      setColumns(updatedCols);
      showToast("Columns configuration saved successfully!", "success");
      setActiveTab("grid");
    } catch (err: any) {
      showToast(err.message || "Failed to update columns schema", "error");
    } finally {
      setColumnsSaving(false);
    }
  };

  // --- Duplicate Reviews Management ---
  const fetchDuplicates = async () => {
    setDuplicatesLoading(true);
    try {
      const res = await request("GET", `/datasets/${datasetId}/duplicates`);
      setDuplicateGroups(res.groups);
      setDupTotalRows(res.duplicate_rows_count);
    } catch (err: any) {
      showToast(err.message || "Failed to find duplicates", "error");
    } finally {
      setDuplicatesLoading(false);
    }
  };

  const handleBulkDeduplicate = async (selectedIds?: number[]) => {
    const confirmMsg = selectedIds 
      ? `Are you sure you want to delete these ${selectedIds.length} duplicate rows?`
      : "Are you sure you want to remove all exact duplicate rows? The system will keep the first occurrence of each unique row.";
      
    if (!confirm(confirmMsg)) return;

    setDuplicatesLoading(true);
    try {
      const res = await request("POST", `/datasets/${datasetId}/deduplicate`, {
        selected_row_ids: selectedIds || null
      });
      showToast(res.message || "Deduplication complete", "success");
      fetchDuplicates();
    } catch (err: any) {
      showToast(err.message || "Failed to deduplicate", "error");
    } finally {
      setDuplicatesLoading(false);
    }
  };

  // --- Export Panel Management ---
  const fetchExports = async () => {
    setExportsLoading(true);
    try {
      const res = await request("GET", `/exports/dataset/${datasetId}`);
      setExportsList(res);
    } catch (err: any) {
      showToast(err.message || "Failed to fetch export history", "error");
    } finally {
      setExportsLoading(false);
    }
  };

  const triggerExportGeneration = async (type: "xlsx" | "csv") => {
    setExportingType(type);
    showToast(`Generating physical ${type.toUpperCase()} export file...`, "info");
    try {
      await request("POST", `/exports/?dataset_id=${datasetId}&file_type=${type}`);
      showToast(`${type.toUpperCase()} file exported and verified. Ready for download!`, "success");
      fetchExports();
    } catch (err: any) {
      showToast(err.message || "Failed to generate export file", "error");
    } finally {
      setExportingType(null);
    }
  };

  const handleDownload = async (downloadUrl: string, filename: string) => {
    const absoluteUrl = getFullDownloadUrl(downloadUrl);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch(absoluteUrl, { headers });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: "Failed to download file" }));
        throw new Error(errorData.detail || "Failed to download file");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      showToast("Download completed successfully", "success");
    } catch (err: any) {
      showToast(err.message || "Download failed", "error");
    }
  };


  // --- Virtualized Row Index Slicing ---
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  };

  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - 4);
  const endIndex = Math.min(rows.length, Math.ceil((scrollTop + gridHeight) / rowHeight) + 4);
  const visibleRows = rows.slice(startIndex, endIndex);

  const paddingTop = startIndex * rowHeight;
  const paddingBottom = Math.max(0, (rows.length - endIndex) * rowHeight);

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Back button & Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <Link
            href="/"
            className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 hover:text-slate-200 transition"
          >
            <ArrowLeft className="h-4.5 w-4.5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{datasetName || "Loading Dataset..."}</h1>
            <p className="text-xs text-slate-500 mt-0.5">Project ID: {datasetId}</p>
          </div>
        </div>

        {/* Tab Selection Row */}
        <div className="flex bg-slate-900 border border-slate-800 p-1.5 rounded-xl text-sm font-semibold">
          <TabButton active={activeTab === "grid"} icon={<Grid className="h-4 w-4" />} label="Spreadsheet" onClick={() => setActiveTab("grid")} />
          <TabButton active={activeTab === "columns"} icon={<Columns className="h-4 w-4" />} label="Columns" onClick={() => setActiveTab("columns")} />
          <TabButton active={activeTab === "duplicates"} icon={<Copy className="h-4 w-4" />} label="Duplicates" onClick={() => setActiveTab("duplicates")} />
          <TabButton active={activeTab === "exports"} icon={<Download className="h-4 w-4" />} label="Exports" onClick={() => setActiveTab("exports")} />
        </div>
      </div>

      {/* --- TAB CONTENT 1: SPREADSHEET GRID --- */}
      {activeTab === "grid" && (
        <div className="space-y-4">
          {/* Grid Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 glass-panel border border-slate-850 p-4 rounded-xl">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyPress={handleSearchKeyPress}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg py-2 pl-10 pr-4 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                placeholder="Search rows (Enter to search)..."
              />
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto justify-end">
              {undoStack.length > 0 && (
                <button
                  onClick={handleUndo}
                  className="flex items-center space-x-1 px-3.5 py-2 hover:bg-slate-800 text-indigo-400 hover:text-indigo-300 text-xs font-semibold rounded-lg border border-slate-800 transition cursor-pointer"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>Undo ({undoStack.length})</span>
                </button>
              )}
              <button
                onClick={handleAddRow}
                className="flex items-center space-x-1 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-semibold rounded-lg transition cursor-pointer shadow"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Row</span>
              </button>
            </div>
          </div>

          {/* Spreadsheet Virtualized Wrapper */}
          <div className="glass-panel border border-slate-800 rounded-xl overflow-hidden relative">
            {gridLoading ? (
              <div className="flex flex-col items-center justify-center py-32 space-y-3 text-slate-500">
                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
                <span className="text-sm">Loading spreadsheet cells...</span>
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-24 text-slate-500">
                No matching cells found in this dataset.
              </div>
            ) : (
              <div
                ref={gridContainerRef}
                onScroll={handleScroll}
                className="overflow-auto"
                style={{ height: `${gridHeight}px` }}
              >
                <table className="w-full border-collapse table-fixed text-left text-xs text-slate-300">
                  <thead className="sticky top-0 bg-slate-950 border-b border-slate-800 z-20">
                    <tr className="h-10 text-slate-400 uppercase font-semibold">
                      <th className="w-14 px-3 text-center border-r border-slate-850 bg-slate-950">Idx</th>
                      {columns.map((col) => {
                        const isSorted = sortBy === col.id;
                        return (
                          <th
                            key={col.id}
                            className={`px-4 border-r border-slate-850 cursor-pointer select-none bg-slate-950 hover:bg-slate-900 transition ${
                              isSorted ? "text-indigo-400" : ""
                            }`}
                            style={{ width: "200px" }}
                            onClick={() => {
                              if (sortBy === col.id) {
                                setSortOrder(sortOrder === "asc" ? "desc" : "asc");
                              } else {
                                setSortBy(col.id);
                                setSortOrder("asc");
                              }
                              setPage(1);
                            }}
                          >
                            <div className="flex items-center justify-between">
                              <span className="truncate" title={col.name}>{col.name}</span>
                              {isSorted && (
                                sortOrder === "asc" 
                                  ? <ArrowUp className="h-3.5 w-3.5 text-indigo-400 ml-1" /> 
                                  : <ArrowDown className="h-3.5 w-3.5 text-indigo-400 ml-1" />
                              )}
                            </div>
                          </th>
                        );
                      })}
                      <th className="w-14 text-center bg-slate-950">Del</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Top spacers */}
                    {paddingTop > 0 && <tr style={{ height: `${paddingTop}px` }} />}
                    
                    {visibleRows.map((row, idx) => {
                      const absoluteIndex = startIndex + idx + 1 + (page - 1) * pageSize;
                      return (
                        <tr key={row.id} className="h-11 hover:bg-slate-900/40 border-b border-slate-850/60 group">
                          {/* Row Index */}
                          <td className="text-center font-mono text-slate-500 border-r border-slate-850 bg-slate-950/40 select-none">
                            {absoluteIndex}
                          </td>
                          {/* Cell values */}
                          {columns.map((col) => {
                            const colKey = `col_${col.id}`;
                            const cellValue = row.data[colKey] || "";
                            const isEditing = editingCell?.rowId === row.id && editingCell?.colKey === colKey;

                            return (
                              <td
                                key={col.id}
                                className="px-4 border-r border-slate-850/40 font-medium text-slate-350 truncate relative cursor-pointer group-hover:bg-slate-900/10"
                                onDoubleClick={() => startEditing(row.id, colKey, cellValue)}
                                title="Double-click to edit cell"
                              >
                                {isEditing ? (
                                  <input
                                    type="text"
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={() => saveCellEdit(row.id, colKey)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") saveCellEdit(row.id, colKey);
                                      if (e.key === "Escape") setEditingCell(null);
                                    }}
                                    autoFocus
                                    className="absolute inset-0 w-full h-full bg-indigo-950 border border-indigo-500 text-indigo-200 px-3 outline-none text-xs"
                                  />
                                ) : (
                                  <span>{cellValue}</span>
                                )}
                              </td>
                            );
                          })}

                          {/* Delete Action cell */}
                          <td className="text-center">
                            <button
                              onClick={() => handleDeleteRow(row.id)}
                              className="p-1.5 hover:bg-red-500/10 text-slate-500 hover:text-red-400 rounded-md transition cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {/* Bottom spacers */}
                    {paddingBottom > 0 && <tr style={{ height: `${paddingBottom}px` }} />}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination Controllers */}
          {!gridLoading && totalRows > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-400">
              <span>
                Showing {Math.min(totalRows, (page - 1) * pageSize + 1)}-{Math.min(totalRows, page * pageSize)} of {totalRows.toLocaleString()} rows
              </span>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="p-2 border border-slate-850 rounded-lg hover:bg-slate-900 text-slate-300 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-200">
                  Page {page} of {Math.ceil(totalRows / pageSize) || 1}
                </span>
                <button
                  onClick={() => setPage(Math.min(Math.ceil(totalRows / pageSize), page + 1))}
                  disabled={page >= Math.ceil(totalRows / pageSize)}
                  className="p-2 border border-slate-850 rounded-lg hover:bg-slate-900 text-slate-300 disabled:opacity-30 cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- TAB CONTENT 2: COLUMNS SCHEMA MANAGER --- */}
      {activeTab === "columns" && (
        <div className="glass-panel border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-850 pb-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Schema Architect</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                Rename, drag-reorder, soft-delete headers. Cell data remains completely byte-preserved.
              </p>
            </div>
            <button
              onClick={saveColumnChanges}
              disabled={columnsSaving}
              className="flex items-center space-x-1.5 px-4.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-100 text-xs font-semibold rounded-xl transition cursor-pointer shadow disabled:opacity-50"
            >
              {columnsSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span>Save Structure</span>
            </button>
          </div>

          {/* Add staged column form */}
          <div className="flex gap-4 max-w-md">
            <input
              type="text"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder="e.g. Email Address"
              className="flex-1 bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            />
            <button
              onClick={handleAddColumn}
              className="flex items-center space-x-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 text-xs font-semibold rounded-xl transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Add</span>
            </button>
          </div>

          {/* Columns Config List */}
          <div className="space-y-3 max-w-2xl">
            {columnsTabList.map((col, idx) => (
              <div
                key={col.id}
                className={`flex items-center justify-between p-3.5 bg-slate-900/60 border rounded-xl transition ${
                  col.is_deleted 
                    ? "border-red-900/35 bg-red-950/5 opacity-55" 
                    : col.id < 0 
                      ? "border-indigo-900/40 bg-indigo-950/5" 
                      : "border-slate-850"
                }`}
              >
                <div className="flex items-center space-x-3 flex-1 mr-4">
                  {/* Reorder actions */}
                  <div className="flex flex-col space-y-1 select-none">
                    <button
                      onClick={() => handleMoveColumn(idx, "up")}
                      disabled={idx === 0}
                      className="p-1 hover:bg-slate-800 text-slate-500 hover:text-slate-350 disabled:opacity-20 rounded"
                    >
                      <ChevronRight className="h-3 w-3 -rotate-90" />
                    </button>
                    <button
                      onClick={() => handleMoveColumn(idx, "down")}
                      disabled={idx === columnsTabList.length - 1}
                      className="p-1 hover:bg-slate-800 text-slate-500 hover:text-slate-350 disabled:opacity-20 rounded"
                    >
                      <ChevronRight className="h-3 w-3 rotate-90" />
                    </button>
                  </div>

                  {/* Column input field */}
                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      value={col.name}
                      onChange={(e) => handleRenameStagedColumn(col.id, e.target.value)}
                      disabled={col.is_deleted}
                      className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-indigo-500 focus:outline-none text-slate-200 font-semibold text-sm py-0.5 w-full"
                    />
                    <span className="text-[10px] font-mono text-slate-500 block">
                      Original: {col.original_name} {col.id < 0 ? "(Staged NEW)" : ""}
                    </span>
                  </div>
                </div>

                {/* Delete / Soft Delete action */}
                <button
                  onClick={() => handleToggleDeleteColumn(col.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    col.is_deleted
                      ? "border-amber-900/45 hover:border-amber-700 bg-amber-500/10 text-amber-400"
                      : "border-red-900/35 hover:border-red-700 bg-red-500/10 text-red-400"
                  }`}
                >
                  {col.is_deleted ? "Restore" : "Delete"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- TAB CONTENT 3: DUPLICATES AUDIT --- */}
      {activeTab === "duplicates" && (
        <div className="glass-panel border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-850 pb-4 gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-100">Duplicate Auditor</h2>
              <p className="text-slate-400 text-xs mt-0.5">
                Scan rows with duplicate profiles. Exact duplicates can be deleted automatically or reviewed.
              </p>
            </div>

            {duplicateGroups.length > 0 && (
              <button
                onClick={() => handleBulkDeduplicate()}
                disabled={duplicatesLoading}
                className="flex items-center space-x-1.5 px-4.5 py-2.5 bg-red-600 hover:bg-red-500 text-slate-100 text-xs font-semibold rounded-xl transition cursor-pointer shadow disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                <span>Remove Exact Duplicates</span>
              </button>
            )}
          </div>

          {duplicatesLoading ? (
            <div className="text-center py-20 text-slate-500">
              Analyzing dataset for duplicate profiles...
            </div>
          ) : duplicateGroups.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl">
              <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
              <h3 className="text-slate-200 font-bold">No duplicates detected</h3>
              <p className="text-slate-500 text-sm mt-1">
                Every active row contains a unique profile configuration.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-4 bg-amber-500/10 border border-amber-900/40 rounded-xl text-xs text-amber-400 leading-relaxed max-w-xl">
                Found <strong>{duplicateGroups.length} duplicate groups</strong> totaling <strong>{dupTotalRows} rows</strong>. Removing exact duplicates will keep the oldest database record (minimum ID) and drop matching entries.
              </div>

              {/* Grouped Duplicate rows display */}
              <div className="space-y-4">
                {duplicateGroups.map((group, idx) => (
                  <div key={idx} className="border border-slate-850 rounded-xl overflow-hidden bg-slate-900/40">
                    {/* Header */}
                    <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-850 flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold text-slate-300">Group #{idx + 1} ({group.occurrence_count} occurrences)</span>
                      <button
                        onClick={() => handleBulkDeduplicate(group.row_ids.slice(1))}
                        className="text-red-400 hover:text-red-300 font-semibold cursor-pointer"
                      >
                        Keep 1, Delete duplicates
                      </button>
                    </div>
                    {/* Cells values preview */}
                    <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      {Object.entries(group.data).map(([key, val]) => (
                        <div key={key} className="space-y-1">
                          <span className="font-medium text-slate-500 truncate block">{key}</span>
                          <span className="text-slate-350 font-semibold break-all">{val || "-"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- TAB CONTENT 4: EXPORT SYSTEM --- */}
      {activeTab === "exports" && (
        <div className="glass-panel border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="border-b border-slate-850 pb-4">
            <h2 className="text-xl font-bold text-slate-100">Export Center</h2>
            <p className="text-slate-400 text-xs mt-0.5">
              Securely compile consolidated datasets. Unicode structure (e.g. Gujarati scripts) is preserved byte-for-byte.
            </p>
          </div>

          {/* Export action triggers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
            <button
              onClick={() => triggerExportGeneration("xlsx")}
              disabled={exportingType !== null}
              className="flex items-center justify-center space-x-2.5 p-4 bg-indigo-600/10 border border-indigo-500/20 hover:border-indigo-500/45 hover:bg-indigo-600/15 rounded-xl transition cursor-pointer text-slate-200"
            >
              {exportingType === "xlsx" ? (
                <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
              ) : (
                <Download className="h-5 w-5 text-indigo-400" />
              )}
              <div className="text-left">
                <span className="font-semibold block text-sm">Export Microsoft Excel</span>
                <span className="text-[10px] text-slate-500">Generate verified .xlsx spreadsheet</span>
              </div>
            </button>

            <button
              onClick={() => triggerExportGeneration("csv")}
              disabled={exportingType !== null}
              className="flex items-center justify-center space-x-2.5 p-4 bg-emerald-600/10 border border-emerald-500/20 hover:border-emerald-500/45 hover:bg-emerald-600/15 rounded-xl transition cursor-pointer text-slate-200"
            >
              {exportingType === "csv" ? (
                <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
              ) : (
                <Download className="h-5 w-5 text-emerald-400" />
              )}
              <div className="text-left">
                <span className="font-semibold block text-sm">Export UTF-8 CSV</span>
                <span className="text-[10px] text-slate-500">UTF-8 signature (BOM) Excel compatible</span>
              </div>
            </button>
          </div>

          {/* Export File history list */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Download Export Log</h3>

            {exportsLoading ? (
              <div className="text-slate-500 text-xs">Loading logs...</div>
            ) : exportsList.length === 0 ? (
              <div className="text-slate-500 text-xs">No downloads generated yet. Click triggers above.</div>
            ) : (
              <div className="divide-y divide-slate-850 border border-slate-850 rounded-xl overflow-hidden bg-slate-900/20">
                {exportsList.map((exp) => (
                  <div key={exp.id} className="p-4 flex items-center justify-between text-xs hover:bg-slate-850/10 transition">
                    <div className="space-y-1 mr-4">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-slate-200 truncate max-w-xs block">{exp.filename}</span>
                        <span className="uppercase px-1.5 py-0.5 bg-slate-800 rounded text-slate-400 font-bold text-[9px]">
                          {exp.file_type}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-[10px] text-slate-500">
                        <span>Rows: {exp.row_count}</span>
                        <span>Generated: {new Date(exp.created_at).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 shrink-0">
                      {exp.status === "COMPLETED" ? (
                        <>
                          <span className="text-emerald-400 font-medium flex items-center space-x-1">
                            <CheckCircle className="h-4 w-4" />
                            <span>Verified</span>
                          </span>
                          <button
                            onClick={() => handleDownload(exp.download_url, exp.filename)}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-slate-100 font-semibold rounded-lg transition cursor-pointer"
                          >
                            <Download className="h-3.5 w-3.5" />
                            <span>Download</span>
                          </button>
                        </>
                      ) : exp.status === "FAILED" ? (
                        <div className="flex items-center space-x-2">
                          <span className="text-red-400 font-medium flex items-center space-x-1" title={exp.error_message || "Unknown error"}>
                            <XCircle className="h-4 w-4" />
                            <span>Failed</span>
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 flex items-center space-x-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Generating...</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Tab Selector Button helper
function TabButton({ 
  active, 
  icon, 
  label, 
  onClick 
}: { 
  active: boolean; 
  icon: React.ReactNode; 
  label: string; 
  onClick: () => void; 
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition cursor-pointer ${
        active 
          ? "bg-slate-800 text-indigo-300 shadow-sm" 
          : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// Local dynamic type support for selected sheets
type Dict<T> = { [key: string]: T };
