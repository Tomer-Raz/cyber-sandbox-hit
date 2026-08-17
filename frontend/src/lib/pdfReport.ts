import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SCAN_TYPE_META, SEVERITY_META, SEVERITY_ORDER } from '@/lib/constants'
import { formatDateTime, riskBand } from '@/lib/format'
import type { ScanReport } from '@/types'

const MARGIN = 14

function severityRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Renders a scan report as a downloadable PDF, built from the same data shown on screen. */
export function buildReportPdf(report: ScanReport): jsPDF {
  const { scan, findings, ai, anomaly, events } = report
  const band = riskBand(scan.riskScore)
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = MARGIN

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text('Scan Report', MARGIN, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(90)
  doc.text(scan.name, MARGIN, y)
  doc.setTextColor(0)
  y += 10

  autoTable(doc, {
    startY: y,
    theme: 'plain',
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 9, cellPadding: 1 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 } },
    body: [
      ['Target', scan.target],
      ['Scan type', SCAN_TYPE_META[scan.scanType].label],
      ['Status', scan.status],
      ['Risk score', `${scan.riskScore} (${band.label})`],
      ['Requested by', scan.requestedBy],
      ['Region', scan.region],
      ['Created', formatDateTime(scan.createdAt)],
      ['Started', formatDateTime(scan.startedAt)],
      ['Completed', formatDateTime(scan.completedAt)],
    ],
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Severity breakdown', MARGIN, y)
  y += 6
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const counts = scan.counts
  const chip = (label: string, value: number, hex: string, x: number) => {
    doc.setFillColor(...severityRgb(hex))
    doc.circle(x + 1.5, y - 1, 1.5, 'F')
    doc.text(`${label}: ${value}`, x + 5, y)
  }
  const chipWidth = (pageWidth - MARGIN * 2) / 5
  SEVERITY_ORDER.forEach((sev, i) => {
    chip(SEVERITY_META[sev].label, counts[sev], SEVERITY_META[sev].hex, MARGIN + i * chipWidth)
  })
  y += 10

  if (anomaly.evaluated && anomaly.isAnomaly) {
    doc.setFillColor(255, 247, 230)
    doc.setDrawColor(250, 173, 20)
    const boxHeight = 14
    doc.rect(MARGIN, y, pageWidth - MARGIN * 2, boxHeight, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('Anomalous scan detected', MARGIN + 3, y + 5)
    doc.setFont('helvetica', 'normal')
    const top = [...anomaly.features].sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore))[0]
    const desc = `Deviates from ${anomaly.sampleSize} prior scans of this target (score ${anomaly.score.toFixed(1)} sigma). Most unusual: ${top?.name ?? 'n/a'}.`
    doc.text(doc.splitTextToSize(desc, pageWidth - MARGIN * 2 - 6), MARGIN + 3, y + 10)
    y += boxHeight + 8
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('AI analysis', MARGIN, y)
  y += 6
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(ai.headline, MARGIN, y)
  y += 5
  const summaryLines = doc.splitTextToSize(ai.summary, pageWidth - MARGIN * 2)
  doc.text(summaryLines, MARGIN, y)
  y += summaryLines.length * 4 + 2
  if (ai.topRisks.length > 0) {
    for (const risk of ai.topRisks) {
      const lines = doc.splitTextToSize(`- ${risk}`, pageWidth - MARGIN * 2 - 4)
      doc.text(lines, MARGIN + 2, y)
      y += lines.length * 4
    }
  }
  doc.setTextColor(120)
  doc.setFontSize(8)
  doc.text(`${ai.model} - ${Math.round(ai.confidence * 100)}% confidence`, MARGIN, y + 4)
  doc.setTextColor(0)
  y += 12

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(`Findings (${findings.length})`, MARGIN, y)
  y += 4

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [30, 41, 59] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 45 },
      2: { cellWidth: 14 },
      3: { cellWidth: 55 },
      4: { cellWidth: 'auto' },
    },
    head: [['Severity', 'Finding', 'CVSS', 'Endpoint', 'Recommendation']],
    body: findings
      .slice()
      .sort(
        (a, b) => SEVERITY_META[b.severity].rank - SEVERITY_META[a.severity].rank || b.cvss - a.cvss,
      )
      .map((f) => [
        SEVERITY_META[f.severity].label,
        `${f.name}${f.cveIds.length ? `\n${f.cveIds.join(', ')}` : ''}`,
        f.cvss.toFixed(1),
        `${f.method} ${f.endpoint}`,
        f.recommendation,
      ]),
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 0) {
        const label = String(data.cell.raw)
        const sev = SEVERITY_ORDER.find((s) => SEVERITY_META[s].label === label)
        if (sev) data.cell.styles.textColor = severityRgb(SEVERITY_META[sev].hex)
      }
    },
  })
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  if (events.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = MARGIN
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('Scan timeline', MARGIN, y)
    y += 4
    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      styles: { fontSize: 8, cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 32 } },
      body: events.map((ev) => [formatDateTime(ev.ts), ev.message]),
    })
  }

  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFontSize(7)
    doc.setTextColor(150)
    doc.text(
      `Generated ${new Date().toLocaleString()} - Scan ${scan.id} - Page ${p} of ${pageCount}`,
      MARGIN,
      doc.internal.pageSize.getHeight() - 6,
    )
    doc.setTextColor(0)
  }

  return doc
}
