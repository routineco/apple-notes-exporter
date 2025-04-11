document.addEventListener('DOMContentLoaded', () => {
    const exportButton = document.getElementById('exportButton');
    const resultDiv = document.getElementById('result');
    const progressText = document.getElementById('progressText');
    let totalNotes = 0;
    let isExporting = false;

    exportButton.addEventListener('click', async () => {
        if (isExporting) {
            return;
        }

        try {
            isExporting = true;
            resultDiv.textContent = 'Starting export process...';
            exportButton.disabled = true;
            progressText.textContent = '';
            totalNotes = 0;
            
            const result = await window.electron.exportNotes();
            
            resultDiv.textContent = result.message;
            resultDiv.style.color = result.success ? 'green' : 'red';
        } catch (error) {
            resultDiv.textContent = `Error: ${error.message}`;
            resultDiv.style.color = 'red';
        } finally {
            isExporting = false;
            exportButton.disabled = false;
        }
    });

    window.electron.onExportProgress((data) => {
        if (data.totalNotes !== undefined) {
            totalNotes = data.totalNotes;
        }
        if (data.notesProcessed !== undefined) {
            const percent = totalNotes > 0 ? Math.round((data.notesProcessed / totalNotes) * 100) : 0;
            progressText.textContent = `Processing note ${data.notesProcessed} of ${totalNotes} (${percent}%)`;
        }
    });
}); 