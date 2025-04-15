document.addEventListener('DOMContentLoaded', () => {
    const chooseButton = document.getElementById('chooseButton');
    const exportButton = document.getElementById('exportButton');
    const progressText = document.getElementById('progressText');
    const result = document.getElementById('result');
    const notesHierarchy = document.getElementById('notesHierarchy');

    function formatHierarchy(hierarchy, indent = '') {
        let result = '';
        for (const item of hierarchy) {
            if (item.type === 'note') {
                result += `${indent}${item.name}\n`;
            } else {
                result += `${indent}${item.name}/\n`;
                if (item.children && item.children.length > 0) {
                    result += formatHierarchy(item.children, indent + '  ');
                }
            }
        }
        return result;
    }

    chooseButton.addEventListener('click', async () => {
        try {
            progressText.textContent = 'Fetching notes hierarchy...';
            const hierarchyJson = await window.electron.listNotes();
            const parsed = JSON.parse(hierarchyJson);
            
            if (parsed.error) {
                throw new Error(parsed.error);
            }
            
            notesHierarchy.textContent = formatHierarchy(parsed);
            progressText.textContent = 'Notes hierarchy loaded successfully';
        } catch (error) {
            progressText.textContent = `Error: ${error.message}`;
            notesHierarchy.textContent = '';
        }
    });

    exportButton.addEventListener('click', async () => {
        try {
            progressText.textContent = 'Starting export process...';
            const resultText = await window.electron.exportNotes();
            result.textContent = `Export complete. ${resultText} notes exported.`;
            progressText.textContent = '';
        } catch (error) {
            progressText.textContent = `Error: ${error.message}`;
            result.textContent = '';
        }
    });

    // Listen for export progress updates
    window.electron.onExportProgress((data) => {
        if (data.currentNote) {
            progressText.textContent = `Processing: ${data.currentNote}`;
        }
    });
}); 