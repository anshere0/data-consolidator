"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useToast } from "@/components/Providers";
import { request } from "@/utils/api";
import { 
  Database, 
  UploadCloud, 
  Trash2, 
  ExternalLink,
  ChevronRight,
  TrendingUp,
  FileText,
  BarChart
} from "lucide-react";

interface Dataset {
  id: number;
  name: string;
  row_count: number;
  column_count: number;
  created_at: string;
  updated_at: string;
}

export default function DashboardPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(true);
  const { showToast } = useToast();

  const fetchDatasets = async () => {
    try {
      const data = await request("GET", "/datasets");
      setDatasets(data);
    } catch (err: any) {
      showToast(err.message || "Failed to load datasets", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatasets();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this dataset? This will delete all rows and columns.")) {
      return;
    }
    try {
      await request("DELETE", `/datasets/${id}`);
      showToast("Dataset deleted successfully", "success");
      setDatasets((prev) => prev.filter((d) => d.id !== id));
    } catch (err: any) {
      showToast(err.message || "Failed to delete dataset", "error");
    }
  };

  // Compute total rows count
  const totalRows = datasets.reduce((sum, d) => sum + d.row_count, 0);

  return (
    <div className="space-y-8 max-w-6xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 tracking-tight">Data Console</h1>
          <p className="text-slate-400 text-sm mt-1">
            Consolidate sheets, audit duplicates, and export UTF-8 compliant data.
          </p>
        </div>
        <Link
          href="/upload"
          className="flex items-center space-x-2 px-5 py-3 bg-indigo-600 hover:bg-indigo-500 active:scale-[0.98] transition text-slate-100 font-semibold rounded-xl shadow-lg shadow-indigo-500/15"
        >
          <UploadCloud className="h-5 w-5" />
          <span>Upload Center</span>
        </Link>
      </div>

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <StatsCard
          title="Consolidated Projects"
          value={datasets.length}
          icon={<Database className="h-6 w-6 text-indigo-400" />}
          description="Consolidated data structures"
        />
        <StatsCard
          title="Total Rows Processed"
          value={totalRows.toLocaleString()}
          icon={<TrendingUp className="h-6 w-6 text-emerald-400" />}
          description="Unicode safe cell rows loaded"
        />
        <StatsCard
          title="Active Schemas"
          value={datasets.length > 0 ? Math.max(...datasets.map(d => d.column_count), 0) : 0}
          icon={<BarChart className="h-6 w-6 text-violet-400" />}
          description="Max columns in single schema"
        />
      </div>

      {/* Projects List Container */}
      <div className="glass-panel rounded-2xl border border-slate-800 p-6">
        <h2 className="text-xl font-bold text-slate-100 mb-6 flex items-center space-x-2">
          <FileText className="h-5 w-5 text-indigo-400" />
          <span>Active Datasets</span>
        </h2>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Loading datasets...</div>
        ) : datasets.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-slate-800 rounded-xl">
            <Database className="h-12 w-12 text-slate-600 mx-auto mb-4" />
            <h3 className="text-slate-300 font-semibold text-lg">No datasets merged yet</h3>
            <p className="text-slate-500 text-sm max-w-sm mx-auto mt-1 mb-6">
              Go to the Upload Center to import multiple files and combine them.
            </p>
            <Link
              href="/upload"
              className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold rounded-xl border border-slate-700 transition"
            >
              <span>Import Files</span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="pb-4 font-medium">Dataset Name</th>
                  <th className="pb-4 font-medium">Rows</th>
                  <th className="pb-4 font-medium">Columns</th>
                  <th className="pb-4 font-medium">Last Modified</th>
                  <th className="pb-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-sm text-slate-300">
                {datasets.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-850/20 group transition">
                    <td className="py-4 font-semibold text-slate-200 group-hover:text-indigo-400 transition">
                      <Link href={`/dataset/${d.id}`}>{d.name}</Link>
                    </td>
                    <td className="py-4">{d.row_count.toLocaleString()}</td>
                    <td className="py-4">{d.column_count}</td>
                    <td className="py-4 text-xs text-slate-500">
                      {new Date(d.updated_at).toLocaleString()}
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end space-x-3">
                        <Link
                          href={`/dataset/${d.id}`}
                          className="p-2 hover:bg-indigo-500/10 text-slate-400 hover:text-indigo-400 rounded-lg transition"
                          title="Open spreadsheet editor"
                        >
                          <ExternalLink className="h-4.5 w-4.5" />
                        </Link>
                        <button
                          onClick={() => handleDelete(d.id)}
                          className="p-2 hover:bg-red-500/10 text-slate-400 hover:text-red-400 rounded-lg transition"
                          title="Delete Dataset"
                        >
                          <Trash2 className="h-4.5 w-4.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// Stats Card Utility Component
function StatsCard({ 
  title, 
  value, 
  icon, 
  description 
}: { 
  title: string; 
  value: string | number; 
  icon: React.ReactNode; 
  description: string; 
}) {
  return (
    <div className="glass-panel rounded-2xl border border-slate-800 p-6 flex items-start justify-between glass-card-hover">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{title}</p>
        <h3 className="text-3xl font-bold text-slate-100">{value}</h3>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <div className="p-3 bg-slate-900/60 rounded-xl border border-slate-800">
        {icon}
      </div>
    </div>
  );
}
