# Data Consolidator

A powerful web application that automatically extracts, consolidates, reviews, and exports data from multiple Excel, CSV, and PDF files into a single master dataset.

Designed to eliminate manual copy-pasting, reduce processing time, and provide a clean workflow for creating consolidated spreadsheets from diverse data sources.

---

## Overview

Data Consolidator allows users to upload multiple files containing tabular data and automatically merges them into a unified dataset.

The application:

* Extracts data from Excel files (`.xlsx`, `.xls`)
* Processes CSV files (`.csv`)
* Detects and extracts tables from PDF documents (`.pdf`)
* Normalizes column structures
* Consolidates all records into a master dataset
* Provides a review interface before export
* Generates downloadable Excel files

---

## Features

### Multi-Format File Support

Upload and process:

* Excel (.xlsx, .xls)
* CSV (.csv)
* PDF (.pdf)

---

### Intelligent Data Extraction

The system automatically:

* Detects tables in uploaded files
* Extracts rows and columns
* Preserves original values
* Handles different file structures
* Combines data into a single dataset

---

### Data Review Dashboard

Before exporting, users can:

* Review extracted records
* Inspect consolidated data
* Validate results
* Check row and column counts

---

### Excel Export

Generate a clean master spreadsheet with:

* All consolidated records
* Preserved column names
* Structured tabular output
* One-click download

---

### Authentication System

Secure user authentication includes:

* User registration
* Login functionality
* Protected routes
* Session management

---

### Modern Web Interface

Built with:

* Responsive design
* Clean dashboard experience
* Fast file uploads
* Real-time processing feedback

---

## Tech Stack

### Frontend

* Next.js
* React
* TypeScript
* Tailwind CSS

### Backend

* FastAPI
* Python

### Database

* SQLite (Development)
* SQLAlchemy ORM

### File Processing

* Pandas
* OpenPyXL
* PDF Table Extraction Libraries

### Deployment

* Frontend: Vercel
* Backend: Render

---

## Project Structure

```bash
data-consolidator/
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── public/
│   └── styles/
│
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── services/
│   │   └── schemas/
│   │
│   ├── uploads/
│   ├── exports/
│   └── requirements.txt
│
├── README.md
└── .gitignore
```

---

## Workflow

```text
Upload Files
      │
      ▼
Extract Tables
      │
      ▼
Normalize Data
      │
      ▼
Merge Records
      │
      ▼
Review Dataset
      │
      ▼
Export Master Excel
```

---

## Installation

### Clone Repository

```bash
git clone https://github.com/your-username/data-consolidator.git

cd data-consolidator
```

---

## Backend Setup

Navigate to backend:

```bash
cd backend
```

Create virtual environment:

```bash
python -m venv venv
```

Activate environment:

### Windows

```bash
venv\Scripts\activate
```

### Mac/Linux

```bash
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Run server:

```bash
uvicorn app.main:app --reload
```

Backend runs on:

```text
http://localhost:8000
```

API documentation:

```text
http://localhost:8000/docs
```

---

## Frontend Setup

Navigate to frontend:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Create environment file:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Run development server:

```bash
npm run dev
```

Frontend runs on:

```text
http://localhost:3000
```

---

## Environment Variables

### Backend

```env
SECRET_KEY=your-secret-key

DATABASE_URL=sqlite:///./app.db

ACCESS_TOKEN_EXPIRE_MINUTES=60
```

### Frontend

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## API Endpoints

### Authentication

```http
POST /api/auth/register
POST /api/auth/login
GET  /api/auth/me
```

### File Processing

```http
POST /api/upload
GET  /api/data/columns
GET  /api/data/rows
```

### Export

```http
GET /api/export
```

---

## Deployment

### Backend (Render)

1. Create a new Web Service on Render.
2. Connect GitHub repository.
3. Set root directory to backend.
4. Install command:

```bash
pip install -r requirements.txt
```

5. Start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

6. Add environment variables.

---

### Frontend (Vercel)

1. Import project from GitHub.
2. Set root directory to frontend.
3. Add environment variable:

```env
NEXT_PUBLIC_API_URL=https://your-render-url.onrender.com
```

4. Deploy.

---

## Use Cases

* Financial statement consolidation
* Sales report aggregation
* Vendor data merging
* Inventory management
* Business reporting
* Academic data compilation
* Administrative record management

---

## Future Enhancements

* AI-powered column matching
* Duplicate detection
* Advanced data cleaning
* Multi-sheet export
* Scheduled imports
* Cloud storage integrations
* Data validation rules
* Processing history dashboard

---

## Security

* Password hashing
* JWT authentication
* Protected API routes
* Input validation
* Secure file handling

---

## Performance Goals

* Fast file uploads
* Efficient table extraction
* Large dataset support
* Optimized export generation
* Responsive user experience

---

## License

This project is licensed under the MIT License.

---

## Author

**Ansh Arora**

Built to simplify data consolidation workflows by transforming scattered spreadsheets and PDF tables into a single organized master Excel file with minimal effort.
