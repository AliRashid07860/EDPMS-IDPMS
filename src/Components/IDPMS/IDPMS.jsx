import React, { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { extractCustomsData } from "./pdfParser";

function IDPMS() {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processedData, setProcessedData] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState("");

  const fileInputRef = useRef(null);

  // =====================================================
  // OPEN FILE BROWSER
  // =====================================================

  const handleBoxClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // =====================================================
  // ADD PDF FILES
  // =====================================================

  const handleFiles = (files) => {
    if (!files) return;

    const fileArray = Array.from(files);

    const pdfFiles = fileArray.filter((file) => {
      return (
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf")
      );
    });

    if (pdfFiles.length === 0) {
      alert("Please select PDF files only.");
      return;
    }

    setSelectedFiles((prevFiles) => {
      const existingNames = new Set(
        prevFiles.map((file) => file.name)
      );

      const newFiles = pdfFiles.filter(
        (file) => !existingNames.has(file.name)
      );

      return [...prevFiles, ...newFiles];
    });

    setMessage("");
  };

  // =====================================================
  // FILE INPUT CHANGE
  // =====================================================

  const handleFileInputChange = (e) => {
    e.preventDefault();

    if (
      e.target.files &&
      e.target.files.length > 0
    ) {
      handleFiles(e.target.files);
    }

    // Same PDF ko dobara select karne ke liye
    e.target.value = "";
  };

  // =====================================================
  // DRAG OVER
  // =====================================================

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(true);
  };

  // =====================================================
  // DRAG LEAVE
  // =====================================================

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);
  };

  // =====================================================
  // DROP
  // =====================================================

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);

    if (
      e.dataTransfer.files &&
      e.dataTransfer.files.length > 0
    ) {
      handleFiles(e.dataTransfer.files);
    }
  };

  // =====================================================
  // REMOVE ONE FILE
  // =====================================================

  const handleRemoveFile = (index, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setSelectedFiles((prevFiles) =>
      prevFiles.filter((_, i) => i !== index)
    );

    // Agar processing result tha to clear kar do
    setProcessedData([]);
    setMessage("");
  };

  // =====================================================
  // CLEAR ALL FILES
  // =====================================================

  const handleClearAll = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    setSelectedFiles([]);
    setProcessedData([]);
    setMessage("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // =====================================================
  // PROCESS PDFS
  // =====================================================

  const handleProcessPDFs = async (e) => {
    // IMPORTANT:
    // Agar parent component <form> hai
    // to page submit nahi hoga.
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    console.log(
      "===================================="
    );

    console.log(
      "PROCESS PDF BUTTON CLICKED"
    );

    console.log(
      "Selected Files:",
      selectedFiles
    );

    console.log(
      "===================================="
    );

    if (selectedFiles.length === 0) {
      alert("Please upload at least one PDF.");
      return;
    }

    setIsProcessing(true);
    setProcessedData([]);
    setMessage(
      `Processing ${selectedFiles.length} PDF(s)...`
    );

    try {
      const allRows = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        console.log(
          `Processing PDF ${i + 1}/${selectedFiles.length}:`,
          file.name
        );

        setMessage(
          `Processing ${i + 1}/${selectedFiles.length}: ${file.name}`
        );

        try {
          const rows =
            await extractCustomsData(file);

          console.log(
            "Extracted data:",
            rows
          );

          if (
            rows &&
            Array.isArray(rows) &&
            rows.length > 0
          ) {
            allRows.push(...rows);
          } else {
            console.warn(
              `No invoice data found in ${file.name}`
            );
          }
        } catch (fileError) {
          console.error(
            `Error processing ${file.name}:`,
            fileError
          );

          // Ek PDF fail hone par baaki PDFs process hongi
          allRows.push({
            BE_No: "",
            BE_Date: "",
            HAWB_Number: "",
            HAWB_Date: "",
            Supplier_Name: "",
            Invoice_No: "",
            Invoice_Amount: "",
            Currency: "",
            BCD: 0,
            SWS: 0,
            ADD: 0,
            INT: 0,
            FINE: 0,
            CHCESS: 0,
            IGST: 0,
            Customs_Components: "",
            Freight_Amount: "",
            Freight_Currency: "",
            Icegate_Ack: "",
            Payment_Ref: "",
            Payment_Request_Date: "",
            Actual_Payment_Date: "",
            Category: "",
            Sub_Category: "",
            User: "",
            Notes: `ERROR: ${file.name} - ${fileError.message}`,
          });
        }
      }

      console.log(
        "===================================="
      );

      console.log(
        "FINAL PROCESSED DATA:",
        allRows
      );

      console.log(
        "===================================="
      );

      setProcessedData(allRows);

      if (allRows.length === 0) {
        setMessage(
          "No invoice data found. Open browser Console (F12) to check PDF extraction."
        );
      } else {
        setMessage(
          `Success! ${allRows.length} invoice row(s) processed.`
        );
      }
    } catch (error) {
      console.error(
        "===================================="
      );

      console.error(
        "PDF PROCESSING ERROR:",
        error
      );

      console.error(
        "===================================="
      );

      setMessage(
        `Error: ${error.message}`
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // =====================================================
  // DOWNLOAD EXCEL
  // =====================================================

  const handleDownloadExcel = (e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!processedData || processedData.length === 0) {
      alert("Please click Process PDFs first.");
      return;
    }

    // Customs duty excludes IGST. Total includes IGST.
    const getDutyTotal = (row) =>
      ["BCD", "SWS", "ADD", "INT", "FINE", "CHCESS"].reduce(
        (sum, key) => sum + (Number(row[key]) || 0),
        0
      );

    const getNumber = (value) => Number(value) || 0;

    // Main Excel sheet: one row per invoice.
    const worksheetData = processedData.map((row) => {
      const totalCustoms = getDutyTotal(row);
      const igst = getNumber(row.IGST);

      return {
        BE_No: row.BE_No || "",
        BE_Date: row.BE_Date || "",
        "HAWB Number": row.HAWB_Number || "",
        "HAWB Date": row.HAWB_Date || "",
        "Supplier's Name": row.Supplier_Name || "",
        "Invoice No.": row.Invoice_No || "",
        "Invoice Amount": row.Invoice_Amount ?? "",
        Currency: row.Currency || "",
        BCD: row.BCD === "" ? "" : getNumber(row.BCD),
        SWS: row.SWS === "" ? "" : getNumber(row.SWS),
        ADD: row.ADD === "" ? "" : getNumber(row.ADD),
        INT: row.INT === "" ? "" : getNumber(row.INT),
        FINE: row.FINE === "" ? "" : getNumber(row.FINE),
        CHCESS: row.CHCESS === "" ? "" : getNumber(row.CHCESS),
        IGST: row.IGST === "" ? "" : igst,
        "Total Customs": totalCustoms,
        Total: totalCustoms + igst,
        "Customs Components": row.Customs_Components || "",
        "Freight Amount": row.Freight_Amount ?? "",
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

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    // Keep numeric values numeric, but display them in Indian-style grouped decimals.
    const formattedColumns = [
      "Invoice Amount", "BCD", "SWS", "ADD", "INT", "FINE", "CHCESS",
      "IGST", "Total Customs", "Total", "Freight Amount",
    ];
    formattedColumns.forEach((heading) => {
      const columnIndex = worksheetData.length ? Object.keys(worksheetData[0]).indexOf(heading) : -1;
      if (columnIndex < 0) return;
      for (let rowIndex = 1; rowIndex <= worksheetData.length; rowIndex += 1) {
        const cellAddress = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
        if (worksheet[cellAddress] && typeof worksheet[cellAddress].v === "number") {
          worksheet[cellAddress].z = "#,##,##0.00";
        }
      }
    });

    worksheet["!cols"] = [
      { wch: 12 }, { wch: 14 }, { wch: 18 }, { wch: 14 },
      { wch: 42 }, { wch: 25 }, { wch: 18 }, { wch: 12 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 },
      { wch: 18 }, { wch: 40 }, { wch: 18 }, { wch: 18 },
      { wch: 24 }, { wch: 20 }, { wch: 22 }, { wch: 22 },
      { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 45 },
    ];

    // Summary: count each Bill of Entry only once, even if it has
    // multiple invoice rows and the duty values are repeated by the parser.
    const beTotals = new Map();

    processedData.forEach((row, index) => {
      const beKey = String(row.BE_No || `UNKNOWN_${index}`);
      if (!beTotals.has(beKey)) {
        beTotals.set(beKey, {
          customs: getDutyTotal(row),
          igst: getNumber(row.IGST),
        });
      } else {
        const existing = beTotals.get(beKey);
        // Keep the larger recorded amount, rather than double-counting
        // the same BE duties on each invoice line.
        existing.customs = Math.max(existing.customs, getDutyTotal(row));
        existing.igst = Math.max(existing.igst, getNumber(row.IGST));
      }
    });

    const summaryCustoms = Array.from(beTotals.values()).reduce(
      (sum, item) => sum + item.customs,
      0
    );
    const summaryIGST = Array.from(beTotals.values()).reduce(
      (sum, item) => sum + item.igst,
      0
    );

    const summarySheet = XLSX.utils.json_to_sheet([
      {
        "Total PDFs": selectedFiles.length,
        "Total Invoice Rows": processedData.length,
        "Total Bill of Entries": beTotals.size,
        "Total Customs (excluding IGST)": summaryCustoms,
        "Total IGST": summaryIGST,
        "Total Including IGST": summaryCustoms + summaryIGST,
      },
    ]);
    summarySheet["!cols"] = [
      { wch: 18 }, { wch: 22 }, { wch: 22 },
      { wch: 32 }, { wch: 18 }, { wch: 25 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "October");
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary - October");

    XLSX.writeFile(workbook, "Customs_Payment_Tracker.xlsx");
    setMessage("Excel downloaded successfully.");
  };

  // =====================================================
  // UI
  // =====================================================

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "40px auto",
        padding: "0 20px",
        fontFamily:
          "Arial, sans-serif",
      }}
    >
      <div
        style={{
          padding: "30px",
          border:
            "1px solid #e2e8f0",
          borderRadius: "12px",
          background: "#fff",
          boxShadow:
            "0 4px 15px rgba(0,0,0,0.08)",
        }}
      >
        {/* =================================================
            HEADER
        ================================================= */}

        <h2
          style={{
            margin:
              "0 0 6px 0",
            fontSize: "24px",
            color: "#0f172a",
          }}
        >
          Customs PDF → Excel
        </h2>

        <p
          style={{
            margin:
              "0 0 20px 0",
            color: "#64748b",
            fontSize: "14px",
          }}
        >
          Multiple Customs PDFs upload
          karo aur Excel automatically
          ready karo.
        </p>

        {/* =================================================
            HIDDEN INPUT
        ================================================= */}

        <input
          type="file"
          ref={fileInputRef}
          onChange={
            handleFileInputChange
          }
          multiple
          accept=".pdf,application/pdf"
          style={{
            display: "none",
          }}
        />

        {/* =================================================
            DRAG & DROP
        ================================================= */}

        <div
          onClick={handleBoxClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            border: isDragging
              ? "2px dashed #0284c7"
              : "1.5px dashed #cbd5e1",

            borderRadius: "10px",

            padding:
              "45px 20px",

            textAlign: "center",

            cursor: "pointer",

            backgroundColor:
              isDragging
                ? "#f0f9ff"
                : "#f8fafc",

            transition:
              "all 0.2s ease",
          }}
        >
          <div
            style={{
              color: "#334155",
              fontWeight: "600",
              fontSize: "16px",
            }}
          >
            {isDragging
              ? "📂 Drop PDF files here..."
              : "📄 Drag & Drop PDF files here or click to browse"}
          </div>

          <span
            style={{
              fontSize: "12px",
              color: "#94a3b8",
              marginTop: "8px",
              display:
                "inline-block",
            }}
          >
            Multiple PDFs supported
          </span>
        </div>

        {/* =================================================
            SELECTED FILES
        ================================================= */}

        {selectedFiles.length >
          0 && (
          <div
            style={{
              marginTop: "20px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent:
                  "space-between",
                alignItems:
                  "center",
                marginBottom:
                  "10px",
              }}
            >
              <h4
                style={{
                  margin: 0,
                  color:
                    "#334155",
                  fontSize:
                    "14px",
                }}
              >
                Selected Files (
                {
                  selectedFiles.length
                }
                )
              </h4>

              <button
                type="button"
                onClick={
                  handleClearAll
                }
                style={{
                  border:
                    "none",
                  background:
                    "transparent",
                  color:
                    "#ef4444",
                  cursor:
                    "pointer",
                  fontSize:
                    "12px",
                  fontWeight:
                    "600",
                }}
              >
                Clear All
              </button>
            </div>

            <div
              style={{
                maxHeight:
                  "180px",
                overflowY:
                  "auto",
                border:
                  "1px solid #e2e8f0",
                borderRadius:
                  "6px",
                padding:
                  "8px",
              }}
            >
              {selectedFiles.map(
                (file, idx) => (
                  <div
                    key={`${file.name}-${idx}`}
                    style={{
                      display:
                        "flex",
                      justifyContent:
                        "space-between",
                      alignItems:
                        "center",
                      padding:
                        "8px 10px",
                      background:
                        idx % 2 ===
                        0
                          ? "#f8fafc"
                          : "#fff",
                      borderRadius:
                        "4px",
                      fontSize:
                        "13px",
                      marginBottom:
                        "2px",
                    }}
                  >
                    <span
                      style={{
                        color:
                          "#0f172a",
                        overflow:
                          "hidden",
                        textOverflow:
                          "ellipsis",
                        whiteSpace:
                          "nowrap",
                        maxWidth:
                          "90%",
                      }}
                    >
                      📄{" "}
                      {file.name}
                    </span>

                    <button
                      type="button"
                      onClick={(e) =>
                        handleRemoveFile(
                          idx,
                          e
                        )
                      }
                      style={{
                        border:
                          "none",
                        background:
                          "none",
                        color:
                          "#ef4444",
                        cursor:
                          "pointer",
                        fontWeight:
                          "bold",
                        fontSize:
                          "15px",
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* =================================================
            STATUS MESSAGE
        ================================================= */}

        {message && (
          <div
            style={{
              marginTop:
                "18px",
              padding:
                "12px",
              borderRadius:
                "7px",

              background:
                message
                  .toLowerCase()
                  .includes(
                    "error"
                  )
                  ? "#fef2f2"
                  : "#f0fdf4",

              color:
                message
                  .toLowerCase()
                  .includes(
                    "error"
                  )
                  ? "#b91c1c"
                  : "#166534",

              fontSize:
                "13px",
            }}
          >
            {message}
          </div>
        )}

        {/* =================================================
            BUTTONS
        ================================================= */}

        <div
          style={{
            marginTop:
              "24px",
            display:
              "flex",
            gap: "12px",
            flexWrap:
              "wrap",
          }}
        >
          {/* PROCESS PDF */}

          <button
            type="button"
            onClick={
              handleProcessPDFs
            }
            disabled={
              selectedFiles.length ===
                0 ||
              isProcessing
            }
            style={{
              backgroundColor:
                selectedFiles.length ===
                  0 ||
                isProcessing
                  ? "#94a3b8"
                  : "#0284c7",

              color: "#fff",

              border: "none",

              padding:
                "11px 22px",

              borderRadius:
                "6px",

              cursor:
                selectedFiles.length ===
                  0 ||
                isProcessing
                  ? "not-allowed"
                  : "pointer",

              fontWeight:
                "600",

              minWidth:
                "130px",
            }}
          >
            {isProcessing
              ? "Processing..."
              : "Process PDFs"}
          </button>

          {/* DOWNLOAD EXCEL */}

          <button
            type="button"
            onClick={
              handleDownloadExcel
            }
            disabled={
              processedData.length ===
              0
            }
            style={{
              backgroundColor:
                processedData.length ===
                0
                  ? "#94a3b8"
                  : "#16a34a",

              color: "#fff",

              border: "none",

              padding:
                "11px 22px",

              borderRadius:
                "6px",

              cursor:
                processedData.length ===
                0
                  ? "not-allowed"
                  : "pointer",

              fontWeight:
                "600",

              minWidth:
                "130px",
            }}
          >
            Download Excel
          </button>
        </div>

        {/* =================================================
            PREVIEW
        ================================================= */}

        {processedData.length >
          0 && (
          <div
            style={{
              marginTop:
                "25px",
              borderTop:
                "1px solid #e2e8f0",
              paddingTop:
                "20px",
            }}
          >
            <h4
              style={{
                margin:
                  "0 0 10px 0",
                color:
                  "#334155",
              }}
            >
              Processed Data Preview
            </h4>

            <div
              style={{
                overflowX:
                  "auto",
                border:
                  "1px solid #e2e8f0",
                borderRadius:
                  "6px",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse:
                    "collapse",
                  fontSize:
                    "12px",
                }}
              >
                <thead>
                  <tr
                    style={{
                      background:
                        "#f1f5f9",
                    }}
                  >
                    <th
                      style={{
                        padding:
                          "9px",
                        textAlign:
                          "left",
                      }}
                    >
                      BE No
                    </th>

                    <th
                      style={{
                        padding:
                          "9px",
                        textAlign:
                          "left",
                      }}
                    >
                      Supplier
                    </th>

                    <th
                      style={{
                        padding:
                          "9px",
                        textAlign:
                          "left",
                      }}
                    >
                      Invoice
                    </th>

                    <th
                      style={{
                        padding:
                          "9px",
                        textAlign:
                          "right",
                      }}
                    >
                      Amount
                    </th>

                    <th
                      style={{
                        padding:
                          "9px",
                        textAlign:
                          "left",
                      }}
                    >
                      Currency
                    </th>

                    <th
                      style={{
                        padding:
                          "9px",
                        textAlign:
                          "right",
                      }}
                    >
                      IGST
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {processedData.map(
                    (row, index) => (
                      <tr
                        key={index}
                        style={{
                          borderTop:
                            "1px solid #e2e8f0",
                        }}
                      >
                        <td
                          style={{
                            padding:
                              "8px",
                          }}
                        >
                          {row.BE_No ||
                            "-"}
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",
                          }}
                        >
                          {row.Supplier_Name ||
                            "-"}
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",
                          }}
                        >
                          {row.Invoice_No ||
                            "-"}
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",
                            textAlign:
                              "right",
                          }}
                        >
                          {row.Invoice_Amount ||
                            "-"}
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",
                          }}
                        >
                          {row.Currency ||
                            "-"}
                        </td>

                        <td
                          style={{
                            padding:
                              "8px",
                            textAlign:
                              "right",
                          }}
                        >
                          {row.IGST ||
                            0}
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default IDPMS;