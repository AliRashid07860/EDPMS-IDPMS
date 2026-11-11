import React, { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { extractCustomsData } from "./pdfParser";

//const DUTY_FIELDS = ["BCD", "SWS", "ADD", "INT", "FINE", "CHCESS", "IGST"];

const isBlank = (value) => value === "" || value === null || value === undefined;
const toNumberOrBlank = (value) => {
  if (isBlank(value)) return "";
  const number = Number(value);
  return Number.isFinite(number) ? number : "";
};

// Return blank if any component needed for the total is missing.
// Missing source data must not be treated as zero.
function sumOnlyWhenComplete(values) {
  if (values.some(isBlank)) return "";
  return values.reduce((sum, value) => sum + Number(value), 0);
}

export default function IDPMS() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processedData, setProcessedData] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState([]);
  const fileInputRef = useRef(null);

  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    const pdfs = incoming.filter((file) =>
      file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    );

    if (!pdfs.length) {
      setMessage("Please select PDF files only.");
      return;
    }

    setSelectedFiles((previous) => {
      const existing = new Set(previous.map((file) => `${file.name}-${file.size}`));
      const additions = pdfs.filter((file) => !existing.has(`${file.name}-${file.size}`));
      return [...previous, ...additions];
    });
    setProcessedData([]);
    setErrors([]);
    setMessage("");
  };

  const handleInputChange = (event) => {
    addFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const removeFile = (index) => {
    setSelectedFiles((previous) => previous.filter((_, i) => i !== index));
    setProcessedData([]);
    setErrors([]);
    setMessage("");
  };

  const clearAll = () => {
    setSelectedFiles([]);
    setProcessedData([]);
    setErrors([]);
    setMessage("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processPdfs = async () => {
    if (!selectedFiles.length || isProcessing) return;

    setIsProcessing(true);
    setProcessedData([]);
    setErrors([]);
    setMessage(`Processing ${selectedFiles.length} PDF(s)...`);

    const allRows = [];
    const failedFiles = [];

    for (let index = 0; index < selectedFiles.length; index += 1) {
      const file = selectedFiles[index];
      setMessage(`Processing ${index + 1}/${selectedFiles.length}: ${file.name}`);

      try {
        const rows = await extractCustomsData(file);
        if (!Array.isArray(rows) || !rows.length) {
          throw new Error("No invoice rows were extracted.");
        }
        allRows.push(...rows);
      } catch (error) {
        console.error(`Failed to process ${file.name}`, error);
        failedFiles.push(`${file.name}: ${error.message}`);
      }
    }

    setProcessedData(allRows);
    setErrors(failedFiles);

    if (allRows.length && failedFiles.length) {
      setMessage(`${allRows.length} invoice row(s) extracted. ${failedFiles.length} PDF(s) failed; see errors below.`);
    } else if (allRows.length) {
      setMessage(`${allRows.length} invoice row(s) extracted. Please review blank fields before using the Excel file.`);
    } else {
      setMessage("No invoice rows could be extracted. See the error details below.");
    }

    setIsProcessing(false);
  };

  const downloadExcel = () => {
    if (!processedData.length) {
      setMessage("Process at least one PDF before downloading.");
      return;
    }

    const excelRows = processedData.map((row) => {
      const customs = sumOnlyWhenComplete(
        ["BCD", "SWS", "ADD", "INT", "FINE", "CHCESS"].map((key) => row[key])
      );
      const total = isBlank(customs) || isBlank(row.IGST)
        ? ""
        : Number(customs) + Number(row.IGST);

      return {
        BE_No: row.BE_No || "",
        BE_Date: row.BE_Date || "",
        "HAWB Number": row.HAWB_Number || "",
        "HAWB Date": row.HAWB_Date || "",
        "Supplier's Name": row.Supplier_Name || "",
        "Invoice No.": row.Invoice_No || "",
        "Invoice Amount": toNumberOrBlank(row.Invoice_Amount),
        Currency: row.Currency || "",
        BCD: toNumberOrBlank(row.BCD),
        SWS: toNumberOrBlank(row.SWS),
        ADD: toNumberOrBlank(row.ADD),
        INT: toNumberOrBlank(row.INT),
        FINE: toNumberOrBlank(row.FINE),
        CHCESS: toNumberOrBlank(row.CHCESS),
        IGST: toNumberOrBlank(row.IGST),
        "Total Customs": customs,
        Total: total,
        "Customs Components": row.Customs_Components || "",
        "Freight Amount": toNumberOrBlank(row.Freight_Amount),
        "Freight Currency": row.Freight_Currency || "",
        "Icegate Ack Number.": row.Icegate_Ack || "",
        "Payment ref no.": row.Payment_Ref || "",
        "Payment Request Date": row.Payment_Request_Date || "",
        "Actual Payment Date": row.Actual_Payment_Date || "",
        Category: row.Category || "",
        "Sub-Category": row.Sub_Category || "",
        User: row.User || "",
        Notes: row.Notes || "",
      };
    });

    const mainSheet = XLSX.utils.json_to_sheet(excelRows);
    mainSheet["!cols"] = Object.keys(excelRows[0]).map((heading) => ({
      wch: Math.min(Math.max(heading.length + 3, 14), 42),
    }));

    const summary = [{
      "Total PDFs Selected": selectedFiles.length,
      "Total Invoice Rows": processedData.length,
      "PDF Processing Errors": errors.length,
      "Rows With Missing Invoice Amount": processedData.filter((row) => isBlank(row.Invoice_Amount)).length,
      "Rows With Missing Currency": processedData.filter((row) => isBlank(row.Currency)).length,
      "Rows Requiring Review": processedData.filter((row) => /Review required:/i.test(row.Notes || "")).length,
      "Note": "Totals are left blank when any required source amount is missing. No missing value is assumed to be zero.",
    }];
    const summarySheet = XLSX.utils.json_to_sheet(summary);
    summarySheet["!cols"] = Object.keys(summary[0]).map((heading) => ({ wch: Math.max(20, heading.length + 3) }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, mainSheet, "Customs Data");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");
    XLSX.writeFile(workbook, "Customs_Payment_Tracker.xlsx");
    setMessage("Excel file downloaded. Please review Notes and blank fields.");
  };

  const cellStyle = {
    padding: "9px 10px",
    borderBottom: "1px solid #e2e8f0",
    textAlign: "left",
    whiteSpace: "nowrap",
  };

  return (
    <main style={{ maxWidth: 1100, margin: "36px auto", padding: "0 18px", fontFamily: "Arial, sans-serif", color: "#0f172a" }}>
      <section style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 26, boxShadow: "0 8px 28px rgba(15,23,42,.06)" }}>
        <h2 style={{ margin: 0, fontSize: 25 }}>Customs PDF to Excel</h2>
        <p style={{ color: "#64748b", margin: "8px 0 22px" }}>
          Multiple customs PDFs select ya drag-and-drop karein, phir invoice data process karke Excel export karein.
        </p>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={handleInputChange}
          style={{ display: "none" }}
        />

        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
          }}
          onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
          onDragLeave={(event) => { event.preventDefault(); setIsDragging(false); }}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragging ? "#0284c7" : "#cbd5e1"}`,
            borderRadius: 12,
            padding: "42px 18px",
            textAlign: "center",
            cursor: "pointer",
            background: isDragging ? "#f0f9ff" : "#f8fafc",
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700 }}>
            {isDragging ? "Drop PDF files here" : "Drag & drop PDF files here"}
          </div>
          <div style={{ color: "#64748b", fontSize: 13, marginTop: 8 }}>or click to browse · Multiple PDFs supported</div>
        </div>

        {selectedFiles.length > 0 && (
          <section style={{ marginTop: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <strong>Selected PDFs ({selectedFiles.length})</strong>
              <button type="button" onClick={clearAll} style={secondaryButton}>Clear all</button>
            </div>
            <div style={{ marginTop: 10, border: "1px solid #e2e8f0", borderRadius: 8, maxHeight: 190, overflowY: "auto" }}>
              {selectedFiles.map((file, index) => (
                <div key={`${file.name}-${file.size}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>📄 {file.name}</span>
                  <button type="button" onClick={() => removeFile(index)} aria-label={`Remove ${file.name}`} style={{ ...secondaryButton, color: "#dc2626" }}>Remove</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {message && <div role="status" style={{ marginTop: 18, padding: 12, borderRadius: 8, background: "#f1f5f9", color: "#334155", fontSize: 13 }}>{message}</div>}

        {errors.length > 0 && (
          <div style={{ marginTop: 14, padding: 14, borderRadius: 8, background: "#fef2f2", color: "#991b1b" }}>
            <strong>PDF errors</strong>
            <ul style={{ marginBottom: 0 }}>
              {errors.map((error) => <li key={error}>{error}</li>)}
            </ul>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 22 }}>
          <button type="button" disabled={!selectedFiles.length || isProcessing} onClick={processPdfs} style={{ ...primaryButton, opacity: !selectedFiles.length || isProcessing ? 0.55 : 1 }}>
            {isProcessing ? "Processing..." : "Process PDFs"}
          </button>
          <button type="button" disabled={!processedData.length} onClick={downloadExcel} style={{ ...downloadButton, opacity: !processedData.length ? 0.55 : 1 }}>
            Download Excel
          </button>
        </div>

        {processedData.length > 0 && (
          <section style={{ marginTop: 28 }}>
            <h3 style={{ fontSize: 17 }}>Extracted data preview ({processedData.length} rows)</h3>
            <p style={{ color: "#64748b", fontSize: 12 }}>Blank cells mean the parser could not confidently identify that value in the PDF. Check Notes before using the data.</p>
            <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 8 }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                <thead style={{ background: "#f1f5f9" }}>
                  <tr>{["BE No", "Supplier", "Invoice No", "Amount", "Currency", "BCD", "SWS", "IGST", "Notes"].map((heading) => <th key={heading} style={cellStyle}>{heading}</th>)}</tr>
                </thead>
                <tbody>
                  {processedData.map((row, index) => (
                    <tr key={`${row.BE_No}-${row.Invoice_No}-${index}`}>
                      {[row.BE_No, row.Supplier_Name, row.Invoice_No, row.Invoice_Amount, row.Currency, row.BCD, row.SWS, row.IGST, row.Notes].map((value, cellIndex) => (
                        <td key={cellIndex} style={cellStyle}>{isBlank(value) ? "—" : String(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}

const primaryButton = {
  border: 0, borderRadius: 7, padding: "11px 20px",
  background: "#0284c7", color: "#fff", fontWeight: 700, cursor: "pointer",
};
const downloadButton = {
  ...primaryButton, background: "#16a34a",
};
const secondaryButton = {
  border: "1px solid #cbd5e1", borderRadius: 6, padding: "6px 10px",
  background: "#fff", cursor: "pointer", fontSize: 12,
};