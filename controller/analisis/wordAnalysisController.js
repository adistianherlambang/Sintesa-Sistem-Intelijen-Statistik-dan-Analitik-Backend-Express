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
import { generateForecastNarasiWithLLM } from "./narasiKelompokController.js";

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
 * Helper: Cari posisi awal tag XML pembuka secara presisi (contoh: <w:p> atau <w:p ...>)
 */
export function findLastTagStart(str, tagName, beforePos) {
  for (let i = beforePos; i >= 0; i--) {
    if (str.startsWith(`<${tagName} `, i) || str.startsWith(`<${tagName}>`, i)) {
      return i;
    }
  }
  return -1;
}

/**
 * Helper: Cari posisi akhir tag XML penutup secara presisi (contoh: </w:p>)
 */
export function findNextTagEnd(str, tagName, fromPos) {
  const closingTag = `</${tagName}>`;
  const idx = str.indexOf(closingTag, fromPos);
  return idx !== -1 ? idx + closingTag.length : -1;
}

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
 * Helper: Parse template style string for Word OpenXML
 * Contoh: "bg color #FEE3CE width 100% font size 18"
 */
export function parseWordStyle(styleStr, defaultPt = 10, defaultTextHex = "1E293B") {
  const str = String(styleStr || "");
  let fontSizePt = defaultPt;
  let bgFill = "FEE3CE";
  let textColor = defaultTextHex;

  const fontMatch = str.match(/font\s*size\s*(\d+)/i);
  if (fontMatch) {
    fontSizePt = parseInt(fontMatch[1], 10);
  }

  const bgMatch = str.match(/bg\s*color\s*#?([0-9a-fA-F]{6})/i) || str.match(/bgcolor\s*#?([0-9a-fA-F]{6})/i);
  if (bgMatch) {
    bgFill = bgMatch[1].toUpperCase();
  }

  const colorMatch = str.match(/(?:^|\s)color\s*#?([0-9a-fA-F]{6})/i);
  if (colorMatch) {
    textColor = colorMatch[1].toUpperCase();
  }

  return {
    fontSizePt,
    fontSizeHalfPt: fontSizePt * 2, // OpenXML Word menggunakan half-points (1 pt = 2 half-points)
    bgFill,
    textColor
  };
}

export const INDICATOR_BANNER_TITLES = {
  "komoditas": null,
  "pdrb-pengeluaran-adhk": "Perkembangan Produk Domestik Regional Bruto (PDRB) Pengeluaran ADHK",
  "pdrb-pengeluaran-adhb": "Perkembangan Produk Domestik Regional Bruto (PDRB) Pengeluaran ADHB",
  "pdrb-lapangan-usaha-adhk": "Perkembangan PDRB Menurut Lapangan Usaha ADHK",
  "pdrb-lapangan-usaha-adhb": "Perkembangan PDRB Menurut Lapangan Usaha ADHB",
  "demografi-penduduk": "Perkembangan Profil dan Distribusi Penduduk",
  "demografi-laki": "Perkembangan Jumlah Penduduk Laki-Laki",
  "demografi-perempuan": "Perkembangan Jumlah Penduduk Perempuan",
  "demografi-kemiskinan": "Perkembangan Profil dan Indikator Kemiskinan"
};

/**
 * Generate XML Cover Summary dari template summary indikator aktif
 */
export function buildSummaryWordXml(summaryText, varMap = {}) {
  const rendered = renderTemplateObject(summaryText || "", varMap);
  const paragraphs = rendered.split("\n").map(p => p.trim()).filter(Boolean);
  let xml = "";
  for (const p of paragraphs) {
    xml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="284" w:hanging="284"/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/></w:rPr><w:t>${escapeXml(p)}</w:t></w:r></w:p>`;
  }
  return xml;
}

/**
 * Generate XML Content 0 & Content 1 Word dinamis murni dari skema template indikator aktif
 */
export function buildContent0And1WordXml(templateConfig, renderedConfig, varMap = {}) {
  const content0 = templateConfig?.content?.[0] || {};
  const content1 = templateConfig?.content?.[1] || {};
  const rendered0 = renderedConfig?.content?.[0] || content0;
  const rendered1 = renderedConfig?.content?.[1] || content1;

  const style0 = parseWordStyle(content0.title?.style, 14, "1E3A8A");
  const title0Color = (templateConfig?.content?.[0]?.desc?.find(d => d.table)?.table?.style?.header?.backgroundColor || style0.textColor).replace("#", "");

  let xml = "";

  // 1. Content 0 Title
  const title0Text = renderTemplateObject(content0.title?.desc || "Indikator Utama", varMap);
  xml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="left"/><w:spacing w:before="180" w:after="80" w:line="260" w:lineRule="auto"/><w:keepNext/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="${Math.max(style0.fontSizeHalfPt, 28)}"/><w:szCs w:val="${Math.max(style0.fontSizeHalfPt, 28)}"/><w:color w:val="${title0Color}"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="${Math.max(style0.fontSizeHalfPt, 28)}"/><w:szCs w:val="${Math.max(style0.fontSizeHalfPt, 28)}"/><w:color w:val="${title0Color}"/></w:rPr><w:t>${escapeXml(title0Text)}</w:t></w:r></w:p>`;

  // 2. Content 0 Intro paragraphs & Table 1
  const desc0Items = rendered0.desc || content0.desc || [];
  for (const item of desc0Items) {
    if (item.desc) {
      const renderedDesc = renderTemplateObject(item.desc, varMap);
      const paragraphs = renderedDesc.split("\n").map(l => l.trim()).filter(Boolean);
      for (const p of paragraphs) {
        xml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="both"/><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="1E293B"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="1E293B"/></w:rPr><w:t>${escapeXml(p)}</w:t></w:r></w:p>`;
      }
    } else if (item.table) {
      const tblConfig = item.table;
      const renderedTblJudul = renderTemplateObject(tblConfig.judul, varMap);
      if (renderedTblJudul) {
        xml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="left"/><w:spacing w:before="140" w:after="60" w:line="260" w:lineRule="auto"/><w:keepNext/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="1E293B"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="1E293B"/></w:rPr><w:t>${escapeXml(renderedTblJudul)}</w:t></w:r></w:p>`;
      }
      xml += buildTableWordXmlFromMarkdown(tblConfig, varMap, 9638);
      const renderedFootnote = renderTemplateObject(tblConfig.footnote?.text || "", varMap);
      if (renderedFootnote) {
        xml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:spacing w:before="60" w:after="80" w:line="220" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="14"/><w:szCs w:val="14"/><w:color w:val="64748B"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="14"/><w:szCs w:val="14"/><w:color w:val="64748B"/></w:rPr><w:t>${escapeXml(renderedFootnote)}</w:t></w:r></w:p>`;
      }
    }
  }

  // 3. Content 0 Sub-groups
  const subItems = rendered0.sub || content0.sub || [];
  for (const sub of subItems) {
    const subTitle = renderTemplateObject(sub.title?.desc || "", varMap);
    if (subTitle) {
      xml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="left"/><w:spacing w:before="120" w:after="40" w:line="240" w:lineRule="auto"/><w:keepNext/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="${title0Color}"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="${title0Color}"/></w:rPr><w:t>${escapeXml(subTitle)}</w:t></w:r></w:p>`;
    }
    const subDesc = renderTemplateObject(sub.desc || "", varMap);
    const paragraphs = subDesc.split("\n").map(l => l.trim()).filter(Boolean);
    for (const p of paragraphs) {
      xml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="both"/><w:spacing w:before="40" w:after="80" w:line="240" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="1E293B"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="1E293B"/></w:rPr><w:t>${escapeXml(p)}</w:t></w:r></w:p>`;
    }
  }

  // 4. Content 1 Title
  const style1 = parseWordStyle(content1.title?.style, 14, title0Color);
  const title1Text = renderTemplateObject(content1.title?.desc || "", varMap);
  if (title1Text) {
    xml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="left"/><w:spacing w:before="180" w:after="80" w:line="260" w:lineRule="auto"/><w:keepNext/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="${Math.max(style1.fontSizeHalfPt, 28)}"/><w:szCs w:val="${Math.max(style1.fontSizeHalfPt, 28)}"/><w:color w:val="${title0Color}"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="${Math.max(style1.fontSizeHalfPt, 28)}"/><w:szCs w:val="${Math.max(style1.fontSizeHalfPt, 28)}"/><w:color w:val="${title0Color}"/></w:rPr><w:t>${escapeXml(title1Text)}</w:t></w:r></w:p>`;
  }

  // 5. Content 1 Intro paragraphs & Table 2
  const desc1Items = rendered1.desc || content1.desc || [];
  for (const item of desc1Items) {
    if (item.desc) {
      const renderedDesc = renderTemplateObject(item.desc, varMap);
      const paragraphs = renderedDesc.split("\n").map(l => l.trim()).filter(Boolean);
      for (const p of paragraphs) {
        xml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="both"/><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="1E293B"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:color w:val="1E293B"/></w:rPr><w:t>${escapeXml(p)}</w:t></w:r></w:p>`;
      }
    } else if (item.table) {
      const tblConfig = item.table;
      const renderedTblJudul = renderTemplateObject(tblConfig.judul, varMap);
      if (renderedTblJudul) {
        xml += `<w:p><w:pPr><w:pStyle w:val="p1"/><w:jc w:val="left"/><w:spacing w:before="140" w:after="60" w:line="260" w:lineRule="auto"/><w:keepNext/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="1E293B"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="18"/><w:szCs w:val="18"/><w:color w:val="1E293B"/></w:rPr><w:t>${escapeXml(renderedTblJudul)}</w:t></w:r></w:p>`;
      }
      xml += buildTableWordXmlFromMarkdown(tblConfig, varMap, 9638);
    }
  }

  return xml;
}

/**
 * Generate XML Section 2 dinamis langsung dari inflasiIHK.json (content[2])
 */
export function buildSection2WordXmlFromTemplate(section2Config, varMap = {}) {
  if (!section2Config) return "";

  const col0 = section2Config.column?.[0] || {};
  const col1 = section2Config.column?.[1] || {};

  // Parse styling dari template JSON: "bg color #FEE3CE width 100% font size 18" -> 18pt = 36 half-points
  const col0Style = parseWordStyle(col0.title?.style, 18);
  const col1Style = parseWordStyle(col1.title?.style, 18);

  const col0Title = renderTemplateObject(col0.title?.desc || "Penjelasan Teknis", varMap);
  const col0Desc = renderTemplateObject(col0.desc || "", varMap);
  const col0Paragraphs = col0Desc.split("\n").map(l => l.trim()).filter(Boolean);

  const col1Title = renderTemplateObject(col1.title?.desc || "Perubahan Tahun Dasar", varMap);
  const col1Desc = renderTemplateObject(col1.desc || "", varMap);
  const col1Paragraphs = col1Desc.split("\n").map(l => l.trim()).filter(Boolean);

  const table3Config = col1.table;
  const table3Title = renderTemplateObject(table3Config?.judul || "Tabel 3", varMap);
  const table3Xml = buildTableWordXmlFromMarkdown(table3Config, varMap, 4600);

  // Font size default 10 pt = 20 half-points jika tidak diberikan styling
  const defaultBodyHalfPt = 20;

  let xml = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' +
    '<w:tbl>' +
    '<w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>' +
    '<w:tr>' +
    // Left Column
    '<w:tc>' +
    '<w:tcPr><w:tcW w:w="4600" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>' +
    `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${col0Style.bgFill}"/><w:spacing w:before="80" w:after="80"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="${col0Style.fontSizeHalfPt}"/><w:szCs w:val="${col0Style.fontSizeHalfPt}"/><w:color w:val="1E293B"/></w:rPr><w:t>  ` + escapeXml(col0Title) + `</w:t></w:r></w:p>`;

  for (const p of col0Paragraphs) {
    xml += `<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="${defaultBodyHalfPt}"/><w:szCs w:val="${defaultBodyHalfPt}"/><w:color w:val="334155"/></w:rPr><w:t>` + escapeXml(p) + `</w:t></w:r></w:p>`;
  }

  xml += '</w:tc>' +
    '<w:tc><w:tcPr><w:tcW w:w="400" w:type="dxa"/></w:tcPr><w:p/></w:tc>' +
    // Right Column
    '<w:tc>' +
    '<w:tcPr><w:tcW w:w="4600" w:type="dxa"/><w:vAlign w:val="top"/></w:tcPr>' +
    `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${col1Style.bgFill}"/><w:spacing w:before="80" w:after="80"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="${col1Style.fontSizeHalfPt}"/><w:szCs w:val="${col1Style.fontSizeHalfPt}"/><w:color w:val="1E293B"/></w:rPr><w:t>  ` + escapeXml(col1Title) + `</w:t></w:r></w:p>`;

  for (const p of col1Paragraphs) {
    xml += `<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="60" w:after="60" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="${defaultBodyHalfPt}"/><w:szCs w:val="${defaultBodyHalfPt}"/><w:color w:val="334155"/></w:rPr><w:t>` + escapeXml(p) + `</w:t></w:r></w:p>`;
  }

  if (table3Title) {
    xml += `<w:p><w:pPr><w:spacing w:before="80" w:after="40"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="${defaultBodyHalfPt}"/><w:szCs w:val="${defaultBodyHalfPt}"/><w:color w:val="1E293B"/></w:rPr><w:t>` + escapeXml(table3Title) + `</w:t></w:r></w:p>`;
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
 * Generate XML Section Forecast/Proyeksi Word dinamis langsung dari inflasiIHK.json
 */
export function buildForecastWordXmlFromTemplate(forecastConfig, varMap = {}) {
  if (!forecastConfig) return "";

  const titleConfig = forecastConfig.title || {};
  const style = parseWordStyle(titleConfig.style, 18);
  const titleText = renderTemplateObject(titleConfig.desc || "Proyeksi dan Prakiraan Inflasi", varMap);
  const descText = renderTemplateObject(forecastConfig.desc || varMap["narasiForecast"] || "", varMap);
  const paragraphs = descText.split("\n").map(l => l.trim()).filter(Boolean);
  const defaultBodyHalfPt = 20; // font 10 pt = 20 half-points

  let xml = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  xml += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="${style.bgFill}"/><w:spacing w:before="120" w:after="80"/><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="${style.fontSizeHalfPt}"/><w:szCs w:val="${style.fontSizeHalfPt}"/><w:color w:val="1E293B"/></w:rPr><w:t>  ` + escapeXml(titleText) + `</w:t></w:r></w:p>`;

  for (const p of paragraphs) {
    xml += `<w:p><w:pPr><w:jc w:val="both"/><w:spacing w:before="60" w:after="80" w:line="240" w:lineRule="auto"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:sz w:val="${defaultBodyHalfPt}"/><w:szCs w:val="${defaultBodyHalfPt}"/><w:color w:val="334155"/></w:rPr><w:t>` + escapeXml(p) + `</w:t></w:r></w:p>`;
  }

  // Render tabel data forecast langsung dari tampilan/model forecast (bukan dari LLM)
  const forecastTableConfig = forecastConfig.table;
  if (forecastTableConfig) {
    const tableTitle = renderTemplateObject(forecastTableConfig.judul || "Tabel Proyeksi Tingkat Inflasi", varMap);
    if (tableTitle) {
      xml += `<w:p><w:pPr><w:spacing w:before="120" w:after="60"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/><w:b/><w:bCs/><w:sz w:val="${defaultBodyHalfPt}"/><w:szCs w:val="${defaultBodyHalfPt}"/><w:color w:val="1E293B"/></w:rPr><w:t>` + escapeXml(tableTitle) + `</w:t></w:r></w:p>`;
    }
    const tableXml = buildTableWordXmlFromMarkdown(forecastTableConfig, varMap, 9638);
    if (tableXml) {
      xml += tableXml;
    }
  }

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
    const activeIndicator = req.body?.indicator || req.body?.selectedIndicator || activeDataset?.context?.indicator || activeDataset?.context?.selectedIndicator || activeDataset?.fileInfo?.selectedIndicator || "komoditas";
    const varMap = buildVariableMapFromDataset(activeDataset, variables);

    // Evaluasi apakah forecast ON atau OFF
    const isForecastOn = req.body?.forecastEnabled === true || 
                         req.body?.isForecastOn === true ||
                         req.body?.forecastingEnabled === true ||
                         activeDataset?.context?.forecastingEnabled === true ||
                         activeDataset?.context?.isForecastOn === true ||
                         activeDataset?.editedData?.forecastingEnabled === true ||
                         (req.body?.forecastEnabled !== false && 
                          req.body?.forecastingEnabled !== false &&
                          activeDataset?.context?.forecastingEnabled !== false && 
                          activeDataset?.editedData?.forecastingEnabled !== false && 
                          Boolean(activeDataset?.editedData?.forecast || activeDataset?.forecast));

    // Jika forecast ON dan narasi belum disediakan khusus oleh user, generate via LLM
    if (isForecastOn && !variables?.narasiForecast && !variables?.["narasiForecastManual"]) {
      try {
        const forecastData = activeDataset?.editedData?.forecast || activeDataset?.forecast || null;
        const llmNarrative = await generateForecastNarasiWithLLM({
          city: varMap["namaKota"] || city,
          period: varMap["bulanTahun"] || periode,
          forecastData,
          varMap,
        });
        if (llmNarrative) {
          varMap["narasiForecast"] = llmNarrative;
        }
      } catch (err) {
        console.warn("[generateWordBrs] Warning generating forecast narrative with LLM:", err.message);
      }
    }

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
          // 1. Ekstrak blok kontak resmi dari template base sebagai tabel mandiri pada halaman terakhir
          const contactMarker = "Konten Berita Resmi Statistik dilindungi oleh Undang-Undang";
          let standaloneContactXml = "";
          if (xmlContent.includes(contactMarker)) {
            const contactMarkerPos = xmlContent.indexOf(contactMarker);
            const contactGridIdx = xmlContent.lastIndexOf("<w:tblGrid", contactMarkerPos);
            const contactTblEnd = xmlContent.indexOf("</w:tbl>", contactMarkerPos) + 8;
            const lastSectPr = xmlContent.lastIndexOf("<w:sectPr");
            if (contactGridIdx !== -1 && contactTblEnd !== -1 && lastSectPr !== -1 && lastSectPr > contactTblEnd) {
              const contactTableInside = xmlContent.substring(contactGridIdx, contactTblEnd - 8);
              const afterContactTable = xmlContent.substring(contactTblEnd, lastSectPr);
              standaloneContactXml = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
                `<w:tbl><w:tblPr><w:tblW w:w="8073" w:type="dxa"/><w:tblBorders><w:top w:val="none"/><w:left w:val="none"/><w:bottom w:val="none"/><w:right w:val="none"/><w:insideH w:val="none"/><w:insideV w:val="none"/></w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr>` +
                contactTableInside +
                `</w:tbl>` +
                afterContactTable;
            }
          }

          // 2. Cover Banner & Cover Summary: Jangan biarkan teks inflasi bocor ke indikator lain!
          if (activeIndicator !== "komoditas") {
            const bannerTitleBase = INDICATOR_BANNER_TITLES[activeIndicator] || freshTemplate?.content?.[0]?.title?.desc || "Laporan BRS";
            const bannerTitle = `${bannerTitleBase} ${varMap["namaKota"] || "Kota Metro"} Tahun ${varMap["tahun"] || ""}`;
            const idxCoverBanner = xmlContent.indexOf("inflasi Year-on-Year");
            if (idxCoverBanner !== -1) {
              const pBannerStart = findLastTagStart(xmlContent, "w:p", idxCoverBanner);
              const pBannerEnd = findNextTagEnd(xmlContent, "w:p", idxCoverBanner);
              if (pBannerStart !== -1 && pBannerEnd !== -1) {
                const newBannerP = `<w:p><w:pPr><w:pStyle w:val="p1"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr><w:ind w:left="1560" w:hanging="284"/><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Raleway" w:hAnsi="Raleway"/></w:rPr><w:t>${escapeXml(bannerTitle)}</w:t></w:r></w:p>`;
                xmlContent = xmlContent.slice(0, pBannerStart) + newBannerP + xmlContent.slice(pBannerEnd);
              }
            }

            const idxCoverSummary = xmlContent.indexOf("Pada ${bulan} ${tahun} terjadi inflasi");
            if (idxCoverSummary !== -1) {
              const pSummStart = findLastTagStart(xmlContent, "w:p", idxCoverSummary);
              const nextSectPr = xmlContent.indexOf("<w:sectPr", pSummStart);
              const pSectPrStart = findLastTagStart(xmlContent, "w:p", nextSectPr);
              if (pSummStart !== -1 && pSectPrStart !== -1) {
                const newSummXml = buildSummaryWordXml(freshTemplate?.summary, varMap);
                xmlContent = xmlContent.slice(0, pSummStart) + newSummXml + xmlContent.slice(pSectPrStart);
              }
            }
          }

          // 3. Rekonstruksi Dokumen Bagian Tengah (${content}) Mengikuti Skema Indikator Terpilih
          const idxTitle0 = xmlContent.indexOf("Indeks Harga Konsumen/Inflasi Menurut Kelompok");
          const pTitle0Start = idxTitle0 !== -1 ? findLastTagStart(xmlContent, "w:p", idxTitle0) : -1;
          const lastSectPr = xmlContent.lastIndexOf("<w:sectPr");

          if (pTitle0Start !== -1 && lastSectPr !== -1 && lastSectPr > pTitle0Start) {
            // A. Content 0 (Tabel 1, intro, sub-kelompok) & Content 1 (Tabel 2, intro) murni dari template indikator aktif
            const content0And1Xml = buildContent0And1WordXml(freshTemplate, rendered, varMap);

            // B. Chart BRS (hanya jika didefinisikan dalam template indikator aktif)
            const hasChartConfig = freshTemplate?.content?.some(c => c.img?.id === "Chart BRS" || c.img?.id?.toLowerCase()?.includes("chart"));
            const chartBrsXml = (chartBrsBuffer && hasChartConfig)
              ? buildInlineImageWordXml("rIdChartBrs", "Chart BRS", 5715000, 3160687, 999902)
              : "";
            const nextSectionBreakXml = `<w:p><w:pPr><w:pStyle w:val="p1"/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="816" w:left="1134" w:header="709" w:footer="709" w:gutter="0"/><w:cols w:space="708"/><w:docGrid w:linePitch="360"/></w:sectPr></w:pPr></w:p>`;

            // C. Penjelasan Teknis & Perubahan Tahun Dasar / Sumber Data
            const sec2Config = freshTemplate?.content?.find(c => c.column);
            const sec2Xml = buildSection2WordXmlFromTemplate(sec2Config, varMap);

            // D. Forecast (jika aktif)
            let forecastXml = "";
            if (isForecastOn) {
              const forecastConfig = freshTemplate?.content?.find(c => c.forecast || c.type === 'forecast' || (c.title?.desc && /proyeksi|forecast/i.test(c.title.desc)))?.forecast ||
                                     freshTemplate?.content?.find(c => c.forecast || c.type === 'forecast' || (c.title?.desc && /proyeksi|forecast/i.test(c.title.desc)));
              if (forecastConfig) {
                forecastXml = buildForecastWordXmlFromTemplate(forecastConfig, varMap);
              }
            }

            // E. Infografis (hanya jika didefinisikan dalam template indikator aktif)
            const hasInfografisConfig = freshTemplate?.content?.some(c => c.img?.id === "Infografis" || c.img?.id?.toLowerCase()?.includes("infografis"));
            const infografisXml = (infografisBuffer && hasInfografisConfig)
              ? `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
                buildInlineImageWordXml("rIdInfografis", "Infografis", 5715000, 8096250, 999901)
              : "";

            // F. Satukan seluruh dokumen dengan susunan yang bersih dan terstruktur rapi:
            xmlContent = xmlContent.slice(0, pTitle0Start) +
              content0And1Xml +
              chartBrsXml +
              nextSectionBreakXml +
              sec2Xml +
              forecastXml +
              infografisXml +
              standaloneContactXml +
              xmlContent.slice(lastSectPr);
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
      fullUrl: `${req.protocol || "http"}://${(req.get ? req.get("host") : null) || "localhost:5000"}/analysis-files/${outFilename}`,
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
