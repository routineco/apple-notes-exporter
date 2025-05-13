#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { convertToMarkdown } = require('../src/html-to-markdown');

async function convertFile(inputPath, outputPath) {
    try {
        // Read the HTML file
        const html = await fs.readFile(inputPath, 'utf8');
        
        // Get the note name without extension
        const noteName = path.basename(inputPath, '.html');
        
        // Convert to Markdown and extract images
        const { markdown, images } = convertToMarkdown(html, noteName);
        
        // Create the output directory if it doesn't exist
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        
        // Write the Markdown file
        await fs.writeFile(outputPath, markdown, 'utf8');
        
        // Define attachments directory path
        const attachmentsDir = outputPath.replace(/\.md$/, '.attachments');
        
        // Handle attachments if we have images
        if (images && images.length > 0) {
            await fs.mkdir(attachmentsDir, { recursive: true });
            
            // Save all extracted images
            for (const image of images) {
                const imagePath = path.join(attachmentsDir, image.filename);
                await fs.writeFile(imagePath, image.data);
                console.log(`Saved attachment: ${image.filename}`);
            }
            
            console.log(`Extracted ${images.length} image(s) to ${attachmentsDir}`);
        }
        
        console.log(`Successfully converted ${noteName} to ${outputPath}`);
        return true;
    } catch (error) {
        console.error(`Error converting file:`, error);
        throw error; // Propagate the error instead of returning false
    }
}

// If running directly (not imported as a module)
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length !== 2) {
        console.error('Usage: node html-to-md.js <input.html> <output.md>');
        console.error('Example: node html-to-md.js "note.html" "output/iCloud/A/B/note.md"');
        process.exit(1);
    }

    const [inputPath, outputPath] = args;

    convertFile(inputPath, outputPath)
        .then(success => process.exit(success ? 0 : 1))
        .catch(error => {
            console.error('Unexpected error:', error);
            process.exit(1);
        });
}

module.exports = {
    convertFile
}; 