import os
import csv
import pandas as pd
import pdfplumber
import chardet
from typing import List, Dict, Any, Tuple

class FileProcessor:
    @staticmethod
    def get_excel_sheets(file_path: str) -> List[str]:
        """Get list of sheet names from an Excel file (.xlsx or .xls)."""
        try:
            xls = pd.ExcelFile(file_path)
            return xls.sheet_names
        except Exception as e:
            raise ValueError(f"Failed to read Excel sheets: {str(e)}")

    @staticmethod
    def read_excel_sheet(file_path: str, sheet_name: str) -> Tuple[List[str], List[Dict[str, str]]]:
        """
        Read a specific sheet from an Excel file.
        Returns a tuple of (columns, rows_list).
        Preserves original values exactly as string.
        """
        try:
            # dtype=str prevents pandas from parsing numbers/dates and stripping formats
            # keep_default_na=False prevents it from turning empty/NA strings into NaN
            df = pd.read_excel(file_path, sheet_name=sheet_name, dtype=str, keep_default_na=False)
            
            # Clean column names (strip whitespace and convert to string)
            columns = [str(col).strip() for col in df.columns]
            df.columns = columns
            
            # Convert to list of dicts
            rows = df.to_dict(orient="records")
            return columns, rows
        except Exception as e:
            raise ValueError(f"Failed to parse Excel sheet '{sheet_name}': {str(e)}")

    @staticmethod
    def read_csv(file_path: str) -> Tuple[List[str], List[Dict[str, str]]]:
        """
        Read a CSV file with automatic encoding and delimiter detection.
        Returns a tuple of (columns, rows_list).
        """
        try:
            # 1. Detect encoding
            with open(file_path, "rb") as f:
                raw_data = f.read(20000)
                result = chardet.detect(raw_data)
                encoding = result.get("encoding") or "utf-8"
                # If utf-8-sig is detected or is standard utf-8 with BOM, use utf-8-sig
                if encoding.lower() in ("utf-8", "ascii"):
                    encoding = "utf-8"

            # 2. Detect delimiter
            delimiter = ","
            try:
                with open(file_path, "r", encoding=encoding, errors="ignore") as f:
                    sample = f.read(8192)
                    if sample:
                        dialect = csv.Sniffer().sniff(sample)
                        # Ensure we only use common delimiters to prevent Sniffer mistakes
                        if dialect.delimiter in (",", ";", "\t", "|"):
                            delimiter = dialect.delimiter
            except Exception:
                # Fallback: scan first line for common delimiters
                try:
                    with open(file_path, "r", encoding=encoding, errors="ignore") as f:
                        first_line = f.readline()
                        for char in (",", ";", "\t", "|"):
                            if char in first_line:
                                delimiter = char
                                break
                except Exception:
                    delimiter = ","

            # 3. Read using pandas
            df = pd.read_csv(file_path, delimiter=delimiter, encoding=encoding, dtype=str, keep_default_na=False)
            columns = [str(col).strip() for col in df.columns]
            df.columns = columns
            
            rows = df.to_dict(orient="records")
            return columns, rows
        except Exception as e:
            raise ValueError(f"Failed to parse CSV file: {str(e)}")

    @staticmethod
    def read_pdf_tables(file_path: str) -> Tuple[List[str], List[Dict[str, str]]]:
        """
        Extract tables from a PDF file using pdfplumber.
        Combines multi-page tables.
        Returns a tuple of (columns, rows_list).
        """
        try:
            all_rows = []
            header = None
            
            with pdfplumber.open(file_path) as pdf:
                for page in pdf.pages:
                    tables = page.extract_tables()
                    for table in tables:
                        if not table:
                            continue
                        
                        # Filter out rows that are entirely None/empty
                        cleaned_table = []
                        for row in table:
                            cleaned_row = [str(cell).strip() if cell is not None else "" for cell in row]
                            # If row contains at least one non-empty cell, keep it
                            if any(cell != "" for cell in cleaned_row):
                                cleaned_table.append(cleaned_row)
                        
                        if not cleaned_table:
                            continue

                        # If we haven't found a header yet, the first row of the first table is the header
                        if header is None:
                            header = cleaned_table[0]
                            data_start_idx = 1
                        else:
                            data_start_idx = 0
                            # If the first row of subsequent tables matches the header exactly, skip it
                            if cleaned_table[0] == header:
                                data_start_idx = 1
                        
                        # Process rows
                        for row in cleaned_table[data_start_idx:]:
                            # Align row to header length
                            if len(row) < len(header):
                                row.extend([""] * (len(header) - len(row)))
                            elif len(row) > len(header):
                                row = row[:len(header)]
                            
                            # Convert list to dict mapping header -> cell_value
                            row_dict = {header[i]: row[i] for i in range(len(header))}
                            all_rows.append(row_dict)
            
            if header is None:
                return [], []
            
            # Strip header columns
            cleaned_headers = [str(col).strip() if col else f"Column_{i+1}" for i, col in enumerate(header)]
            
            # Map rows with cleaned headers
            mapped_rows = []
            for row in all_rows:
                mapped_row = {}
                for i, col in enumerate(header):
                    mapped_row[cleaned_headers[i]] = row[col]
                mapped_rows.append(mapped_row)

            return cleaned_headers, mapped_rows
        except Exception as e:
            raise ValueError(f"Failed to parse PDF tables: {str(e)}")
