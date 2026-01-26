import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.entry";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";


pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function PdfSplitter() {
  const [results, setResults] = useState([]);
  const [processing, setProcessing] = useState(false);

  const getTextFromPage = async (pdf, pageNo) => {
    const page = await pdf.getPage(pageNo);
    const textContent = await page.getTextContent();
    return textContent.items.map((item) => item.str).join(" ");
  };

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files);
    let tempResults = [];
    const zip = new JSZip();
    setProcessing(true);

    for (let file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();

        // pdf.js से टेक्स्ट पढ़ना
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;

        // pdf-lib से split करना
        const pdfDoc = await PDFDocument.load(arrayBuffer);
        let startIndexes = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const text = await getTextFromPage(pdf, i);
          if (text.includes("CSBV_DEL_2025-2026" || "CSBV_DEL_2025-2026")) {
            startIndexes.push(i - 1);
          }
        }

        if (startIndexes.length === 0) {
          tempResults.push({
            file: file.name,
            splitCount: 0,
            status: "error"
          });
          continue;
        }

        startIndexes.push(pdf.numPages); // last split end

        for (let k = 0; k < startIndexes.length - 1; k++) {
          const newPdf = await PDFDocument.create();
          for (let p = startIndexes[k]; p < startIndexes[k + 1]; p++) {
            const [copiedPage] = await newPdf.copyPages(pdfDoc, [p]);
            newPdf.addPage(copiedPage);
          }
          const pdfBytes = await newPdf.save();
          zip.file(`${file.name.replace('.pdf', '')}_part_${k + 1}.pdf`, pdfBytes);
        }

        tempResults.push({
          file: file.name,
          splitCount: startIndexes.length - 1,
          status: "success"
        });

      } catch (e) {
        console.error("Error:", e);
        tempResults.push({
          file: file.name,
          splitCount: 0,
          status: "error"
        });
      }
    }

    setResults(tempResults);
    setProcessing(false);

    if (tempResults.some(r => r.status === "success")) {
      zip.generateAsync({ type: "blob" }).then((content) => {
        const url = window.URL.createObjectURL(content);
        const a = document.createElement("a");
        a.href = url;
        a.download = "split_pdfs.zip";
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      });
    } else {
      alert("No matching PDFs found for splitting!");
    }
  };

  return (
    <div className="section">
      <h2 className="section-header">
        <span role="img" aria-label="Split">✂️</span>
        Bulk PDF Split & Download
      </h2>
      <small>Upload multiple PDFs, split Shipping bills, and download as ZIP.</small>
      
      <label className="file-label">
        Select PDFs
        <input type="file" accept="application/pdf" multiple onChange={handleFileChange} disabled={processing} />
      </label>

      {processing && <div className="loading">⏳ Processing... Please wait</div>}

      {results.length > 0 && (
        <ul className="file-list">
          {results.map((res, i) => (
            <li key={i} className={res.status}>
              {res.file} ➡️ {res.status === "success" 
                ? `${res.splitCount} parts created` 
                : "No matches found"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PdfSplitter;
