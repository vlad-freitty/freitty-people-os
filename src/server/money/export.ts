import ExcelJS from "exceljs";

type Cell = string | number;

/** CSV with a BOM so Excel opens Cyrillic names correctly. */
export function toCsv(header: string[], rows: Cell[][]): string {
  const esc = (v: Cell) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [header, ...rows].map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export async function toXlsx(sheetName: string, header: string[], rows: Cell[][]): Promise<Buffer> {
  const book = new ExcelJS.Workbook();
  book.creator = "People OS";
  const sheet = book.addWorksheet(sheetName.slice(0, 31));
  sheet.addRow(header).font = { bold: true };
  for (const r of rows) sheet.addRow(r);
  sheet.columns.forEach((c) => (c.width = 16));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return Buffer.from(await book.xlsx.writeBuffer());
}
