// Generates data/contracts/sample-msa.pdf (synthetic; deliberately contains playbook deviations).
import PDFDocument from "pdfkit";
import fs from "node:fs";
import path from "node:path";

const clauses: [string, string][] = [
  ["1. Definitions", ""],
  ["1.1", "\"Services\" means the software development and support services described in each Statement of Work."],
  ["1.2", "\"Fees\" means the fees payable by the Customer to the Supplier as set out in each Statement of Work."],
  ["2. Services", ""],
  ["2.1", "The Supplier shall provide the Services with reasonable skill and care and in accordance with each Statement of Work."],
  ["2.2", "The Supplier may subcontract any part of the Services to third parties without the consent of the Customer."],
  ["3. Fees and Payment", ""],
  ["3.1", "The Customer shall pay each invoice within ninety (90) days of the date of receipt of the invoice."],
  ["3.2", "Late payments shall accrue interest at a rate of 8% per month until paid in full."],
  ["4. Intellectual Property", ""],
  ["4.1", "All intellectual property rights in the deliverables, including any work created by the Supplier for the Customer, shall remain the exclusive property of the Supplier."],
  ["4.2", "The Customer grants the Supplier a perpetual, irrevocable, worldwide licence to use the Customer's data for any purpose."],
  ["5. Confidentiality", ""],
  ["5.1", "Each party shall keep the other party's Confidential Information confidential for a period of one (1) year from disclosure."],
  ["6. Data Protection", ""],
  ["6.1", "The Supplier may process personal data of the Customer in any country and shall notify the Customer of any data breach within thirty (30) days of discovery."],
  ["7. Indemnity", ""],
  ["7.1", "The Customer shall indemnify the Supplier against all losses, liabilities, damages and costs arising out of or in connection with this Agreement."],
  ["8. Limitation of Liability", ""],
  ["8.1", "The Supplier's liability under or in connection with this Agreement shall be unlimited in respect of the Customer's claims only where caused by gross negligence."],
  ["8.2", "The Customer's liability to the Supplier under this Agreement shall be unlimited."],
  ["8.3", "The Supplier shall not be liable for any loss of profit, loss of revenue or loss of data."],
  ["9. Term and Termination", ""],
  ["9.1", "This Agreement shall commence on the Effective Date and continue for an initial term of five (5) years, automatically renewing for successive five-year terms unless terminated on twelve (12) months' notice."],
  ["9.2", "The Supplier may terminate this Agreement for convenience on seven (7) days' notice. The Customer may not terminate for convenience."],
  ["10. General", ""],
  ["10.1", "This Agreement shall be governed by and construed in accordance with the laws of the State of Delaware, and the parties submit to the exclusive jurisdiction of its courts."],
  ["10.2", "This Agreement constitutes the entire agreement between the parties and supersedes all prior discussions."],
];

const out = path.join(process.cwd(), "data/contracts/sample-msa.pdf");
const doc = new PDFDocument({ size: "A4", margin: 60 });
doc.pipe(fs.createWriteStream(out));
doc.font("Helvetica-Bold").fontSize(16).text("MASTER SERVICES AGREEMENT", { align: "left" });
doc.moveDown();
doc.font("Helvetica").fontSize(10.5).text(
  "This Master Services Agreement is made between Northwind Software Ltd (the Supplier) and Contoso Holdings plc (the Customer) as of the Effective Date.",
);
doc.moveDown();
for (const [ref, body] of clauses) {
  if (!body) {
    doc.moveDown(0.5).font("Helvetica-Bold").fontSize(11).text(ref);
  } else {
    doc.font("Helvetica").fontSize(10.5).text(`${ref} ${body}`, { lineGap: 2 });
  }
  doc.moveDown(0.4);
}
doc.end();
console.log("wrote", out);
