import ExcelJS from "exceljs";

export async function exportScheduleExcel(title: string, rows: Array<[string, string, string]>) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Monatsübersicht");
  sheet.addRow([title]);
  sheet.addRow(["Datum", "Schicht", "Mitarbeiter"]);
  rows.forEach((row) => sheet.addRow(row));

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "dienstplan.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}
