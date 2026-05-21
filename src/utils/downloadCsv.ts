/** Serialises a 2-D array to CSV and triggers a browser download. */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const escape = (v: string | number) => {
    const s = String(v ?? '');
    return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv  = rows.map(row => row.map(escape).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
