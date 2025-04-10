document.addEventListener('DOMContentLoaded', () => {
    const exportButton = document.getElementById('exportButton');
    const resultDiv = document.getElementById('result');
    const progressText = document.getElementById('progressText');

    exportButton.addEventListener('click', async () => {
        try {
            resultDiv.textContent = 'Starting process...';
            exportButton.disabled = true;
            progressText.textContent = '';
            
            const result = await window.electron.exportNotes();
            
            resultDiv.textContent = result.message;
            resultDiv.style.color = result.success ? 'green' : 'red';
        } catch (error) {
            resultDiv.textContent = `Error: ${error.message}`;
            resultDiv.style.color = 'red';
        } finally {
            exportButton.disabled = false;
        }
    });

    window.electron.onExportProgress((data) => {
        progressText.textContent = `Processing note ${data.notesProcessed} of ${data.totalNotes} (${data.progress}%)`;
    });
}); 