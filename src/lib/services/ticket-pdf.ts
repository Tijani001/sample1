import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { BookingView } from "./bookings";
import { qrPng } from "./tickets";
import { formatDate, formatTime, formatDuration } from "@/lib/domain/time";

const NAVY = rgb(0x17 / 255, 0x43 / 255, 0x63 / 255);
const CORAL = rgb(1, 0x63 / 255, 0x47 / 255);
const INK = rgb(0x10 / 255, 0x2a / 255, 0x43 / 255);
const MUTED = rgb(0x64 / 255, 0x74 / 255, 0x8b / 255);
const LINE = rgb(0xe2 / 255, 0xe8 / 255, 0xf0 / 255);
const naira = (k: number) => `NGN ${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;

/** Boarding-pass style PDF: one page per passenger per journey. Uses ASCII-safe text for standard fonts. */
export async function renderTicketsPdf(b: NonNullable<BookingView>, opts: { sandbox: boolean }) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Goroada tickets ${b.reference}`);
  pdf.setAuthor("Goroada");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const seg of b.segments) {
    for (const tk of seg.tickets) {
      const p = b.passengers.find((x) => x.seq === tk.passenger_seq)!;
      const seat = seg.seats.find((s) => s.passengerSeq === tk.passenger_seq)?.seatNo;
      const page = pdf.addPage([420, 640]);
      const { width, height } = page.getSize();
      page.drawRectangle({ x: 0, y: height - 86, width, height: 86, color: NAVY });
      // Brand mark (pin above road), drawn as vectors
      page.drawSvgPath("M13 63 27.6 35.5h8.8L51 63Z", { x: 24, y: height - 14, scale: 0.9, color: rgb(1, 1, 1) });
      page.drawSvgPath("M32 33.5s-12.5-11.6-12.5-19a12.5 12.5 0 0 1 25 0c0 7.4-12.5 19-12.5 19Z", { x: 24, y: height - 14, scale: 0.9, color: CORAL });
      page.drawText("goroada", { x: 84, y: height - 52, size: 24, font: bold, color: rgb(1, 1, 1) });
      page.drawText("BOARDING PASS", { x: width - 140, y: height - 40, size: 10, font: bold, color: rgb(1, 1, 1) });
      page.drawText(seg.direction === "outbound" ? "OUTBOUND" : "RETURN", { x: width - 140, y: height - 56, size: 9, font, color: rgb(0.85, 0.9, 0.95) });
      let y = height - 130;
      const t = seg.trip;
      page.drawText(t.origin.cityName, { x: 28, y, size: 22, font: bold, color: INK });
      const tw = bold.widthOfTextAtSize(t.destination.cityName, 22);
      page.drawText(t.destination.cityName, { x: width - 28 - tw, y, size: 22, font: bold, color: INK });
      page.drawLine({ start: { x: 28 + bold.widthOfTextAtSize(t.origin.cityName, 22) + 12, y: y + 8 }, end: { x: width - 40 - tw, y: y + 8 }, thickness: 1, color: LINE, dashArray: [3, 3] });
      y -= 22;
      page.drawText(t.origin.terminalName, { x: 28, y, size: 10, font, color: MUTED });
      const dtw = font.widthOfTextAtSize(t.destination.terminalName, 10);
      page.drawText(t.destination.terminalName, { x: width - 28 - dtw, y, size: 10, font, color: MUTED });
      y -= 44;
      const cell = (label: string, value: string, x: number, yy: number) => {
        page.drawText(label.toUpperCase(), { x, y: yy, size: 8, font, color: MUTED });
        page.drawText(value, { x, y: yy - 17, size: 13, font: bold, color: INK });
      };
      cell("Passenger", p.fullName, 28, y);
      cell("Seat", t.seatingMode === "open" ? "At boarding" : seat ?? "-", 300, y);
      y -= 48;
      cell("Date", formatDate(t.departureAt, t.tz, "weekday"), 28, y);
      cell("Departs", formatTime(t.departureAt, t.tz), 160, y);
      cell("Arrives (est.)", formatTime(t.arrivalEstAt, t.tz), 300, y);
      y -= 48;
      cell("Operator", t.operator.name, 28, y);
      cell("Vehicle", t.vehicle.typeName, 220, y);
      y -= 48;
      cell("Booking ref", b.reference, 28, y);
      cell("Ticket", tk.ticket_no, 220, y);
      y -= 30;
      page.drawLine({ start: { x: 20, y }, end: { x: width - 20, y }, thickness: 1, color: LINE, dashArray: [4, 4] });
      const png = await pdf.embedPng(await qrPng(tk.verification_token));
      page.drawImage(png, { x: 28, y: y - 170, width: 150, height: 150 });
      const notes = [
        "Show this QR code at the operator desk.",
        "Arrive 45 minutes before departure.",
        "Bring a valid photo ID matching the name.",
        `Journey time about ${formatDuration(t.durationMin)}.`,
        `${t.policy.name} fare: ${t.policy.summary}`.slice(0, 120),
      ];
      let ny = y - 30;
      for (const n of notes) {
        const words = n.split(" ");
        let line = "";
        for (const w of words) {
          if (font.widthOfTextAtSize(`${line} ${w}`, 9.5) > 190) {
            page.drawText(line.trim(), { x: 196, y: ny, size: 9.5, font, color: INK });
            ny -= 13;
            line = "";
          }
          line += ` ${w}`;
        }
        page.drawText(line.trim(), { x: 196, y: ny, size: 9.5, font, color: INK });
        ny -= 18;
      }
      page.drawText(`Total paid for booking: ${naira(b.amounts.total)}${opts.sandbox ? " (sandbox - not a real payment)" : ""}`, { x: 28, y: 52, size: 8.5, font, color: MUTED });
      page.drawText("Arrival times are estimates. Goroada is a booking platform; the journey is operated by the operator named above.", { x: 28, y: 38, size: 7, font, color: MUTED });
      if (t.operator.isDemo || opts.sandbox) page.drawText("DEMONSTRATION TICKET - NOT VALID FOR TRAVEL", { x: 28, y: 22, size: 8, font: bold, color: CORAL });
    }
  }
  return pdf.save();
}

export function renderIcs(b: NonNullable<BookingView>) {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[,;\\]/g, (m) => `\\${m}`).replace(/\n/g, "\\n");
  const events = b.segments.map((s) => [
    "BEGIN:VEVENT",
    `UID:${b.reference}-${s.direction}@goroada.app`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(s.trip.departureAt)}`,
    `DTEND:${fmt(s.trip.arrivalEstAt)}`,
    `SUMMARY:${esc(`${s.trip.origin.cityName} → ${s.trip.destination.cityName} · ${s.trip.operator.name}`)}`,
    `LOCATION:${esc(`${s.trip.origin.terminalName}, ${s.trip.origin.address}`)}`,
    `DESCRIPTION:${esc(`Goroada booking ${b.reference}. Seats: ${s.seats.map((x) => x.seatNo).join(", ") || "assigned at boarding"}. Arrive 45 minutes early. Arrival time is an estimate.`)}`,
    "BEGIN:VALARM", "TRIGGER:-PT3H", "ACTION:DISPLAY", "DESCRIPTION:Leave for the terminal", "END:VALARM",
    "END:VEVENT",
  ].join("\r\n"));
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Goroada//Trips//EN", "CALSCALE:GREGORIAN", ...events, "END:VCALENDAR"].join("\r\n");
}
