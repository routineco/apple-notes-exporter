// IPC renderer setup
document.addEventListener('DOMContentLoaded', () => {
    // Handle external links
    document.addEventListener('click', (event) => {
        const link = event.target.closest('a');
        if (link && link.href.startsWith('http')) {
            event.preventDefault();
            window.electron.openExternal(link.href);
        }
    });

    // Screen management
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');
    }

    // Scan functionality
    document.getElementById('scanButton').addEventListener('click', async () => {
        const scanButton = document.getElementById('scanButton');
        const progressText = document.getElementById('progressText');
        
        scanButton.disabled = true;
        progressText.textContent = 'Scanning notes...';
        
        try {
            const result = await window.electron.scan();
            showScreen('select-screen');
            const parsedData = JSON.parse(result);
            displayNotesHierarchy(parsedData);
        } catch (error) {
            progressText.textContent = `Error: ${error.message}`;
            scanButton.disabled = false;
        }
    });

    // Next button click handler
    document.getElementById('nextButton').addEventListener('click', () => {
        showScreen('configure-screen');
    });

    // Directory selection
    document.getElementById('choose-directory').addEventListener('click', async () => {
        try {
            const result = await window.electron.selectDirectory();
            if (!result || result.canceled) return;

            const directoryPath = result.filePaths[0];
            
            // Check if directory is empty
            const files = await window.electron.checkDirectory(directoryPath);
            const directoryPathInput = document.getElementById('directory-path');
            const directoryError = document.getElementById('directory-error');
            const exportButton = document.getElementById('export-button');

            if (files.length > 0) {
                directoryError.textContent = 'Directory must be empty';
                exportButton.disabled = true;
            } else {
                directoryPathInput.value = directoryPath;
                directoryError.textContent = '';
                // Only enable export if we have a valid directory
                exportButton.disabled = false;
            }
        } catch (error) {
            const directoryError = document.getElementById('directory-error');
            directoryError.textContent = `Error: ${error.message}`;
        }
    });

    // Global state to maintain hierarchy
    let notesHierarchy = [];

    function createHierarchyNode(type, name, checkbox = null) {
        return {
            type,      // 'account', 'folder', or 'note'
            name,
            checkbox,  // DOM reference to checkbox
            children: [],
            parent: null
        };
    }

    function linkParentChild(parent, child) {
        child.parent = parent;
        parent.children.push(child);
    }

    function updateCheckboxState(node) {
        if (!node || !node.checkbox) return;

        // If it has children, state is determined by children
        if (node.children.length > 0) {
            const allChecked = node.children.every(child => child.checkbox.checked);
            node.checkbox.checked = allChecked;
        }

        // Propagate up to parent
        if (node.parent) {
            updateCheckboxState(node.parent);
        }

        // Update Next button state
        updateNextButtonState();
    }

    function handleCheckboxChange(node) {
        if (!node || !node.checkbox) return;

        // If this is a parent, update all children first
        if (node.children.length > 0) {
            // Store the desired state
            const newState = node.checkbox.checked;
            
            // Update all children first
            node.children.forEach(child => {
                child.checkbox.checked = newState;
            });

            // Then propagate the change to each child's children
            node.children.forEach(child => {
                handleCheckboxChange(child);
            });
        }

        // Update parent state only after all children are updated
        if (node.parent) {
            updateCheckboxState(node.parent);
        } else {
            // If no parent, still need to update Next button
            updateNextButtonState();
        }
    }

    function updateNextButtonState() {
        const nextButton = document.getElementById('nextButton');
        const selectionCounter = document.getElementById('selectionCounter');
        if (!nextButton || !selectionCounter) return;

        // Find all checked note checkboxes
        const checkedNotes = document.querySelectorAll('.note-container > .hierarchy-item > input[type="checkbox"]:checked');
        const count = checkedNotes.length;
        
        // Enable button if at least one note is selected
        nextButton.disabled = count === 0;
        
        // Update selection counter
        selectionCounter.textContent = count > 0 ? `${count} note${count !== 1 ? 's' : ''} selected` : '';
    }

    // Handle triangle click for expansion/collapse
    function handleTriangleClick(event, triangle, childrenContainer) {
        event.preventDefault();
        event.stopPropagation();
        
        // Toggle expanded state
        triangle.classList.toggle('expanded');
        
        // Directly manipulate style
        if (triangle.classList.contains('expanded')) {
            childrenContainer.style.display = 'block';
        } else {
            childrenContainer.style.display = 'none';
        }
    }

    // Create a hierarchical item (account or folder)
    function createHierarchicalItem(name, isAccount = false) {
        const container = document.createElement('div');
        container.className = 'hierarchy-item ' + (isAccount ? 'account' : 'folder');

        const triangle = document.createElement('span');
        triangle.className = 'triangle';
            
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';

        const text = document.createElement('span');
        text.textContent = name;

        const children = document.createElement('div');
        children.className = 'children';
        children.style.display = 'none';

        container.appendChild(triangle);
        container.appendChild(checkbox);
        container.appendChild(text);
        container.appendChild(children);

        // Event listeners
        triangle.addEventListener('click', (event) => handleTriangleClick(event, triangle, children));
        checkbox.addEventListener('change', () => handleCheckboxChange(checkbox));

        return { container, children };
    }

    // Display notes hierarchy
    function displayNotesHierarchy(data) {
        console.group('displayNotesHierarchy');
        console.log('Initial data:', JSON.stringify(data, null, 2));
        
        const notesHierarchyElement = document.getElementById('notesHierarchy');
        const notesCounterElement = document.getElementById('notesCounter');
        notesHierarchyElement.innerHTML = '';
        
        if (!data || !data.accounts || !Array.isArray(data.accounts)) {
            console.error('Invalid data format:', data);
            notesHierarchyElement.textContent = 'Error: Invalid data format';
            console.groupEnd();
            return;
        }

        const accounts = data.accounts;
        if (accounts.length === 0) {
            console.log('No accounts found');
            notesHierarchyElement.textContent = 'No notes found';
            console.groupEnd();
            return;
        }
        
        // Reset global hierarchy
        notesHierarchy = [];
        
        // Recursive function to count notes in a folder and all its subfolders
        function countNotesInFolder(folder) {
            let count = folder.notes ? folder.notes.length : 0;
            if (folder.subfolders) {
                folder.subfolders.forEach(subfolder => {
                    count += countNotesInFolder(subfolder);
                });
            }
            return count;
        }
        
        // Count total notes across all accounts and their folders
        let totalNotes = 0;
        accounts.forEach(account => {
            account.folders.forEach(folder => {
                totalNotes += countNotesInFolder(folder);
            });
        });
        
        console.log(`Total notes found: ${totalNotes}`);
        notesCounterElement.textContent = `${totalNotes} note${totalNotes !== 1 ? 's' : ''} found`;

        accounts.forEach((account, accountIndex) => {
            console.group(`Processing account ${accountIndex}: ${account.name}`);
            
            // Create account node
            const accountContainer = document.createElement('div');
            accountContainer.className = 'account-container';
            accountContainer.dataset.accountName = account.name;

            const accountContent = document.createElement('div');
            accountContent.className = 'hierarchy-item';

            const accountTriangle = document.createElement('span');
            accountTriangle.className = 'triangle expandable expanded';
            accountTriangle.innerHTML = `<svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M3 2L7 5L3 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>`;
            
            const accountCheckbox = document.createElement('input');
            accountCheckbox.type = 'checkbox';

            const accountLabel = document.createElement('span');
            accountLabel.className = 'account';
            accountLabel.textContent = account.name;

            const accountChildren = document.createElement('div');
            accountChildren.className = 'children';
            accountChildren.style.display = 'block'; // Always show account children by default
            
            // Build account hierarchy
            accountContent.appendChild(accountTriangle);
            accountContent.appendChild(accountCheckbox);
            accountContent.appendChild(accountLabel);
            accountContainer.appendChild(accountContent);
            accountContainer.appendChild(accountChildren);

            // Create account node in hierarchy
            const accountNode = createHierarchyNode('account', account.name, accountCheckbox);
            notesHierarchy.push(accountNode);

            console.log(`Processing ${account.folders.length} folders for account ${account.name}`);
            
            // Process folders
            account.folders.forEach((folder, folderIndex) => {
                console.group(`Processing folder ${folderIndex}: ${folder.name}`);
                console.log('Folder data:', JSON.stringify(folder, null, 2));
                
                processFolder(folder, accountChildren, accountNode, account.name);
                
                console.groupEnd();
            });
            
            // Add event listeners
            accountTriangle.addEventListener('click', (event) => {
                console.log(`Account triangle clicked: ${account.name}`);
                handleTriangleClick(event, accountTriangle, accountChildren);
            });
            
            accountCheckbox.addEventListener('change', () => {
                console.log(`Account checkbox changed: ${account.name} - checked: ${accountCheckbox.checked}`);
                handleCheckboxChange(accountNode);
            });

            notesHierarchyElement.appendChild(accountContainer);
            console.groupEnd();
        });
        
        console.log('Final hierarchy structure:', notesHierarchy);
        console.groupEnd();
    }

    function processFolder(folder, parentElement, parentNode, accountName, level = 1) {
        console.group(`processFolder: ${folder.name} (level ${level})`);
        console.log('Folder details:', {
            name: folder.name,
            level: level,
            parentNode: parentNode.name,
            accountName: accountName,
            hasSubfolders: folder.subfolders?.length || 0,
            hasNotes: folder.notes?.length || 0
        });

                const folderContainer = document.createElement('div');
                folderContainer.className = 'folder-container';
        folderContainer.dataset.folderPath = `${accountName}/${folder.path || folder.name}`;
        folderContainer.dataset.level = level;

                const folderContent = document.createElement('div');
                folderContent.className = 'hierarchy-item';

        const triangle = document.createElement('span');
        const hasChildren = (folder.subfolders && folder.subfolders.length > 0) || (folder.notes && folder.notes.length > 0);
        // Remove expanded class for all folders, only keep expandable if they have children
        triangle.className = `triangle${hasChildren ? ' expandable' : ''}`;
        triangle.innerHTML = hasChildren ? 
            `<svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M3 2L7 5L3 8" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>` : 
            '<span style="width: 10px; display: inline-block;"></span>';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';

        const folderLabel = document.createElement('span');
        folderLabel.className = 'folder-name';
        folderLabel.textContent = folder.name;

        const children = document.createElement('div');
        children.className = 'children';
        // All folder levels start collapsed
        children.style.display = 'none';
        children.style.marginLeft = '20px';

        // Build folder hierarchy
        folderContent.appendChild(triangle);
        folderContent.appendChild(checkbox);
        folderContent.appendChild(folderLabel);
        folderContainer.appendChild(folderContent);
        folderContainer.appendChild(children);

        // Create folder node in hierarchy
        const folderNode = createHierarchyNode('folder', folder.name, checkbox);
        linkParentChild(parentNode, folderNode);

        // Process subfolders first
        if (folder.subfolders && folder.subfolders.length > 0) {
            console.group(`Processing ${folder.subfolders.length} subfolders`);
            folder.subfolders.forEach((subfolder, index) => {
                console.log(`Processing subfolder ${index}: ${subfolder.name}`);
                processFolder(subfolder, children, folderNode, accountName, level + 1);
            });
            console.groupEnd();
        }

        // Then process notes
        if (folder.notes && folder.notes.length > 0) {
            console.group(`Processing ${folder.notes.length} notes`);
            folder.notes.forEach((note, index) => {
                console.log(`Processing note ${index}: ${note.name}`);
                const noteContainer = createNoteElement(note, folderNode);
                children.appendChild(noteContainer);
            });
            console.groupEnd();
        }

        // Add event listeners
        if (hasChildren) {
            triangle.addEventListener('click', (event) => {
                console.log(`Folder triangle clicked: ${folder.name}`);
                handleTriangleClick(event, triangle, children);
            });
        }

        checkbox.addEventListener('change', () => {
            console.log(`Folder checkbox changed: ${folder.name} - checked: ${checkbox.checked}`);
            handleCheckboxChange(folderNode);
        });

        parentElement.appendChild(folderContainer);
        console.groupEnd();
    }

    function createNoteElement(note, parentNode) {
        console.log('Creating note element:', note.name);
        
                        const noteContainer = document.createElement('div');
                        noteContainer.className = 'note-container';
        noteContainer.dataset.noteName = note.name;

                        const noteContent = document.createElement('div');
                        noteContent.className = 'hierarchy-item';

        const spacer = document.createElement('span');
        spacer.style.width = '20px';
        spacer.style.display = 'inline-block';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.dataset.noteId = note.name;

        const noteLabel = document.createElement('div');
        noteLabel.className = 'note-content';
        noteLabel.innerHTML = `
            <span>${note.name}</span>
            <span class="size-info">(${formatSize(note.size)})</span>
        `;

        // Build note hierarchy
        noteContent.appendChild(spacer);
        noteContent.appendChild(checkbox);
        noteContent.appendChild(noteLabel);
                        noteContainer.appendChild(noteContent);

        // Create note node in hierarchy
        const noteNode = createHierarchyNode('note', note.name, checkbox);
        linkParentChild(parentNode, noteNode);

        // Add event listener
        checkbox.addEventListener('change', () => {
            console.log(`Note checkbox changed: ${note.name} - checked: ${checkbox.checked}`);
                            handleCheckboxChange(noteNode);
            updateSelection();
            });

        return noteContainer;
    }

    // Helper function to format file sizes
    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
    }

    // Helper function to add log entry
    function addLogEntry(message, type = 'info') {
        const logContent = document.getElementById('log-content');
        const entry = document.createElement('div');
        entry.className = `log-entry`;
        
        const time = document.createElement('span');
        time.className = 'log-time';
        time.textContent = new Date().toLocaleTimeString();
        
        const msg = document.createElement('span');
        msg.className = `log-message ${type === 'error' ? 'log-error' : type === 'success' ? 'log-success' : ''}`;
        msg.textContent = message;
        
        entry.appendChild(time);
        entry.appendChild(msg);
        logContent.appendChild(entry);
    }

    // Export button click handler
    const exportButton = document.getElementById('export-button');
    console.log('Found export button:', exportButton); // Debug log
    if (exportButton) {
        exportButton.addEventListener('click', async () => {
            console.log('Export button clicked'); // Debug log
            const selectedNotes = [];
            const checkboxes = document.querySelectorAll('input[type="checkbox"][data-note-id]:checked');
            console.log('Selected checkboxes:', checkboxes.length); // Debug log
            
            // Clear previous logs
            document.getElementById('log-content').innerHTML = '';
            addLogEntry('Starting export process...', 'info');
            
            // Build the full paths for each selected note
            checkboxes.forEach(checkbox => {
                let node = checkbox.closest('.note-container');
                let noteName = node.querySelector('.note-content span:not(.size-info)').textContent.trim();
                let folders = [];
                let accountName = null;
                
                // Traverse up to build the full path
                while (node.parentElement) {
                    node = node.parentElement.closest('.folder-container, .account-container');
                    if (!node) break;
                    
                    if (node.classList.contains('account-container')) {
                        // Found the account, store it separately
                        const accountElement = node.querySelector('span:not(.triangle)');
                        if (accountElement) {
                            accountName = accountElement.textContent.trim();
                        }
                        break;
                    } else {
                        // It's a folder, add it to the path
                        const nameElement = node.querySelector('.folder-name');
                        if (nameElement) {
                            const name = nameElement.textContent.trim();
                            if (name) {
                                folders.unshift(name);
                            }
                        }
                    }
                }
                
                // Construct the final path with account name first
                if (accountName && noteName) {
                    // Include all folders in the path, including "Notes"
                    const fullPath = [accountName, ...folders, noteName].filter(Boolean);
                    const notePath = fullPath.join('/');
                    console.log('Constructed note path:', notePath);
                    selectedNotes.push(notePath);
                }
            });

            const outputDir = document.getElementById('directory-path').value;
            // Get the selected format from radio buttons
            const selectedFormat = document.querySelector('input[name="format"]:checked');
            const format = selectedFormat ? selectedFormat.value : 'markdown'; // default to markdown if nothing selected
            
            console.log('Export details:', { // Debug log
                selectedNotes,
                outputDir,
                format
            });

            if (!outputDir || selectedNotes.length === 0) {
                addLogEntry('No notes selected or output directory not specified', 'error');
                return;
            }

            // Show export screen
            showScreen('export-screen');
            
            // Initialize progress elements
            const progressBar = document.getElementById('progress-bar');
            const progressCount = document.getElementById('progress-count');
            const exportStatus = document.getElementById('export-status');
            const totalSteps = selectedNotes.length * 2; // Double the total for export + copy steps
            let processedSteps = 0;

            try {
                addLogEntry(`Found ${selectedNotes.length} notes to export`, 'info');
                console.log('Starting export of notes:', selectedNotes);
                
                for (const notePath of selectedNotes) {
                    // Update status to show current note path
                    exportStatus.textContent = notePath;
                    addLogEntry(`Extracting note: ${notePath}`, 'info');
                    
                    // Export the note with format parameter
                    await window.electron.exportNote([notePath, outputDir, format]);

                    // Update progress for export step
                    processedSteps++;
                    const exportProgress = (processedSteps / totalSteps) * 100;
                    progressBar.style.width = `${exportProgress}%`;
                    progressCount.textContent = `${Math.ceil(processedSteps/2)}/${selectedNotes.length}`;
                    addLogEntry(`Successfully extracted note: ${notePath}`, 'success');

                    // Update status for copy step
                    addLogEntry(`Converting note: ${notePath}`, 'info');

                    // Update progress for copy step (handled by main process)
                    processedSteps++;
                    const copyProgress = (processedSteps / totalSteps) * 100;
                    progressBar.style.width = `${copyProgress}%`;
                    progressCount.textContent = `${Math.ceil(processedSteps/2)}/${selectedNotes.length}`;
                    addLogEntry(`Successfully converted note: ${notePath}`, 'success');
                }

                // Show completion
                exportStatus.textContent = 'Export completed';
                addLogEntry('Export process completed successfully!', 'success');

                // Update done screen subtitle and show it
                const doneSubtitle = document.getElementById('done-subtitle');
                doneSubtitle.textContent = `${selectedNotes.length} note${selectedNotes.length !== 1 ? 's' : ''} successfully exported`;
                showScreen('done-screen');

            } catch (error) {
                console.error('Export error:', error);
                exportStatus.textContent = `Error: ${error.message}`;
                exportStatus.style.color = '#ff3b30';
                addLogEntry(`Error: ${error.message}`, 'error');
            }
        });
    } else {
        console.error('Export button not found'); // Debug log
    }
}); 