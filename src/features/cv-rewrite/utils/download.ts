/**
 * Trigger a browser download of a generated-file blob and hand back the object
 * URL so the success screen can offer a manual re-download link.
 *
 * Shared by the two CV wizards (results-screen rewrite and dashboard generate)
 * so the anchor-click dance lives in exactly one place. The caller owns the
 * returned URL's lifetime.
 */
export function triggerBrowserDownload(blob: Blob, fileName: string): string {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return url;
}
