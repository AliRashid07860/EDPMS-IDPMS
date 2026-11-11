import * as pdfjsLib from "pdfjs-dist";

// PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Default User set to blank
const DEFAULT_USER = "";

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseAmountToken(value) {
  const m = String(value ?? "").replace(/,/g, "").match(/^-?\d+(?:\.\d+)?$/);
  return m ? Number(m[0]) : null;
}

async function getPdfPages(file) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const pages = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();

    const items = content.items
      .filter((item) => item.str && item.str.trim())
      .map((item) => ({
        str: item.str.trim(),
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
      }));

    const rows = [];

    for (const item of items) {
      let row = rows.find((r) => Math.abs(r.y - item.y) <= 2.5);

      if (!row) {
        row = { y: item.y, items: [] };
        rows.push(row);
      }

      row.items.push(item);
    }

    rows.sort((a, b) => b.y - a.y);
    rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));

    pages.push({
      rows,
      text: rows.map((r) => r.items.map((i) => i.str).join(" ")).join("\n"),
    });
  }

  return pages;
}

function findRow(rows, regex, start = 0) {
  for (let i = start; i < rows.length; i += 1) {
    const line = rows[i].items.map((x) => x.str).join(" ");
    if (regex.test(line)) return i;
  }
  return -1;
}

function getFollowingValueRow(rows, headerIndex, maxDistance = 42) {
  if (headerIndex < 0) return -1;

  const headerY = rows[headerIndex].y;
  let best = -1;
  let bestScore = Infinity;

  for (let i = headerIndex + 1; i < rows.length; i += 1) {
    const distance = headerY - rows[i].y;

    if (distance < 0) continue;
    if (distance > maxDistance) break;

    const numericCount = rows[i].items.filter(
      (item) => parseAmountToken(item.str) !== null
    ).length;

    if (numericCount >= 2 && distance < bestScore) {
      best = i;
      bestScore = distance;
    }
  }

  return best;
}

function findLabeledItem(row, regex) {
  return row?.items.find((item) => regex.test(item.str)) || null;
}

function valueNearX(row, x) {
  if (!row || x === null) return null;

  const candidates = row.items
    .map((item) => ({
      item,
      value: parseAmountToken(item.str),
    }))
    .filter((entry) => entry.value !== null);

  if (!candidates.length) return null;

  candidates.sort(
    (a, b) => Math.abs(a.item.x - x) - Math.abs(b.item.x - x)
  );

  return candidates[0].value;
}

function extractHeader(page) {
  const lines = page.rows.map((r) =>
    r.items.map((i) => i.str).join(" ")
  );

  let BE_No = "";
  let BE_Date = "";

  for (const line of lines.slice(0, 20)) {
    const m = line.match(
      /\b([A-Z]{2,8}\d?)\s+(\d{7})\s+(\d{2}[/-]\d{2}[/-]\d{4})\b/i
    );

    if (m) {
      BE_No = m[2];
      BE_Date = m[3].replace(/-/g, "/");
      break;
    }
  }

  let HAWB_Number = "";
  let HAWB_Date = "";

  for (const line of lines.slice(0, 100)) {
    const m = line.match(
      /\b(\d{2}[/-]\d{2}[/-]\d{4})\s+([A-Z0-9]{6,25})\s+(\d{2}[/-]\d{2}[/-]\d{4})\b/
    );

    if (m && /[A-Z]/i.test(m[2])) {
      HAWB_Number = m[2];
      HAWB_Date = m[3].replace(/-/g, "/");
      break;
    }
  }

  let Payment_Ref = "";
  let Payment_Date = "";

  const paymentIndex = findRow(
    page.rows,
    /F\.\s*PAYMENT|PAYMENT\s+DETAILS/i
  );

  const paymentLines = lines.slice(
    Math.max(0, paymentIndex),
    Math.max(0, paymentIndex) + 12
  );

  for (const line of paymentLines) {
    const m = line.match(
      /\b(\d{8,15})\s+(\d{2}[/-]\d{2}[/-]\d{4})\s+[\d,]+(?:\.\d+)?\b/
    );

    if (m) {
      Payment_Ref = m[1];
      Payment_Date = m[2].replace(/[/-]/g, "-");
      break;
    }
  }

  return {
    BE_No,
    BE_Date,
    HAWB_Number,
    HAWB_Date,
    Payment_Ref,
    Payment_Date,
  };
}

function extractSupplier(page) {
  const start = findRow(
    page.rows,
    /3\s*\.?\s*SUPPLIER\s*NAME\s*&\s*ADDRESS/i
  );

  if (start < 0) return "";

  for (let i = start; i < Math.min(start + 8, page.rows.length); i += 1) {
    const line = clean(
      page.rows[i].items.map((x) => x.str).join(" ")
    );

    if (
      !line ||
      /SUPPLIER\s*NAME|THIRD\s*PARTY|5\s*\.?\s*AEO/i.test(line)
    ) continue;

    if (/^(?:CHINA|INDIA|WENZHOU)$/i.test(line)) continue;

    return line
      .replace(/\s+(?:BLOCK\s+\d|NO\.?\s*\d|ROAD\b|STREET\b).*/i, "")
      .replace(/[,:;]+$/, "")
      .trim();
  }

  return "";
}

function extractInvoiceFromPage(page) {
  const partIndex = findRow(
    page.rows,
    /PART\s*-\s*II\s*-\s*INVOICE\s*&\s*VALUATION\s*DETAILS/i
  );

  if (partIndex < 0) return null;

  const lines = page.rows.map((r) =>
    r.items.map((i) => i.str).join(" ")
  );

  // --- NAYA INVOICE EXTRACTION LOGIC ---
  let invoiceNo = "";
  let passedHeader = false;

  for (const line of lines.slice(partIndex + 1, partIndex + 15)) {
    // 1. Agar Invoice aur Date ek hi line mein hain (e.g., "INV202610035 14-OCT-26")
    const dateMatch = line.match(/\b([A-Z0-9\-_]{4,25})\s*(?:\|)?\s*\d{2}-[A-Z]{3}-\d{2}\b/i);
    if (dateMatch && !/^(CHINA|INDIA|DATE|SELLER|BUYER)$/i.test(dateMatch[1])) {
      invoiceNo = dateMatch[1];
      break;
    }

    // 2. Track karein ki parser "2. INVOICE NO" header cross kar chuka hai
    if (/2\.\s*INVOICE\s*NO/i.test(line)) {
      passedHeader = true;
      continue;
    }

    // 3. Header cross karne ke baad jo pehla valid alphanumeric string milega, wo invoice hoga
    if (passedHeader) {
      const cleanLine = line.replace(/\|/g, "").trim();
      const tokenMatch = cleanLine.match(/\b[A-Z0-9\-_]{4,25}\b/i);
      
      if (tokenMatch && !/^(CHINA|INDIA|BUYER|SELLER|NAME|ADDRESS)$/i.test(tokenMatch[0])) {
        invoiceNo = tokenMatch[0];
        break;
      }
    }
  }
  // -------------------------------------

  if (!invoiceNo) return null;

  const supplier = extractSupplier(page);

  const valueHeader = findRow(
    page.rows,
    /1\s*\.\s*INV\s*VALUE.*2\s*\.\s*FREIGHT.*3\s*\.\s*INSURANCE/i,
    partIndex
  );

  const valueRowIndex = getFollowingValueRow(
    page.rows,
    valueHeader,
    38
  );

  const valueRow =
    valueRowIndex >= 0 ? page.rows[valueRowIndex] : null;

  const currencyRow =
    valueRowIndex >= 0
      ? page.rows
          .slice(valueRowIndex + 1, valueRowIndex + 4)
          .find((r) =>
            r.items.some((x) =>
              /\b(?:USD|CNY|INR|EUR|GBP)\b/i.test(x.str)
            )
          )
      : null;

  const valueHeaderRow =
    valueHeader >= 0 ? page.rows[valueHeader] : null;

  const invLabel = findLabeledItem(
    valueHeaderRow,
    /INV\s*VALUE/i
  );

  const freightLabel = findLabeledItem(
    valueHeaderRow,
    /FREIGHT/i
  );

  const insuranceLabel = findLabeledItem(
    valueHeaderRow,
    /INSURANCE/i
  );

  const numericItems =
    valueRow?.items.filter(
      (x) => parseAmountToken(x.str) !== null
    ) || [];

  const fallbackNumbers = numericItems.map(
    (x) => parseAmountToken(x.str)
  );

  const amount = fallbackNumbers[0] ?? 0;
  const freight = fallbackNumbers[1] ?? 0;
  const insurance = fallbackNumbers[2] ?? 0;

  const currencyItems = currencyRow?.items
    .map((item) => ({
      x: item.x,
      code:
        item.str.match(/\b(USD|CNY|INR|EUR|GBP)\b/i)?.[1]?.toUpperCase() || "",
    }))
    .filter((item) => item.code)
    .sort((a, b) => a.x - b.x);

  const getCurrencyNear = (_x, fallbackIndex) =>
    currencyItems?.[fallbackIndex]?.code || "";

  return {
    invoiceNo,
    amount,
    currency: getCurrencyNear(invLabel?.x, 0),
    freight,
    freightCurrency: getCurrencyNear(freightLabel?.x, 1),
    insurance,
    insuranceCurrency: getCurrencyNear(insuranceLabel?.x, 2),
    supplier,
  };
}

function extractDutySummary(page) {
  const headerIndex = findRow(
    page.rows,
    /1\s*\.\s*BCD/i
  );

  if (headerIndex < 0) {
    return {
      BCD: 0,
      SWS: 0,
      ADD: 0,
      INT: 0,
      FINE: 0,
      CHCESS: 0,
      IGST: 0,
    };
  }

  const header = page.rows[headerIndex];

  const valueIndex = getFollowingValueRow(
    page.rows,
    headerIndex,
    45
  );

  const values =
    valueIndex >= 0 ? page.rows[valueIndex] : null;

  const pick = (pattern) => {
    const label = findLabeledItem(header, pattern);
    return label ? (valueNearX(values, label.x) ?? 0) : 0;
  };

  return {
    BCD: pick(/\bBCD\b/i),
    SWS: pick(/\bSWS\b/i),
    ADD: pick(/\bADD\b/i),
    INT: 0,
    FINE: 0,
    CHCESS: 0,
    IGST: pick(/\bIGST\b/i),
  };
}

function getMetadata(supplier) {
  const name = (supplier || "").toUpperCase();

  if (name.includes("YOULI OPTICS")) {
    return {
      Category: "Merchandising",
      Sub_Category: "Eyewear & Sunglasses",
      User: DEFAULT_USER,
    };
  }

  if (name.includes("LOVEDOOR")) {
    return {
      Category: "Merchandising",
      Sub_Category: "Cases & Fabrics",
      User: DEFAULT_USER,
    };
  }

  return {
    Category: "",
    Sub_Category: "",
    User: DEFAULT_USER,
  };
}

export async function extractCustomsData(file) {
  try {
    const pages = await getPdfPages(file);

    if (!pages.length) return [];

    const header = extractHeader(pages[0]);
    const duty = extractDutySummary(pages[0]);

    const invoices = pages
      .map(extractInvoiceFromPage)
      .filter(Boolean);

    if (!invoices.length) {
      throw new Error(
        "Part-II invoice pages were not detected. Please check the PDF text layer."
      );
    }

    const firstSupplier =
      invoices.find((x) => x.supplier)?.supplier || "";

    const metadata = getMetadata(firstSupplier);

    return invoices.map((invoice, index) => {
      const first = index === 0;

      return {
        BE_No: header.BE_No,
        BE_Date: first ? header.BE_Date : "",
        HAWB_Number: first ? header.HAWB_Number : "",
        HAWB_Date: first ? header.HAWB_Date : "",

        Supplier_Name: invoice.supplier || firstSupplier,

        Invoice_No: invoice.invoiceNo,
        Invoice_Amount: invoice.amount,
        Currency: invoice.currency,

        BCD: first ? duty.BCD : "",
        SWS: first ? duty.SWS : "",
        ADD: first ? duty.ADD : "",
        INT: first ? duty.INT : "",
        FINE: first ? duty.FINE : "",
        CHCESS: first ? duty.CHCESS : "",
        IGST: first ? duty.IGST : "",

        Customs_Components: first ? "BCD+SWS" : "",

        Freight_Amount: invoice.freight,
        Freight_Currency: invoice.freightCurrency,

        Icegate_Ack: "",
        Payment_Ref: header.Payment_Ref,
        Payment_Request_Date: header.Payment_Date,
        Actual_Payment_Date: header.Payment_Date,

        Category: metadata.Category,
        Sub_Category: metadata.Sub_Category,
        User: metadata.User,

        Notes: first && invoice.insurance
          ? `Source PDF: ${file.name}; Insurance: ${invoice.insurance} ${invoice.insuranceCurrency}`
          : `Source PDF: ${file.name}`,
      };
    });
  } catch (error) {
    console.error(`Error parsing ${file.name}:`, error);

    throw new Error(`${file.name}: ${error.message}`);
  }
}