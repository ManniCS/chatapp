#!/usr/bin/env python3
"""
PDF text extraction service using PyMuPDF (fitz) with OCR support
Handles complex PDFs with images and non-standard layouts
"""

import sys
import json
import fitz  # PyMuPDF
import pytesseract
from PIL import Image
import io

def extract_pdf_text(pdf_path, use_ocr=True):
    """
    Extract text from a PDF file using PyMuPDF
    
    Args:
        pdf_path: Path to the PDF file
        use_ocr: Whether to use OCR for image-based PDFs
        
    Returns:
        dict with text, num_pages, and metadata
    """
    try:
        # Open the PDF
        sys.stderr.write(f"[Python] Opening PDF: {pdf_path}\n")
        sys.stderr.flush()
        
        doc = fitz.open(pdf_path)
        num_pages = len(doc)
        
        sys.stderr.write(f"[Python] PDF has {num_pages} pages\n")
        sys.stderr.flush()
        
        full_text = []
        ocr_pages_count = 0
        
        # Extract text from each page
        for page_num in range(num_pages):
            page = doc[page_num]
            text = page.get_text()
            
            # Progress logging every 10 pages
            if (page_num + 1) % 10 == 0 or page_num == 0:
                sys.stderr.write(f"[Python] Processing page {page_num + 1}/{num_pages} (OCR pages so far: {ocr_pages_count})\n")
                sys.stderr.flush()
            
            # If very little text found and OCR is enabled, try OCR
            if use_ocr and len(text.strip()) < 50:
                ocr_pages_count += 1
                
                # Log OCR activity
                if ocr_pages_count % 5 == 1:  # Log every 5 OCR pages
                    sys.stderr.write(f"[Python] Running OCR on page {page_num + 1} (total OCR pages: {ocr_pages_count})\n")
                    sys.stderr.flush()
                
                # Render page as image
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))  # 2x resolution for better OCR
                img_data = pix.tobytes("png")
                img = Image.open(io.BytesIO(img_data))
                
                # Perform OCR
                ocr_text = pytesseract.image_to_string(img)
                
                # Use OCR text if it extracted more
                if len(ocr_text.strip()) > len(text.strip()):
                    text = ocr_text
                    
            full_text.append(text)
        
        sys.stderr.write(f"[Python] Completed processing all {num_pages} pages ({ocr_pages_count} required OCR)\n")
        sys.stderr.flush()
        
        # Combine all pages
        combined_text = "\n".join(full_text)
        
        # Get metadata
        metadata = doc.metadata
        
        doc.close()
        
        sys.stderr.write(f"[Python] Extracted {len(combined_text)} characters total\n")
        sys.stderr.flush()
        
        return {
            "success": True,
            "text": combined_text,
            "num_pages": num_pages,
            "ocr_pages": ocr_pages_count,
            "text_length": len(combined_text),
            "metadata": metadata
        }
        
    except Exception as e:
        sys.stderr.write(f"[Python] ERROR: {str(e)}\n")
        sys.stderr.flush()
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(json.dumps({
            "success": False,
            "error": "Usage: pdf_parser.py <pdf_path>"
        }))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    sys.stderr.write(f"[Python] Starting PDF extraction for: {pdf_path}\n")
    sys.stderr.flush()
    
    result = extract_pdf_text(pdf_path)
    print(json.dumps(result))
