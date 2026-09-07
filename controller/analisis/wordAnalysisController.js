import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import AdmZip from "adm-zip";
import AnalysisHistory from "../../db/models/AnalysisHistory.js";
import { logActivity } from "../user/activityController.js";
import {
  buildVariableMapFromDataset,
  renderInflasiIhkTemplate,
  loadInflasiIhkTemplate,
  loadTemplateByIndicator,
  renderTemplateByIndicator,
  renderTemplateObject
} from "./templateVariableMapper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const EXPORT_DIR = path.resolve(__dirname, "../../export/analysis_files");
if (!fs.existsSync(EXPORT_DIR)) {
  fs.mkdirSync(EXPORT_DIR, { recursive: true });
}

const TEMPLATE_LOCATIONS = [
  path.resolve(__dirname, "../../frontend/src/word/engine/template/BERITA.docx"),
  path.resolve(__dirname, "../../../frontend/src/word/engine/template/BERITA.docx"),
  path.resolve(__dirname, "../../../templat/inflasi&ihk/BERITA.docx"),
];

/**
 * Helper: Normalisasi nama file
 */
const sanitizeName = (str) => {
  return String(str || "").replace(/[^a-zA-Z0-9.\-_]/g, "_");
};

/**
 * Helper: Hitung lebar kolom dinamis agar pas 100% margin (totalWidth dxa)
 */
function calculateColumnWidths(headers, totalWidth = 9638) {
  const n = headers.length;
  if (n <= 1) return [totalWidth];
  if (n === 4 && totalWidth === 9638) return [4500, 1700, 1700, 1738];
  if (n === 4 && totalWidth === 4600) return [1600, 1000, 1000, 1000];
  if (n === 8 && totalWidth === 9638) return [2500, 1000, 1000, 1000, 1000, 1000, 1050, 1088];
  if (n === 9 && totalWidth === 9638) return [2358, 910, 910, 910, 910, 910, 910, 910, 910];

  const col1Width = n >= 7 ? Math.round(totalWidth * 0.25) : Math.round(totalWidth * 0.45);
  const remainingWidth = totalWidth - col1Width;
  const otherWidth = Math.floor(remainingWidth / (n - 1));
  const widths = [col1Width];
  let sum = col1Width;
  for (let i = 1; i < n - 1; i++) {
    widths.push(otherWidth);
    sum += otherWidth;
  }
  widths.push(totalWidth - sum);
  return widths;
}

/**
 * Helper: Escape XML special characters
 */
function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Helper: Safely remove paragraphs containing a specific target string without regex overflow
 */
function removeParagraphsContaining(str, target) {
  let result = str;
  let pos = 0;
  while ((pos = result.indexOf(target, pos)) !== -1) {
    const sub = result.substring(0, pos);
    const matches = [...sub.matchAll(/<w:p[\s>]/g)];
    const pStart = matches.length > 0 ? matches[matches.length - 1].index : -1;
    const pEnd = result.indexOf("</w:p>", pos);
    if (pStart !== -1 && pEnd !== -1) {
      result = result.slice(0, pStart) + result.slice(pEnd + 6);
      pos = pStart;
    } else {
      pos += target.length;
    }
  }
  return result;
}

/**
 * Helper: Generate In-Line with Text XML for Word image (<wp:inline>)
 */
export function buildInlineImageWordXml(rId, name, cx, cy, docPrId = 999901) {
  return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="120" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="${escapeXml(name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${docPrId}" name="${escapeXml(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}

/**
 * Generate XML tabel Word dinamis (<w:tbl>) langsung dari markdown & style di inflasiIHK.json
 */
export function buildTableWordXmlFromMarkdown(tableConfig, varMap = {}, totalWidth = 9638) {
  if (!tableConfig || !tableConfig.markdown) return "";

  let md = tableConfig.markdown;
  for (const [k, v] of Object.entries(varMap)) {
    if (v !== undefined && v !== null) {
      md = md.split("${" + k + "}").join(String(v));
    }
  }

  const lines = md.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  const rows = [];
  for (const line of lines) {
    if (/^\|[\s\-:|—]+\|$/.test(line)) {
      continue;
    }
    const cells = line.split("|").map(c => c.trim());
    if (cells.length >= 2 && cells[0] === "" && cells[cells.length - 1] === "") {
      cells.shift();
      cells.pop();
    }
    rows.push(cells);
  }

  if (rows.length === 0) return "";

  const headerCells = rows[0];
  const numCols = headerCells.length;
  const colWidths = calculateColumnWidths(headerCells, totalWidth);

  const headerBg = (tableConfig.style?.header?.backgroundColor || "F68839").replace("#", "");
  const numberingBg = (tableConfig.style?.numbering?.backgroundColor || "FFD684").replace("#", "");
  const rowColors = (tableConfig.style?.rowColors || ["FFF5E6", "FFF0D3"]).map(c => c.replace("#", ""));

  let xml = `<w:tbl>` +
    `<w:tblPr>` +
    `<w:tblW w:w="${totalWidth}" w:type="dxa"/>` +
    `<w:jc w:val="center"/>` +
    `<w:tblBorders>` +
    `<w:top w:val="single" w:sz="8" w:space="0" w:color="${headerBg}"/>` +
    `<w:bottom w:val="single" w:sz="8" w:space="0" w:color="${headerBg}"/>` +
    `<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="CBD5E1"/>` +
    `<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>` +
    `</w:tblBorders>` +
    `<w:tblCellMar>` +
    `<w:top w:w="80" w:type="dxa"/>` +
    `<w:bottom w:w="80" w:type="dxa"/>` +
    `<w:left w:w="100" w:type="dxa"/>` +
    `<w:right w:w="100" w:type="dxa"/>` +
    `</w:tblCellMar>` +
    `</w:tblPr>` +
    `<w:tblGrid>` +
    colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join("") +
    `</w:tblGrid>`;

  // Row 1: Header
  xml += `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>`;
  for (let c = 0; c < numCols; c++) {
    const w = colWidths[c] || 1000;
    const text = escapeXml(headerCells[c] || "");
    xml += `<w:tc>` +
      `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="center"/><w:shd w:val="clear" w:color="auto" w:fill="${headerBg}"/></w:tcPr>` +
      `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/></w:pPr>` +
      `<w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:color w:val="FFFFFF"/><w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:t>${text}</w:t></w:r>` +
      `</w:p></w:tc>`;
  }
  xml += `</w:tr>`;

  // Data rows or Numbering row
  let dataRowIdx = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const isNumbering = row.some(cell => /^\(\d+\)$/.test(cell.trim()));

    if (isNumbering) {
      xml += `<w:tr><w:trPr><w:tblHeader/><w:cantSplit/></w:trPr>`;
      for (let c = 0; c < numCols; c++) {
        const w = colWidths[c] || 1000;
        const text = escapeXml(row[c] || "");
        const align = c === 0 ? "center" : "right";
        xml += `<w:tc>` +
          `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="center"/><w:shd w:val="clear" w:color="auto" w:fill="${numberingBg}"/></w:tcPr>` +
          `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/></w:pPr>` +
          `<w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:color w:val="475569"/><w:sz w:val="15"/><w:szCs w:val="15"/></w:rPr><w:t>${text}</w:t></w:r>` +
          `</w:p></w:tc>`;
      }
      xml += `</w:tr>`;
    } else {
      const fill = rowColors.length > 0 ? rowColors[dataRowIdx % rowColors.length] : "FFFFFF";
      dataRowIdx++;
      const isHeadline = row[0] && row[0].toLowerCase().includes("umum");

      xml += `<w:tr><w:trPr><w:cantSplit/></w:trPr>`;
      for (let c = 0; c < numCols; c++) {
        const w = colWidths[c] || 1000;
        const text = escapeXml(row[c] || "");
        const align = c === 0 ? "left" : "right";
        const boldXml = isHeadline ? `<w:b/><w:bCs/>` : "";
        xml += `<w:tc>` +
          `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/><w:vAlign w:val="center"/><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>` +
          `<w:p><w:pPr><w:jc w:val="${align}"/><w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/></w:pPr>` +
          `<w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/>${boldXml}<w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="1E293B"/></w:rPr><w:t>${text}</w:t></w:r>` +
          `</w:p></w:tc>`;
      }
      xml += `</w:tr>`;
    }
  }

  xml += `</w:tbl>`;
  return xml;
}

/**
 * Generate XML Section 2 dinamis langsung dari inflasiIHK.json (content[2])
 */
export function buildSection2WordXmlFromTemplate(section2Config, varMap = {}) {
  if (!section2Config) return "";

  const col0 = section2Config.column?.[0] || {};
  const col1 = section2Config.column?.[1] || {};

  const col0Title = renderTemplateObject(col0.title?.desc || "Penjelasan Teknis", varMap);
  const col0Desc = renderTemplateObject(col0.desc || "", varMap);
  const col0Paragraphs = col0Desc.split("\n").map(l => l.trim()).filter(Boolean);

  const col1Title = renderTemplateObject(col1.title?.desc || "Perubahan Tahun Dasar", varMap);
  const col1Desc = renderTemplateObject(col1.desc || "", varMap);
  const col1Paragraphs = col1Desc.split("\n").map(l => l.trim()).filter(Boolean);

  const table3Config = col1.table;
  const table3Title = renderTemplateObject(table3Config?.judul || "Tabel 3", varMap);
  const table3Xml = buildTableWordXmlFromMarkdown(table3Config, varMap, 4600);

  let xml = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
    '<w:tbl>' +
    '<w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>' +
    '<w:tr>' +
    // Left Column
    '<w:tc>' +
    '<w:tcPr><w:tcW w:w="4600" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>' +
    '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FEE3CE"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:sz w:val="18"/><w:color w:val="1E293B"/></w:rPr><w:t>  ' + escapeXml(col0Title) + '</w:t></w:r></w:p>';

  for (const p of col0Paragraphs) {
    xml += '<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="15"/><w:color w:val="334155"/></w:rPr><w:t>' + escapeXml(p) + '</w:t></w:r></w:p>';
  }

  xml += '</w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="400" w:type="dxa"/></w:tcPr><w:p/></w:tc>' +
    // Right Column
    '<w:tc>' +
    '<w:tcPr><w:tcW w:w="4600" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>' +
    '<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FEE3CE"/><w:spacing w:before="60" w:after="60"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:sz w:val="18"/><w:color w:val="1E293B"/></w:rPr><w:t>  ' + escapeXml(col1Title) + '</w:t></w:r></w:p>';

  for (const p of col1Paragraphs) {
    xml += '<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="40" w:after="40" w:line="220" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="15"/><w:color w:val="334155"/></w:rPr><w:t>' + escapeXml(p) + '</w:t></w:r></w:p>';
  }

  if (table3Title) {
    xml += '<w:p><w:pPr><w:spacing w:before="60" w:after="20"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:sz w:val="15"/><w:color w:val="1E293B"/></w:rPr><w:t>' + escapeXml(table3Title) + '</w:t></w:r></w:p>';
  }

  if (table3Xml) {
    xml += table3Xml;
  }

  xml += '</w:tc>' +
    '</w:tr>' +
    '</w:tbl>';

  return xml;
}

/**
 * Terapkan styling resmi dari template JSON pada document.xml
 */
export function applyInflasiIhkStylingToXml(xmlContent, templateConfig = null) {
  let xml = xmlContent;

  const tableStyle = templateConfig?.content?.[0]?.desc?.find(d => d.table)?.table?.style;
  const headerColor = (tableStyle?.header?.backgroundColor || "F68839").replace("#", "").toUpperCase();
  const numberingColor = (tableStyle?.numbering?.backgroundColor || "FFD684").replace("#", "").toUpperCase();
  const rowColor = (tableStyle?.rowColors?.[1] || "FFF0D3").replace("#", "").toUpperCase();

  // 1. Header tabel: Ganti biru (2B6CB0) dengan warna tema template
  xml = xml.split("2B6CB0").join(headerColor);
  xml = xml.split("2b6cb0").join(headerColor);

  // 2. Heading title: Ganti biru tua (1E3A8A) dengan warna tema template
  xml = xml.split("1E3A8A").join(headerColor);
  xml = xml.split("1e3a8a").join(headerColor);

  // 3. Numbering cell: Ganti abu (E2E8F0) dengan warna numbering template
  xml = xml.split("E2E8F0").join(numberingColor);
  xml = xml.split("e2e8f0").join(numberingColor);

  // 4. Alternating rows: F8FAFC -> warna row template
  xml = xml.split("F8FAFC").join(rowColor);
  xml = xml.split("f8fafc").join(rowColor);

  return xml;
}

/**
 * Controller: Generate initial Word BRS DOCX with ALL Step 3 data placeholders replaced
 * POST /api/analisis/word/generate
 */
export const generateWordBrs = async (req, res) => {
  try {
    const {
      city = "Kota Metro",
      periode = "November 2025",
      title = "Berita Resmi Statistik",
      variables = {},
      dataset = null,
      uploadedDataset = null,
    } = req.body;

    // Find base template BERITA.docx
    let templatePath = "";
    for (const p of TEMPLATE_LOCATIONS) {
      if (fs.existsSync(p)) {
        templatePath = p;
        break;
      }
    }

    if (!templatePath) {
      return res.status(404).json({ message: "Template base BERITA.docx tidak ditemukan di sistem" });
    }

    // 1. Build complete variable mapping from Step 3 data
    const activeDataset = uploadedDataset || dataset || {
      context: { city, period: periode, title }
    };
    const activeIndicator = activeDataset?.context?.indicator || activeDataset?.context?.selectedIndicator || activeDataset?.fileInfo?.selectedIndicator || "komoditas";
    const varMap = buildVariableMapFromDataset(activeDataset, variables);

    // Load fresh indicator-specific template and rendered values
    const freshTemplate = loadTemplateByIndicator(activeIndicator);
    const renderedTemplateData = renderTemplateByIndicator(activeDataset, variables, activeIndicator);
    const rendered = renderedTemplateData?.template || freshTemplate;

    // 2. Open BERITA.docx and process all XML files (document.xml, footers, headers)
    const zip = new AdmZip(templatePath);
    // Process client banner images if provided
    const clientImages = req.body?.images || req.body?.banners || uploadedDataset?.images || uploadedDataset?.banners || {};
    let chartBrsBuffer = null;
    let infografisBuffer = null;

    for (const [imgId, base64Data] of Object.entries(clientImages)) {
      if (typeof base64Data === "string" && base64Data.length > 50) {
        const base64Clean = base64Data.includes("base64,") ? base64Data.split("base64,")[1] : base64Data;
        const buf = Buffer.from(base64Clean, "base64");
        const lowerId = String(imgId).toLowerCase();
        if (imgId === "Chart BRS" || lowerId.includes("chart")) {
          chartBrsBuffer = buf;
        } else if (imgId === "Infografis" || lowerId.includes("infografis")) {
          infografisBuffer = buf;
        }
      }
    }

    if (chartBrsBuffer) {
      zip.addFile("word/media/image_chart_brs.png", chartBrsBuffer);
    }
    if (infografisBuffer) {
      zip.addFile("word/media/image_infografis.png", infografisBuffer);
    }

    if (chartBrsBuffer || infografisBuffer) {
      // 1. Ensure [Content_Types].xml supports PNG
      const ctEntry = zip.getEntry("[Content_Types].xml");
      if (ctEntry) {
        let ctXml = ctEntry.getData().toString("utf8");
        if (!ctXml.includes('Extension="png"')) {
          ctXml = ctXml.replace("</Types>", '<Default Extension="png" ContentType="image/png"/></Types>');
          zip.updateFile("[Content_Types].xml", Buffer.from(ctXml, "utf8"));
        }
      }

      // 2. Add relationships to word/_rels/document.xml.rels
      const relsEntry = zip.getEntry("word/_rels/document.xml.rels");
      if (relsEntry) {
        let relsXml = relsEntry.getData().toString("utf8");
        let newRels = "";
        if (chartBrsBuffer && !relsXml.includes('Id="rIdChartBrs"')) {
          newRels += '<Relationship Id="rIdChartBrs" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image_chart_brs.png"/>';
        }
        if (infografisBuffer && !relsXml.includes('Id="rIdInfografis"')) {
          newRels += '<Relationship Id="rIdInfografis" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image_infografis.png"/>';
        }
        if (newRels) {
          relsXml = relsXml.replace("</Relationships>", `${newRels}</Relationships>`);
          zip.updateFile("word/_rels/document.xml.rels", Buffer.from(relsXml, "utf8"));
        }
      }
    }

    const entries = zip.getEntries();

    for (const entry of entries) {
      if (entry.entryName.startsWith("word/") && entry.entryName.endsWith(".xml")) {
        let xmlContent = entry.getData().toString("utf8");

        if (entry.entryName === "word/document.xml") {
          // A. Table 1, Judul, and Footnote dynamically from inflasiIHK.json (content[0])
          const table1Config = freshTemplate?.content?.[0]?.desc?.find(d => d.table)?.table;
          if (table1Config) {
            const tbl1Match = xmlContent.match(/<w:tbl[\s>]/);
            if (tbl1Match) {
              const tbl1Start = tbl1Match.index;
              const tbl1End = xmlContent.indexOf("</w:tbl>", tbl1Start) + 8;

              const prevPEnd = xmlContent.lastIndexOf("</w:p>", tbl1Start);
              const beforePrevPEnd = xmlContent.substring(0, prevPEnd);
              const prevPMatches = [...beforePrevPEnd.matchAll(/<w:p[\s>]/g)];
              const prevPStart = prevPMatches[prevPMatches.length - 1]?.index;

              const nextPStart = xmlContent.indexOf("<w:p", tbl1End);
              const nextPEnd = xmlContent.indexOf("</w:p>", nextPStart) + 6;

              const renderedTbl1Judul = renderTemplateObject(table1Config.judul, varMap);
              const newTbl1JudulP = `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="left"/><w:spacing w:before="160" w:after="80" w:line="260" w:lineRule="auto"/><w:keepNext/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="1E293B"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="1E293B"/></w:rPr><w:t>${escapeXml(renderedTbl1Judul)}</w:t></w:r></w:p>`;

              const renderedFootnote = renderTemplateObject(table1Config.footnote?.text || "", varMap);
              const newFootnoteP = `<w:p><w:pPr><w:pStyle w:val="p1"/><w:spacing w:before="60" w:after="80" w:line="220" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="14"/><w:szCs w:val="14"/><w:color w:val="64748B"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="14"/><w:szCs w:val="14"/><w:color w:val="64748B"/></w:rPr><w:t>${escapeXml(renderedFootnote)}</w:t></w:r></w:p>`;

              const table1Xml = buildTableWordXmlFromMarkdown(table1Config, varMap, 9638);
              if (prevPStart !== undefined && nextPEnd !== -1) {
                xmlContent = xmlContent.slice(0, prevPStart) + newTbl1JudulP + table1Xml + newFootnoteP + xmlContent.slice(nextPEnd);
              }
            }
          }

          // B. Sub-groups 1.1 to 1.11 dynamically from inflasiIHK.json
          const subGroups = rendered?.content?.[0]?.sub;
          if (Array.isArray(subGroups) && subGroups.length > 0) {
            const delimiters = [
              ...subGroups.map(s => s.title?.desc?.trim() || ""),
              "Perbandingan Inflasi Antar Tahun"
            ];
            let searchPos = 70000;
            for (let i = 0; i < subGroups.length; i++) {
              const currentTitle = delimiters[i];
              const nextTitle = delimiters[i + 1];
              if (!currentTitle || !nextTitle) continue;

              const currentIdx = xmlContent.indexOf(currentTitle, searchPos);
              if (currentIdx === -1) continue;
              const currentPEnd = xmlContent.indexOf("</w:p>", currentIdx) + 6;

              const nextIdx = xmlContent.indexOf(nextTitle, currentPEnd);
              if (nextIdx === -1) continue;
              const beforeNext = xmlContent.substring(0, nextIdx);
              const pMatches = [...beforeNext.matchAll(/<w:p[\s>]/g)];
              if (pMatches.length === 0) continue;
              const nextPStart = pMatches[pMatches.length - 1].index;

              const lines = (subGroups[i].desc || "").split("\n").map(l => l.trim()).filter(Boolean);
              let newPXml = "";
              for (const line of lines) {
                newPXml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="both"/><w:spacing w:before="80" w:after="100" w:line="260" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="1E293B"/></w:rPr><w:t>${escapeXml(line)}</w:t></w:r></w:p>`;
              }

              xmlContent = xmlContent.slice(0, currentPEnd) + newPXml + xmlContent.slice(nextPStart);
              searchPos = currentPEnd + newPXml.length;
            }
          }

          // C. Table 2 & Judul dynamically from inflasiIHK.json (content[1])
          const table2Config = freshTemplate?.content?.[1]?.desc?.find(d => d.table)?.table;
          if (table2Config) {
            const tbl2Start = xmlContent.indexOf("<w:tbl", 100000);
            if (tbl2Start !== -1) {
              const tbl2End = xmlContent.indexOf("</w:tbl>", tbl2Start) + 8;
              const t2PrevPEnd = xmlContent.lastIndexOf("</w:p>", tbl2Start);
              const beforeT2PrevPEnd = xmlContent.substring(0, t2PrevPEnd);
              const t2PMatches = [...beforeT2PrevPEnd.matchAll(/<w:p[\s>]/g)];
              const t2PrevPStart = t2PMatches[t2PMatches.length - 1]?.index;

              const renderedTbl2Judul = renderTemplateObject(table2Config.judul, varMap);
              const newTbl2JudulP = `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="left"/><w:spacing w:before="160" w:after="80" w:line="260" w:lineRule="auto"/><w:keepNext/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="1E293B"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="1E293B"/></w:rPr><w:t>${escapeXml(renderedTbl2Judul)}</w:t></w:r></w:p>`;
              const table2Xml = buildTableWordXmlFromMarkdown(table2Config, varMap, 9638);
              if (t2PrevPStart !== undefined && tbl2End !== -1) {
                xmlContent = xmlContent.slice(0, t2PrevPStart) + newTbl2JudulP + table2Xml + xmlContent.slice(tbl2End);
              }
            }
          }

          // D. Chart BRS image strictly following JSON order (content[2]) - in line with text
          const tbl2SearchMatch = xmlContent.slice(100000).match(/<w:tbl[\s>]/);
          if (tbl2SearchMatch) {
            const tbl2Start = 100000 + tbl2SearchMatch.index;
            const tbl2End = xmlContent.indexOf("</w:tbl>", tbl2Start) + 8;
            const nextTblMatch = xmlContent.slice(tbl2End).match(/<w:tbl[\s>]/);
            if (nextTblMatch) {
              const nextTblStart = tbl2End + nextTblMatch.index;
              const chartBrsXml = chartBrsBuffer
                ? buildInlineImageWordXml("rIdChartBrs", "Chart BRS", 5715000, 3160687, 999902)
                : "";
              const nextSectionBreakXml = `<w:p><w:pPr><w:pStyle w:val="p1"/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="816" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr></w:pPr></w:p>`;

              // Replace the gap between Table 2 and Penjelasan Teknis with Chart BRS + clean Section Break
              xmlContent = xmlContent.slice(0, tbl2End) + chartBrsXml + nextSectionBreakXml + xmlContent.slice(nextTblStart);
            }
          }

          // E. Extract Contact Block (Untuk informasi lebih lanjut silakan hubungi..., PST, Alamat BPS)
          // agar teks kontak ini selalu diposisikan di HALAMAN PALING TERAKHIR dokumen BRS di Step 4.
          const contactMarker = "Konten Berita Resmi Statistik dilindungi oleh Undang-Undang";
          let contactBlockXml = "";
          if (xmlContent.includes(contactMarker)) {
            const contactIdx = xmlContent.lastIndexOf("<w:tbl", xmlContent.indexOf(contactMarker));
            const lastSectPrIdx = xmlContent.lastIndexOf("<w:sectPr");
            if (contactIdx !== -1 && lastSectPrIdx !== -1 && lastSectPrIdx > contactIdx) {
              contactBlockXml = xmlContent.slice(contactIdx, lastSectPrIdx);
              // Lepaskan blok kontak dari posisi tengah agar tidak bertumpuk sebelum infografis / setelah tabel 3
              xmlContent = xmlContent.slice(0, contactIdx) + xmlContent.slice(lastSectPrIdx);
            }
          }

          // F. Section 2 (column: Penjelasan Teknis & Perubahan Tahun Dasar) dinamis jika belum ada
          if (!xmlContent.includes("Penjelasan Teknis")) {
            const sec2Config = freshTemplate?.content?.find(c => c.column);
            if (sec2Config) {
              const sec2Xml = buildSection2WordXmlFromTemplate(sec2Config, varMap);
              const curLastSectPrIdx = xmlContent.lastIndexOf("<w:sectPr");
              if (curLastSectPrIdx !== -1) {
                xmlContent = xmlContent.slice(0, curLastSectPrIdx) + sec2Xml + xmlContent.slice(curLastSectPrIdx);
              }
            }
          }

          // G. Infografis full-page banner strictly following JSON order (content[4]) - in line with text
          if (infografisBuffer && !xmlContent.includes("rIdInfografis")) {
            const curLastSectPrIdx = xmlContent.lastIndexOf("<w:sectPr");
            if (curLastSectPrIdx !== -1) {
              const infografisXml = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
                buildInlineImageWordXml("rIdInfografis", "Infografis", 5715000, 8096250, 999901);
              xmlContent = xmlContent.slice(0, curLastSectPrIdx) + infografisXml + xmlContent.slice(curLastSectPrIdx);
            }
          }

          // H. Tempatkan teks kontak BPS di HALAMAN PALING TERAKHIR dengan pemisah page break
          if (contactBlockXml) {
            const finalSectPrIdx = xmlContent.lastIndexOf("<w:sectPr");
            if (finalSectPrIdx !== -1) {
              const pageBreakXml = `<w:p><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr><w:r><w:br w:type="page"/></w:r></w:p>`;
              xmlContent = xmlContent.slice(0, finalSectPrIdx) + pageBreakXml + contactBlockXml + xmlContent.slice(finalSectPrIdx);
            }
          }

          // G. Terapkan styling resmi dari template JSON indikator
          xmlContent = applyInflasiIhkStylingToXml(xmlContent, freshTemplate);
        }

        if (xmlContent.includes("${")) {
          for (const [k, v] of Object.entries(varMap)) {
            if (v !== undefined && v !== null) {
              const token = "${" + k + "}";
              xmlContent = xmlContent.split(token).join(String(v));
            }
          }
          const faxText = varMap["noFax"] ? `Fax: ${varMap["noFax"]}` : "";
          xmlContent = xmlContent.replace(/\$\{fax\b[^}]*\}/g, faxText);
          xmlContent = xmlContent.replace(/\$\{[^}]+\}/g, "");
          zip.updateFile(entry.entryName, Buffer.from(xmlContent, "utf8"));
        } else if (entry.entryName === "word/document.xml") {
          zip.updateFile(entry.entryName, Buffer.from(xmlContent, "utf8"));
        }
      }
    }


    const cleanCity = String(varMap["namaKota"] || city).replace(/^(KOTA|KABUPATEN|KAB\.?)\s+/i, "");
    const cleanPeriod = String(varMap["bulanTahun"] || periode);
    const timestamp = Date.now();
    const outFilename = `brs_${sanitizeName(cleanCity)}_${sanitizeName(cleanPeriod)}_${timestamp}.docx`;
    const outPath = path.join(EXPORT_DIR, outFilename);

    zip.writeZip(outPath);

    return res.json({
      success: true,
      filename: outFilename,
      url: `/analysis-files/${outFilename}`,
      fullUrl: `${req.protocol}://${req.get("host")}/analysis-files/${outFilename}`,
      variablesCount: Object.keys(varMap).length,
      variables: varMap,
      renderedTemplate: renderedTemplateData?.template || null,
    });
  } catch (err) {
    console.error("[generateWordBrs] Error:", err.message);
    return res.status(500).json({ message: "Gagal men-generate template Word: " + err.message });
  }
};

/**
 * Controller: Simpan hasil analisis dari MS Word Editor ke database (DOCX dan PDF)
 * POST /api/analisis/word/save
 */
export const saveWordAnalysis = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ message: "Pengguna tidak terautentikasi" });
    }

    const {
      title,
      periode,
      city,
      docxBase64,
      pdfBase64,
      docxFilename: reqDocxName,
      pdfFilename: reqPdfName,
    } = req.body;

    const targetCity = city || "Kota Metro";
    const periodText = periode || new Date().toLocaleString("id-ID", { month: "long", year: "numeric" });
    const reportTitle = title || `Laporan BRS ${targetCity} - ${periodText}`;

    const timestamp = Date.now();
    const cleanCity = sanitizeName(targetCity);
    const cleanPeriod = sanitizeName(periodText);
    const baseName = `${userId}_${timestamp}_brs_${cleanCity}_${cleanPeriod}`;

    let finalDocxFilename = "";
    let finalPdfFilename = "";

    // Handle DOCX payload
    if (docxBase64) {
      const docxBuffer = Buffer.from(
        docxBase64.replace(/^data:[^;]+;base64,/, ""),
        "base64"
      );
      finalDocxFilename = `${baseName}.docx`;
      fs.writeFileSync(path.join(EXPORT_DIR, finalDocxFilename), docxBuffer);
    } else if (reqDocxName && fs.existsSync(path.join(EXPORT_DIR, reqDocxName))) {
      finalDocxFilename = reqDocxName;
    }

    // Handle PDF payload
    if (pdfBase64) {
      const pdfBuffer = Buffer.from(
        pdfBase64.replace(/^data:[^;]+;base64,/, ""),
        "base64"
      );
      finalPdfFilename = `${baseName}.pdf`;
      fs.writeFileSync(path.join(EXPORT_DIR, finalPdfFilename), pdfBuffer);
    } else if (reqPdfName && fs.existsSync(path.join(EXPORT_DIR, reqPdfName))) {
      finalPdfFilename = reqPdfName;
    }

    if (!finalDocxFilename && !finalPdfFilename) {
      return res.status(400).json({ message: "File DOCX atau PDF harus dikirimkan" });
    }

    const history = new AnalysisHistory({
      userId,
      title: reportTitle,
      periode: periodText,
      analysisFile: finalDocxFilename || finalPdfFilename,
      docxFile: finalDocxFilename,
      pdfFile: finalPdfFilename,
    });

    await history.save();
    await logActivity(userId, `Menyimpan laporan analisis Word BRS: ${reportTitle}`);

    return res.status(201).json({
      success: true,
      message: "Laporan analisis berhasil disimpan ke database dalam format DOCX dan PDF",
      historyId: history._id,
      title: history.title,
      periode: history.periode,
      docxFile: finalDocxFilename,
      pdfFile: finalPdfFilename,
      docxUrl: finalDocxFilename ? `/analysis-files/${finalDocxFilename}` : null,
      pdfUrl: finalPdfFilename ? `/analysis-files/${finalPdfFilename}` : null,
    });
  } catch (err) {
    console.error("[saveWordAnalysis] Error:", err.message);
    return res.status(500).json({ message: "Gagal menyimpan dokumen analisis: " + err.message });
  }
};

/**
 * Controller: Unduh file DOCX
 * GET /api/analisis/word/:id/download/docx
 */
export const downloadAnalysisDocx = async (req, res) => {
  try {
    const { id } = req.params;
    const history = await AnalysisHistory.findById(id).lean();
    if (!history) {
      return res.status(404).json({ message: "Riwayat analisis tidak ditemukan" });
    }

    if (history.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const filename = history.docxFile || history.analysisFile;
    if (!filename) {
      return res.status(404).json({ message: "File DOCX tidak ditemukan untuk riwayat ini" });
    }

    const filePath = path.join(EXPORT_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Berkas fisik DOCX tidak ditemukan di server" });
    }

    await logActivity(req.user._id, `Mengunduh berkas Word DOCX untuk: ${history.title}`);
    const downloadName = `${sanitizeName(history.title)}.docx`;
    return res.download(filePath, downloadName);
  } catch (err) {
    console.error("[downloadAnalysisDocx] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};

/**
 * Controller: Unduh file PDF
 * GET /api/analisis/word/:id/download/pdf
 */
export const downloadAnalysisPdf = async (req, res) => {
  try {
    const { id } = req.params;
    const history = await AnalysisHistory.findById(id).lean();
    if (!history) {
      return res.status(404).json({ message: "Riwayat analisis tidak ditemukan" });
    }

    if (history.userId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Akses ditolak" });
    }

    const filename = history.pdfFile || (history.docxFile ? history.docxFile.replace(/\.docx$/, ".pdf") : "");
    if (!filename) {
      return res.status(404).json({ message: "File PDF tidak ditemukan untuk riwayat ini" });
    }

    const filePath = path.join(EXPORT_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Berkas fisik PDF tidak ditemukan di server" });
    }

    await logActivity(req.user._id, `Mengunduh berkas PDF untuk: ${history.title}`);
    const downloadName = `${sanitizeName(history.title)}.pdf`;
    return res.download(filePath, downloadName);
  } catch (err) {
    console.error("[downloadAnalysisPdf] Error:", err.message);
    return res.status(500).json({ message: err.message });
  }
};
