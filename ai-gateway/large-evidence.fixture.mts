/** Synthetic maximum-sized evidence, never real case material or provider calls. */
export function largeEvidenceSources() {
  return Array.from({ length: 1_000 }, (_, index) => {
    const versionId = `00000000-0000-4000-8000-${String(Math.floor(index / 40) + 1).padStart(12, '0')}`;
    return {
      id: `document:${versionId}:${index % 40 + 1}`,
      title: 'Syntetisk leverandørdokumentation med produktbeskrivelse, databehandleraftale og revision',
      text: `Afsnit ${index + 1}: Dansk æøå, Unicode 😃 og JSON "citat"\\sti\n`.padEnd(500, 'x'),
      locator: `Afsnit ${index % 40 + 1}`, version: '1', checksum: 'a'.repeat(64),
      document_version_id: versionId,
      source_url: 'https://supplier.example/security/documents/synthetic-auditor-report.pdf',
    };
  });
}
