import React, { useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import * as pdfjsLib from "pdfjs-dist";
import "pdfjs-dist/build/pdf.worker.entry"; 
import './DhlInvoice.css'// Worker import for pdf.js

const DhlAwb=()=>{
  const [loading, setLoading] = useState(false);
  const [renamedFiles, setRenamedFiles] = useState([]);

  // Regex method same tarike se jaise DhlInvoice me tha (match[1] use karte hain)
  // Lekin pattern FedexInvoice ka use hoga:
  const extractInvoiceNumber = (text) => {
    const regexList = [/WAYBILL\s*([A-Z0-9-]+)/i]; // Fedex ka regex
    for (let regex of regexList) {
      const match = text.match(regex);
      if (match) {
        return match[1]; // group only invoice number
      }
    }
    return null;
  };

  const handleFiles = async (files) => {
    setLoading(true);
    const results = [];
    const zip = new JSZip();

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let fullText = "";
        // Fedex jaisa multiple page text extract
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          fullText += textContent.items.map((item) => item.str).join(" ") + "\n";
        }

        const invoiceNumber = extractInvoiceNumber(fullText);

        if (invoiceNumber) {
          const newFileName = `${invoiceNumber}.pdf`;
          zip.file(newFileName, file);
          results.push({ old: file.name, new: newFileName });
        } else {
          zip.file(`UNKNOWN_${file.name}`, file);
          results.push({ old: file.name, new: "❌ Not Found" });
        }
      } catch (err) {
        console.error(`Error processing ${file.name}`, err);
      }
    }

    // ZIP download Fedex jaisa
    const zipData = await zip.generateAsync({ type: "blob" });
    saveAs(zipData, "Dhl_Awb.zip");

    setRenamedFiles(results);
    setLoading(false);
  };

  return (
    <div className="section">
      <h2 className="section-header"><span>🛄</span> DHL AWB PDF Renamer</h2>
      <small>Upload DHL AWB PDFs.</small>
      <label className="file-label">
        Choose Files
        <input type="file" accept="application/pdf" multiple onChange={(e) => handleFiles(e.target.files)} />
      </label>
      {loading && <div className="loading">Processing files, please wait...</div>}
      {renamedFiles.length > 0 && (
        <ul className="file-list">
          {renamedFiles.map((f, idx) => (
            <li key={idx} className={f.new.startsWith('❌') ? 'error' : 'success'}>
              {f.old} ➡️ {f.new}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
export default DhlAwb;