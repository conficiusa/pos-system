import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const _ghsFormatter = new Intl.NumberFormat("en-GH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function fmtGHS(n: number): string {
  return "GHS " + _ghsFormatter.format(n)
}

export function exportXlsx(
  filename: string,
  sheetName: string,
  headers: string[],
  rows: (string | number | null | undefined)[][],
) {
  // Dynamic import keeps xlsx out of the initial bundle
  import("xlsx").then((XLSX) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])

    // Auto-fit column widths
    ws["!cols"] = headers.map((h, i) => ({
      wch: Math.min(
        Math.max(h.length, ...rows.map((r) => String(r[i] ?? "").length)) + 2,
        50,
      ),
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, `${filename}.xlsx`)
  })
}
