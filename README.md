# 📑 Data Consolidator

**Automated Multi-Format Document Ingestion, Column Normalization, Interactive Review, and Master Spreadsheet Consolidation Engine**

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com/)
[![Next.js 16](https://img.shields.io/badge/Frontend-Next.js_16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React 19](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
[![Python Pandas](https://img.shields.io/badge/ETL-Pandas%20%2F%20OpenPyXL-150458?style=for-the-badge&logo=pandas)](https://pandas.pydata.org/)
[![PDF Plumber](https://img.shields.io/badge/PDF_Extraction-PyMuPDF%20%2F%20PDFPlumber-FF5722?style=for-the-badge)](https://pymupdf.readthedocs.io/)
[![Tailwind CSS 4](https://img.shields.io/badge/UI-Tailwind_CSS_4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)

---

## 📌 Executive Summary

Organizations frequently receive critical tabular business data scattered across incompatible formats: legacy Excel workbooks (`.xls`, `.xlsx`), comma-separated files (`.csv`), and locked PDF documents. Consolidating these records manually takes hours and introduces human copy-paste errors.

**Data Consolidator** is a modern full-stack data pipeline and web application that automates extraction, column alignment, interactive data cleansing, and master export. Users drag and drop batches of heterogenous files; the backend parses tables, intelligently reconciles differing header schemas, presents an editable review grid, and exports a unified master Excel file.

---

## 🔄 Data Pipeline Workflow

```mermaid
flowchart LR
    A["Uploaded Files<br/>(Excel, CSV, PDF)"] --> B["Multi-Format Parser<br/>(pdfplumber / openpyxl / pandas)"]
    B --> C["Schema Normalizer<br/>& Merge Engine"]
    C --> D[("Staging Database<br/>SQLite / PostgreSQL")]
    D --> E["Next.js Interactive Review Grid<br/>(Inline Editing & Validation)"]
    E --> F["Master Export Service<br/>(Unified .xlsx Workbook)"]
```

---

## ✨ Key Capabilities

- **Intelligent Multi-Format Ingestion**:
  - **Excel (`.xlsx`, `.xls`)**: Multi-sheet extraction via `openpyxl` and `xlrd`.
  - **CSV**: Encoding auto-detection (`chardet`) with dynamic delimiter parsing.
  - **PDF Documents**: High-accuracy table boundary detection using `pdfplumber` and `PyMuPDF`.
- **Heuristic Schema Alignment**: Merges datasets with differing column names (e.g. mapping `"Client Name"`, `"Customer"`, and `"Name"` to a canonical schema).
- **Interactive Review Interface**: Web-based editable grid allowing operators to audit, filter, correct typos, and delete erroneous rows before finalizing the export.
- **Enterprise-Grade Backend**: FastAPI service structured with Pydantic validation schemas, SQLAlchemy ORM, and JWT authentication (`pyjwt`, `bcrypt`).

---

## 📂 Repository Layout

```text
data-consolidator/
├── backend/                    # Python FastAPI Backend
│   ├── app/
│   │   ├── api/                # Endpoints (auth, datasets, uploads, exports)
│   │   ├── core/               # Configuration, security, database connection
│   │   ├── models/             # SQLAlchemy dataset and row models
│   │   ├── schemas/            # Pydantic request/response schemas
│   │   ├── services/           # Merge engine, file processor, export service
│   │   └── main.py             # FastAPI entrypoint
│   ├── tests/                  # PyTest backend test suite
│   ├── verify_system.py        # System smoke test script
│   └── requirements.txt
├── frontend/                   # Next.js 16 Web Dashboard
│   ├── src/
│   │   ├── app/                # App router views and consolidation grid
│   │   ├── components/         # Upload dropzone, data review table
│   │   └── utils/              # API fetch client
│   ├── package.json
│   └── tsconfig.json
├── run.bat                     # Windows one-click local launcher
└── README.md
```

---

## 🚀 Quickstart Guide

### Option 1: Quickstart (Windows)
Double-click `run.bat` or run:
```cmd
run.bat
```

### Option 2: Manual Setup

#### 1. Backend Service
```bash
cd backend
python -m venv .venv
source .venv/bin/activate # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
API Documentation: [http://localhost:8000/docs](http://localhost:8000/docs)

#### 2. Frontend Interface
```bash
cd ../frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 👤 Author
**Ansh Arora**  
- GitHub: [@anshere0](https://github.com/anshere0)  
- LinkedIn: [Ansh Arora](https://www.linkedin.com/in/ansh-arora0/)
