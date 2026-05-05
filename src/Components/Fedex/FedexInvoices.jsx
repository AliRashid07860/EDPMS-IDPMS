import React, { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.entry";
import "./FedexInvoice.css"; // 👈 import CSS

function FedexInvoice() {
  const [loading, setLoading] = useState(false);

  const getInvoiceNumberFromPDF = async (file) => {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const strings = textContent.items.map((item) => item.str);
      fullText += strings.join(" ") + "\n";
    }
    const regexList = [/INVOICE NUMBER\s+([A-Z0-9-]+)/i];
    for (let regex of regexList) {
      const match = fullText.match(regex);
      if (match) return match[1];
    }
    return null;
  };

  const handleFilesUpload = async (event) => {
    const files = Array.from(event.target.files);
    if (!files.length) return;

    setLoading(true);
    const zip = new JSZip();
    for (const file of files) {
      const invoiceNo = await getInvoiceNumberFromPDF(file);
      if (invoiceNo) {
        zip.file(`${invoiceNo}.pdf`, file);
      } else {
        zip.file(`UNKNOWN_${file.name}`, file);
      }
    }
    const zipData = await zip.generateAsync({ type: "blob" });
    saveAs(zipData, "FedexInvoice.zip");
    setLoading(false);
  };

  return (
    <div className="fedex-section">
      <h2>📑 Fedex Invoice PDF Renamer</h2>
      <small>Upload multiple invoice PDFs.</small>
      
      <label className="file-label">
        Select PDF Files
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={handleFilesUpload}
        />
      </label>

      {loading && <div className="loading">Processing files, please wait...</div>}

      <ul className="fedex-file-list">
        <li>Uploaded files will be renamed and downloaded as ZIP.</li>
      </ul>
    </div>
  );
}

export default FedexInvoice;
