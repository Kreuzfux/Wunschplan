import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export function exportSchedulePdf(title: string, rows: Array<[string, string, string]>) {
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(title, 14, 16);

  autoTable(doc, {
    startY: 24,
    head: [["Datum", "Schicht", "Mitarbeiter"]],
    body: rows,
  });

  doc.save("dienstplan.pdf");
}
