"use client";

import React, { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Providers";
import { request } from "@/utils/api";
import { 
  UploadCloud, 
  FileSpreadsheet, 
  Trash2, 
  Check, 
  ChevronRight,
  Database,
  Info
} from "lucide-react";

interface UploadedFile {
  id: number;
  filename: string;
  file_type: string;
  sheet_names: string[] | null;
  status: string;
}

export default function UploadCenterPage() {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<Dict<string[]>>({}); // Maps fileId -> array of selected sheets
  const [datasetName, setDatasetName] = useState("");
  const [merging, setMerging] = useState(false);
  
  const { showToast } = useToast();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag and drop events
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFilesUpload(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFilesUpload(Array.from(e.target.files));
    }
  };

  const handleFilesUpload = async (files: File[]) => {
    setUploading(true);
    setUploadProgress(10);
    
    const formData = new FormData();
    files.forEach((file) => {
      formData.append("files", file);
    });

    setUploadProgress(40);
    try {
      const res = await request("POST", "/uploads/", formData, true);
      setUploadProgress(90);
      showToast("Files uploaded and analyzed successfully!", "success");
      
      const newFiles: UploadedFile[] = res.files || [];
      setUploadedFiles((prev) => [...prev, ...newFiles]);

      // Pre-select all sheets for Excel files by default
      const defaultSheetsSelection = { ...selectedSheets };
      newFiles.forEach((file) => {
        if (file.sheet_names && file.sheet_names.length > 0) {
          defaultSheetsSelection[file.id.toString()] = [...file.sheet_names];
        } else {
          defaultSheetsSelection[file.id.toString()] = [];
        }
      });
      setSelectedSheets(defaultSheetsSelection);
    } catch (err: any) {
      showToast(err.message || "File upload failed", "error");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSheetToggle = (fileId: number, sheetName: string) => {
    const key = fileId.toString();
    const currentSelected = selectedSheets[key] || [];
    let updated: string[];

    if (currentSelected.includes(sheetName)) {
      updated = currentSelected.filter((s) => s !== sheetName);
    } else {
      updated = [...currentSelected, sheetName];
    }

    setSelectedSheets((prev) => ({
      ...prev,
      [key]: updated
    }));
  };

  const removeFile = (fileId: number) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== fileId));
    setSelectedSheets((prev) => {
      const copy = { ...prev };
      delete copy[fileId.toString()];
      return copy;
    });
  };

  const handleMerge = async () => {
    if (uploadedFiles.length === 0) {
      showToast("Please upload at least one file.", "warning");
      return;
    }
    if (!datasetName.trim()) {
      showToast("Please enter a name for the consolidated dataset.", "warning");
      return;
    }

    // Verify sheet selection: each Excel file must have at least one sheet selected
    for (const file of uploadedFiles) {
      if (file.file_type in ["xlsx", "xls"] || (file.sheet_names && file.sheet_names.length > 0)) {
        const selected = selectedSheets[file.id.toString()] || [];
        if (selected.length === 0) {
          showToast(`Please select at least one sheet for ${file.filename}.`, "warning");
          return;
        }
      }
    }

    setMerging(true);
    try {
      // Build mapping format expected by backend: { file_id: [selected_sheets] }
      const filesSheetsMap: Dict<string[]> = {};
      uploadedFiles.forEach((file) => {
        filesSheetsMap[file.id] = selectedSheets[file.id.toString()] || [];
      });

      const dataset = await request("POST", `/datasets/?name=${encodeURIComponent(datasetName.trim())}`, filesSheetsMap);
      showToast("Data consolidation and schema merging complete!", "success");
      
      // Redirect to newly created dataset view
      router.push(`/dataset/${dataset.id}`);
    } catch (err: any) {
      showToast(err.message || "Failed to consolidate data", "error");
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-100 tracking-tight">Upload Center</h1>
        <p className="text-slate-400 text-sm mt-1">
          Select multiple spreadsheets, map sheets, and compile them into a unified, clean database structure.
        </p>
      </div>

      {/* Main Drag & Drop Zone */}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`glass-panel border-2 border-dashed rounded-2xl py-12 px-6 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[200px] ${
          dragActive 
            ? "border-indigo-500 bg-indigo-500/5 shadow-inner" 
            : "border-slate-800 hover:border-slate-700/80 hover:bg-slate-900/10"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileInputChange}
          accept=".xlsx,.xls,.csv,.pdf"
          className="hidden"
        />
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-2xl mb-4 shadow-lg group-hover:scale-105 transition">
          <UploadCloud className="h-8 w-8 text-indigo-400" />
        </div>
        <h3 className="text-slate-200 font-semibold text-lg">
          {uploading ? "Analyzing files..." : "Drag and drop spreadsheets here"}
        </h3>
        <p className="text-slate-500 text-sm mt-1 max-w-md">
          Supports Microsoft Excel (.xlsx, .xls), CSV (Unicode encoded), and PDF tables. Max 100MB per file.
        </p>
      </div>

      {/* Upload Progress Indicator */}
      {uploading && (
        <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-2">
          <div className="flex justify-between text-xs font-semibold uppercase text-slate-400 tracking-wider">
            <span>Uploading & Parsing files</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
            <div 
              className="bg-indigo-600 h-full rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Uploaded Files Section */}
      {uploadedFiles.length > 0 && (
        <div className="glass-panel rounded-2xl border border-slate-800 p-6 space-y-6">
          <h2 className="text-xl font-bold text-slate-100 flex items-center space-x-2">
            <FileSpreadsheet className="h-5 w-5 text-indigo-400" />
            <span>Uploaded Source Files</span>
          </h2>
          
          <div className="divide-y divide-slate-800/60">
            {uploadedFiles.map((file) => (
              <div key={file.id} className="py-4 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-slate-200 font-semibold text-sm">{file.filename}</span>
                    <span className="text-xs uppercase bg-slate-850 px-2 py-0.5 rounded text-slate-400 font-bold">
                      {file.file_type}
                    </span>
                  </div>
                  
                  {/* Sheet Selector (for Excel files) */}
                  {file.sheet_names && file.sheet_names.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-medium text-slate-500 block">Select sheets to merge:</span>
                      <div className="flex flex-wrap gap-2">
                        {file.sheet_names.map((sheet) => {
                          const isSelected = (selectedSheets[file.id.toString()] || []).includes(sheet);
                          return (
                            <button
                              key={sheet}
                              onClick={() => handleSheetToggle(file.id, sheet)}
                              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs transition border cursor-pointer ${
                                isSelected 
                                  ? "bg-indigo-600/15 border-indigo-500 text-indigo-300 font-medium" 
                                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-300 hover:border-slate-700"
                              }`}
                            >
                              {isSelected && <Check className="h-3 w-3 text-indigo-400" />}
                              <span>{sheet}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Remove button */}
                <button
                  onClick={() => removeFile(file.id)}
                  className="p-2.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition cursor-pointer self-start md:self-center"
                >
                  <Trash2 className="h-4.5 w-4.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Merge & Consolidate Config Form */}
          <div className="pt-6 border-t border-slate-800 flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="flex-1 max-w-md">
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Consolidated Dataset Name
              </label>
              <div className="relative">
                <Database className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-500" />
                <input
                  type="text"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  placeholder="e.g. Master Sales Q2 2026"
                  className="w-full bg-slate-900/60 border border-slate-800 rounded-xl py-3 pl-11 pr-4 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
                  required
                />
              </div>
            </div>
            
            <button
              onClick={handleMerge}
              disabled={merging}
              className="flex items-center justify-center space-x-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] transition text-slate-100 font-semibold rounded-xl cursor-pointer shadow-lg shadow-emerald-500/15 disabled:opacity-50"
            >
              <span>{merging ? "Consolidating..." : "Consolidate & Import"}</span>
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      {/* Quick Help Box */}
      <div className="glass-panel border-slate-800 p-4 rounded-xl flex items-start space-x-3 text-xs text-slate-400 leading-relaxed">
        <Info className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-slate-300">Master Schema Merging System</p>
          <p>
            When consolidating files, identical columns will automatically merge. New unique columns from separate files will be appended to the master schema. Row values that do not belong to a particular file will remain blank. Cell text formatting and character encodings (including Gujarati and Unicode scripts) are preserved exactly.
          </p>
        </div>
      </div>
    </div>
  );
}

// Simple dictionary helper type since typescript Record is stricter
type Dict<T> = { [key: string]: T };
