/** Offers `content` to the user as a downloaded file. */
export function downloadTextFile(fileName: string, content: string, mimeType: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    // The browser has started the download by now; release the in-memory blob.
    URL.revokeObjectURL(url);
}
