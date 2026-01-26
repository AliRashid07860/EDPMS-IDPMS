import React, { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.entry";
import * as XLSX from "xlsx";
import "./pdfBulk.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

function PdfToExcel() {
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState([]);

  const normalize = (str) =>
    (str || "").replace(/\s+/g, " ").replace(/\u00A0/g, " ").trim();

  const pickAfterLabel = (label, chunks, stopWords = []) => {
    const idx = chunks.findIndex((c) =>
      c.toLowerCase().includes(label.toLowerCase())
    );
    if (idx !== -1) {
      let collected = [];
      for (let i = idx + 1; i < chunks.length; i++) {
        const val = chunks[i].trim();
        if (!val) continue;
        if (stopWords.some((w) => val.toLowerCase().includes(w.toLowerCase())))
          break;
        collected.push(val);
        if (collected.length > 3) break;
      }
      return normalize(collected.join(" "));
    }
    return "";
  };

  const sumQuantities = (text) => {
    let total = 0;
    const qtyRegex = /Quantity:\s*([0-9]+)/gi;
    let m;
    while ((m = qtyRegex.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n)) total += n;
    }
    return total || "";
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setProcessing(true);
    setResults([]);

    const rows = [];
    const temp = [];

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        let fullText = "";
        let allChunks = [];

        for (let p = 1; p <= pdf.numPages; p++) {
          const page = await pdf.getPage(p);
          const content = await page.getTextContent();
          const strings = content.items.map((it) => it.str);
          allChunks = allChunks.concat(strings);
          fullText += strings.join(" ") + " ";
        }
        fullText = normalize(fullText);

        // CSB Number
        const CSBNumber =
          pickAfterLabel("CSB Number", allChunks, ["Filling", "Date"]).replace(
            /\s+/g,
            ""
          ) || "";

        // Filling Date (only DD/MM/YYYY)
        const FillingDateMatch = fullText.match(/Filling\s*Date\s*:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i);
        const FillingDate = FillingDateMatch ? FillingDateMatch[1] : "";

        // Invoice Number & Date
        let InvoiceNumber = "";
        let InvoiceDate = "";
        const invLabelIdx = allChunks.findIndex((c) =>
          c.toLowerCase().includes("invoice number")
        );
        if (invLabelIdx !== -1 && invLabelIdx + 5 < allChunks.length) {
          let nextTokens = [];
          for (let i = invLabelIdx; i < allChunks.length; i++) {
            const t = allChunks[i].trim();
            if (!t) continue;
            if (/invoice\s*number|invoice\s*date|value/i.test(t)) continue;
            nextTokens.push(t);
            if (nextTokens.length >= 3) break;
          }
          InvoiceNumber = nextTokens[0] || "";
          InvoiceDate = nextTokens[1] || "";
        }

        // FOB Value
        const FOBValueMatch = fullText.match(/FOB\s*Value\s*\(In\s*Foreign\s*Cur[\s-]*rency\)\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
        const FOBValueForeign = FOBValueMatch ? FOBValueMatch[1] : "";  

        // FOB Currency
        const FOBCurrencyMatch =
          fullText.match(/FOB\s*Currency\s*\(In\s*Foreign\s*Cur[\s-]*rency\)\s*:\s*([A-Z]{3})/i) ||
          fullText.match(/FOB\s*Currency\s*:\s*([A-Z]{3})/i);
        const FOBCurrencyForeign = FOBCurrencyMatch ? FOBCurrencyMatch[1] : "";

        // Exchange Rate
        const ExchangeRateMatch = fullText.match(/Exchange\s*Rate\s*:\s*([0-9]+(?:\.[0-9]+)?)/i);
        const ExchangeRate = ExchangeRateMatch ? ExchangeRateMatch[1] : "";

        // HAWB Number
        const HAWBMatch = fullText.match(/HAWB\s*Number\s*:\s*([A-Z0-9]+)/i);
        const HAWBNumber = HAWBMatch ? HAWBMatch[1] : "";

        // Name of the Consignee
        const ConsigneeMatch = fullText.match(/Name\s*of\s*the\s*Con[\s-]*signee\s*:\s*([^:]+?)(?=\s*(Address|GSTIN|INVOICE|ITEM|CRN|DECLARATION|$))/i);
        const NameoftheConsignee = ConsigneeMatch ? normalize(ConsigneeMatch[1]) : "";

        // Address of the Consignee
        const AddressMatch = fullText.match(/Address\s*of\s*the\s*Con[\s-]*signee\s*:\s*([^:]+?)(?=\s*(Airport|Courier|GSTIN|INVOICE|ITEM|$))/i);
        const AddressoftheConsignee = AddressMatch ? normalize(AddressMatch[1]) : "";

        // Airport of Destination
        const AirportMatch = fullText.match(/Airport\s*of\s*Destination\s*:\s*([A-Z]{3})/i);
        const AirportofDestination = AirportMatch ? AirportMatch[1] : "";

        // AD Code
        const ADCodeMatch = fullText.match(/AD\s*Code\s*:\s*([0-9]+)/i);
        const ADCode = ADCodeMatch ? ADCodeMatch[1] : "";

        // Courier Name
        const CourierMatch = fullText.match(/Courier\s*Name\s*:\s*([A-Za-z .]+?)(?=\s*(Address|$))/i);
        const CourierName = CourierMatch ? normalize(CourierMatch[1]) : "";

        // Quantity
        const Quantity = sumQuantities(fullText);

        const row = {
          CSBNumber,
          FillingDate,
          InvoiceNumber,
          InvoiceDate,
          "FOBValue(InForeignCurrency)": FOBValueForeign,
          "FOBCurrency(InForeignCurrency)": FOBCurrencyForeign,
          ExchangeRate,
          HAWBNumber,
          NameoftheConsignee,
          AddressoftheConsignee,
          AirportofDestination,
          CourierName,
          Quantity,
          ADCode,
        };

        rows.push(row);
        temp.push({ file: file.name, status: "success" });
      } catch (err) {
        console.error("Failed:", file.name, err);
        temp.push({ file: file.name, status: "error" });
      }
    }

    setResults(temp);
    setProcessing(false);

    if (rows.length) {
      const headerOrder = [
        "CSBNumber",
        "FillingDate",
        "InvoiceNumber",
        "InvoiceDate",
        "FOBValue(InForeignCurrency)",
        "FOBCurrency(InForeignCurrency)",
        "ExchangeRate",
        "HAWBNumber",
        "NameoftheConsignee",
        "AddressoftheConsignee",
        "AirportofDestination",
        "CourierName",
        "Quantity",
        "ADCode",
      ];

      const worksheetData = [
        headerOrder,
        ...rows.map((r) => headerOrder.map((h) => r[h] ?? "")),
      ];

      const ws = XLSX.utils.aoa_to_sheet(worksheetData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "CSB Data");

      XLSX.writeFile(wb, "csb_export.xlsx");
    } else {
      alert("No data extracted from the selected PDFs.");
    }
  };

  return (
    <div className="section">
      <h2 className="section-header">
        <span role="img" aria-label="excel">📊</span>
        Bulk CSB → Excel Export
      </h2>
      <small>Upload multiple CSB PDFs. We’ll extract fields and create one Excel.</small>

      <label className="file-label">
        Select PDFs
        <input
          type="file"
          accept="application/pdf"
          multiple
          onChange={handleFileChange}
          disabled={processing}
        />
      </label>

      {processing && <div className="loading">⏳ Processing... Please wait</div>}

      {results.length > 0 && (
        <ul className="file-list">
          {results.map((r, i) => (
            <li key={i} className={r.status}>
              {r.file} ➜ {r.status === "success" ? "ok" : "failed"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PdfToExcel;
