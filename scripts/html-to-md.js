#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const { NodeHtmlMarkdown } = require('node-html-markdown');
const { JSDOM } = require('jsdom');

function convertToMarkdown(html, noteName) {
    const nhm = new NodeHtmlMarkdown();
    const images = [];
    
    console.log(`Converting HTML to Markdown for note: ${noteName}`);
    console.log('HTML content length:', html.length);
    
    // Parse HTML with jsdom
    const dom = new JSDOM(html);
    const document = dom.window.document;
    console.log('Document loaded with jsdom');
    
    // Find all images and process them before markdown conversion
    const imgElements = document.querySelectorAll('img');
    console.log(`Found ${imgElements.length} image elements in HTML`);
    
    imgElements.forEach((el, i) => {
        const src = el.getAttribute('src');
        if (!src) {
            console.log(`Image ${i + 1}: No src attribute`);
            return;
        }
        
        console.log(`Processing image ${i + 1}/${imgElements.length}`);
        console.log(`Image source starts with: ${src.substring(0, 50)}...`);
        
        if (src.startsWith('data:')) {
            const matches = src.match(/^data:([A-Za-z-+\\/]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const mimeType = matches[1];
                const base64Data = matches[2];
                
                const extension = mimeType.split('/')[1];
                const imageFileName = `image-${i + 1}.${extension}`;
                
                images.push({
                    fileName: imageFileName,
                    data: Buffer.from(base64Data, 'base64'),
                    mimeType: mimeType
                });
                
                // Update image source in HTML to reference the attachments folder
                el.setAttribute('src', `${noteName}.attachments/${imageFileName}`);
                console.log(`Processed image ${imageFileName}`);
            }
        }
    });
    
    // Get the modified HTML with updated image sources
    const modifiedHtml = dom.serialize();
    
    // Convert to Markdown
    const markdown = nhm.translate(modifiedHtml);
    
    console.log('Conversion complete:');
    console.log('\t- Markdown length:', markdown.length);
    console.log('\t- Images extracted:', images.length);
    
    return { markdown, images };
}

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
                const imagePath = path.join(attachmentsDir, image.fileName);
                await fs.writeFile(imagePath, image.data);
                console.log(`Saved attachment: ${image.fileName}`);
            }
            
            console.log(`Extracted ${images.length} image(s) to ${attachmentsDir}`);
        }
        
        console.log(`Successfully converted ${noteName} to ${outputPath}`);
        return true;
    } catch (error) {
        console.error(`Error converting file:`, error);
        throw error;
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
    convertFile,
    convertToMarkdown
}; 