#!/usr/bin/env node

const { jsPDF } = require('jspdf');
const fs = require('fs').promises;
const path = require('path');
const { JSDOM } = require('jsdom');

async function convertFile(inputPath, outputPath) {
    try {
        // Read the HTML file
        const html = await fs.readFile(inputPath, 'utf8');
        
        // Parse HTML
        const dom = new JSDOM(html);
        const document = dom.window.document;
        
        // Create PDF with larger page size and margins
        const doc = new jsPDF({
            format: 'a4',
            unit: 'pt',  // Use points for more precise control
            putOnlyUsedFonts: true
        });
        
        // Set initial position and page dimensions
        let y = 40;  // Top margin
        const margin = 40;
        const pageWidth = doc.internal.pageSize.width;
        const contentWidth = pageWidth - (margin * 2);
        const lineHeight = 1.2;  // Line height multiplier
        let currentIndent = 0;  // Track list nesting level
        let currentX = margin;

        // Helper function to check if we need a new page
        function ensureSpace(height) {
            if (y + height > doc.internal.pageSize.height - margin) {
                doc.addPage();
                y = margin;
                return true;
            }
            return false;
        }

        // Helper function to process text formatting
        function processTextNode(node, fontSize, baseIndent = 0) {
            let text = node.textContent;
            if (!text.trim()) return;

            console.log('\nProcessing text node:', {
                text: text,
                parentTag: node.parentElement?.tagName,
                fontSize: fontSize,
                baseIndent: baseIndent,
                currentX: currentX,
                currentY: y
            });

            // Set base font
            const originalFontSize = fontSize;
            doc.setFontSize(fontSize);
            doc.setFont('helvetica', 'normal');

            // Handle text formatting
            let appliedStyles = [];
            let yOffset = 0;
            let needsUnderline = false;
            let needsStrikethrough = false;

            // Make headings bold by default
            if (hasAncestor(node, 'B') || hasAncestor(node, 'STRONG') || 
                ['H1', 'H2', 'H3'].includes(node.parentElement?.tagName)) {
                doc.setFont('helvetica', 'bold');
                appliedStyles.push('bold');
            }
            if (hasAncestor(node, 'I') || hasAncestor(node, 'EM')) {
                doc.setFont(doc.getFont().fontName, 'italic');
                appliedStyles.push('italic');
            }
            if (hasAncestor(node, 'U')) {
                needsUnderline = true;
                appliedStyles.push('underline');
            }
            if (hasAncestor(node, 'STRIKE')) {
                needsStrikethrough = true;
                appliedStyles.push('strikethrough');
            }
            if (hasAncestor(node, 'TT') || hasAncestor(node, 'CODE') || hasAncestor(node, 'PRE')) {
                doc.setFont('Courier', 'normal');
                fontSize = Math.max(fontSize - 2, 8);
                doc.setFontSize(fontSize);
                appliedStyles.push('monospace');
            }

            // Handle superscript
            if (hasAncestor(node, 'SUP')) {
                fontSize = Math.max(originalFontSize * 0.583, 6);
                doc.setFontSize(fontSize);
                yOffset = -(originalFontSize * 0.33);
                appliedStyles.push('superscript');
            }
            // Handle subscript
            else if (hasAncestor(node, 'SUB')) {
                fontSize = Math.max(originalFontSize * 0.583, 6);
                doc.setFontSize(fontSize);
                yOffset = originalFontSize * 0.33;
                appliedStyles.push('subscript');
            }

            console.log('Applied styles:', appliedStyles);

            // Handle links
            const link = findAncestorLink(node);
            if (link) {
                doc.setTextColor(0, 0, 255);  // Blue for links
                text = text + ' [' + link + ']';
                appliedStyles.push('link');
            } else {
                doc.setTextColor(0);
            }

            // Calculate text dimensions
            const x = currentX + (baseIndent * 20);  // 20pt per indent level
            const textWidth = doc.getTextWidth(text);
            const textHeight = doc.getTextDimensions(text).h;
            
            console.log('Text dimensions:', {
                x: x,
                y: y + yOffset,
                width: textWidth,
                height: textHeight,
                remainingWidth: contentWidth - x,
                yOffset: yOffset,
                fontSize: fontSize
            });

            // Add text at current position with y-offset for sup/sub
            doc.text(text, x, y + yOffset);

            // Add underline if needed
            if (needsUnderline) {
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.line(x, y + yOffset + 1, x + textWidth, y + yOffset + 1);
            }

            // Add strikethrough if needed
            if (needsStrikethrough) {
                doc.setDrawColor(0);
                doc.setLineWidth(0.5);
                doc.line(x, y + yOffset - textHeight/3, x + textWidth, y + yOffset - textHeight/3);
            }
            
            // Update x position for next piece of text
            currentX = x + textWidth;

            // Find the closest div ancestor
            let closestDiv = node.parentElement;
            while (closestDiv && closestDiv.tagName !== 'DIV') {
                closestDiv = closestDiv.parentElement;
            }

            // Check if we need a line break
            const isLastNodeInDiv = !node.nextSibling && (!node.parentElement.nextSibling || node.parentElement.tagName === 'DIV');
            const nextIsBlock = node.nextSibling && (
                node.nextSibling.nodeType === 1 && 
                ['DIV', 'P', 'BR', 'UL', 'OL', 'LI'].includes(node.nextSibling.tagName)
            );
            
            console.log('Line break check:', {
                isLastNodeInDiv: isLastNodeInDiv,
                nextIsBlock: nextIsBlock,
                nextNodeType: node.nextSibling?.nodeType,
                nextNodeTag: node.nextSibling?.tagName,
                parentTag: node.parentElement?.tagName,
                closestDivTag: closestDiv?.tagName
            });

            if (isLastNodeInDiv || nextIsBlock) {
                console.log('Adding line break after:', text);
                currentX = margin;
                y += 12 * lineHeight;
            } else if (text.trim() === ',') {
                // Add a small space after commas
                currentX += 3;
                console.log('Added comma spacing, new X:', currentX);
            }

            // Reset styles
            doc.setTextColor(0);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(originalFontSize);  // Reset to original font size
            doc.setDrawColor(0);
            doc.setLineWidth(0.1);
        }

        // Helper function to check if node has an ancestor with given tag
        function hasAncestor(node, tagName) {
            let current = node.parentElement;
            while (current) {
                if (current.tagName === tagName) return true;
                current = current.parentElement;
            }
            return false;
        }

        // Helper function to find ancestor link href
        function findAncestorLink(node) {
            let current = node.parentElement;
            while (current) {
                if (current.tagName === 'A') return current.getAttribute('href');
                current = current.parentElement;
            }
            return null;
        }

        // Helper function to calculate the true nesting level of a list item
        function calculateListLevel(element) {
            let level = 0;
            let current = element;
            
            while (current) {
                if (current.tagName === 'UL' || current.tagName === 'OL') {
                    level++;
                }
                current = current.parentElement;
            }
            return level - 1; // Subtract 1 because we don't count the outermost list
        }

        // Helper function to get list style
        function getListStyle(list) {
            if (list.tagName === 'OL') return 'numbered';
            if (list.classList.contains('Apple-dash-list')) return 'dash';
            return 'bullet';
        }

        // Helper function to process a list
        function processList(list, baseIndent = 0) {
            const items = Array.from(list.children);
            const listStyle = getListStyle(list);
            let index = 1;

            for (const item of items) {
                if (item.tagName.toLowerCase() === 'li') {
                    // Calculate the true nesting level
                    const level = calculateListLevel(item);
                    const totalIndent = baseIndent + (level * 20);

                    // Get text content excluding nested lists
                    const nestedLists = Array.from(item.children).filter(child => 
                        child.tagName === 'UL' || child.tagName === 'OL'
                    );
                    
                    const textContent = Array.from(item.childNodes)
                        .filter(node => !nestedLists.includes(node))
                        .map(node => node.textContent)
                        .join('').trim();

                    if (textContent) {
                        // Choose bullet style based on list type
                        let bullet;
                        switch (listStyle) {
                            case 'numbered':
                                bullet = `${index}.`;
                                break;
                            case 'dash':
                                bullet = '-';
                                break;
                            default:
                                bullet = '•';
                        }

                        console.log('Processing list item:', {
                            text: textContent,
                            level: level,
                            indent: totalIndent,
                            style: listStyle
                        });

                        // Add bullet point with proper indentation
                        doc.text(`${bullet} `, margin + totalIndent, y);
                        // Add the content with additional indent for the bullet
                        doc.text(textContent, margin + totalIndent + 15, y);
                        y += 12 * lineHeight;
                    }

                    // Process any nested lists with increased base indent
                    for (const nestedList of nestedLists) {
                        processList(nestedList, baseIndent + 20);
                    }
                    
                    if (listStyle === 'numbered') index++;
                } else if (item.tagName === 'UL' || item.tagName === 'OL') {
                    // Handle nested lists that are direct children of the list (not in list items)
                    processList(item, baseIndent + 20);
                }
            }
        }

        // Helper function to process images
        async function processImage(img) {
            const src = img.getAttribute('src');
            if (!src) return;

            try {
                // Add spacing before image
                y += (y === margin) ? 5 : 20;

                // Get dimensions
                let width = parseInt(img.getAttribute('width')) || 600;
                let height = parseInt(img.getAttribute('height')) || 400;

                // Scale down if wider than content width
                if (width > contentWidth) {
                    const ratio = contentWidth / width;
                    width = contentWidth;
                    height = height * ratio;
                }

                // Ensure space for image
                ensureSpace(height);

                // Handle base64 images
                if (src.startsWith('data:image')) {
                    const base64Data = src.split(',')[1];
                    const imageData = Buffer.from(base64Data, 'base64');
                    doc.addImage(imageData, 'JPEG', margin, y, width, height);
                }
                // Handle file system images
                else if (src.startsWith('file://')) {
                    const imagePath = src.replace('file://', '');
                    const imageData = await fs.readFile(imagePath);
                    const extension = path.extname(imagePath).substring(1).toUpperCase() || 'JPEG';
                    doc.addImage(imageData, extension, margin, y, width, height);
                }

                y += height + 10;

            } catch (error) {
                console.error('Error processing image:', error);
            }
        }

        // Helper function to calculate image dimensions
        function getImageDimensions(img) {
            // Get original dimensions
            let width = parseInt(img.getAttribute('width')) || img.naturalWidth || 600;
            let height = parseInt(img.getAttribute('height')) || img.naturalHeight || 400;
            
            // Check for explicit dimensions in style
            const style = img.getAttribute('style') || '';
            const widthMatch = style.match(/width:\s*(\d+)px/);
            const heightMatch = style.match(/height:\s*(\d+)px/);
            
            if (widthMatch) width = parseInt(widthMatch[1]);
            if (heightMatch) height = parseInt(heightMatch[1]);
            
            // Scale down if wider than content width
            if (width > contentWidth) {
                const ratio = contentWidth / width;
                width = contentWidth;
                height = height * ratio;
            }
            
            return { width, height };
        }

        // Helper function to process tables
        function processTable(table) {
            console.log('Processing table');
            
            // Get all rows
            const rows = Array.from(table.getElementsByTagName('tr'));
            if (rows.length === 0) return;

            // Calculate column widths based on content and min-width
            const columnWidths = [];
            const padding = 10; // 5px padding on each side
            const borderWidth = 1;
            
            // First pass: calculate minimum widths
            rows.forEach(row => {
                const cells = Array.from(row.getElementsByTagName('td'));
                cells.forEach((cell, colIndex) => {
                    // Get min-width from style
                    const style = cell.getAttribute('style') || '';
                    const minWidthMatch = style.match(/min-width:\s*(\d+)px/);
                    const minWidth = minWidthMatch ? parseInt(minWidthMatch[1]) : 70;
                    
                    // Get content width
                    const content = cell.textContent.trim();
                    doc.setFontSize(12);
                    const contentWidth = doc.getTextWidth(content);
                    
                    // Total cell width including padding
                    const totalWidth = Math.max(minWidth, contentWidth + (padding * 2));
                    
                    // Update column width if this is wider
                    if (!columnWidths[colIndex] || totalWidth > columnWidths[colIndex]) {
                        columnWidths[colIndex] = totalWidth;
                    }
                });
            });

            // Calculate table dimensions
            const tableWidth = columnWidths.reduce((sum, width) => sum + width, 0);
            const tableX = margin;
            let tableY = y;

            // Draw table
            rows.forEach((row, rowIndex) => {
                const cells = Array.from(row.getElementsByTagName('td'));
                let maxRowHeight = 0;
                
                // Calculate row height
                cells.forEach(cell => {
                    const content = cell.textContent.trim();
                    doc.setFontSize(12);
                    const textHeight = doc.getTextDimensions(content).h;
                    maxRowHeight = Math.max(maxRowHeight, textHeight + (padding * 2));
                });

                // Check if we need a new page
                if (tableY + maxRowHeight > doc.internal.pageSize.height - margin) {
                    doc.addPage();
                    tableY = margin;
                }

                // Draw cells
                let currentX = tableX;
                cells.forEach((cell, colIndex) => {
                    const cellWidth = columnWidths[colIndex];
                    const content = cell.textContent.trim();

                    // Draw cell border
                    doc.setDrawColor(204, 204, 204); // #ccc
                    doc.setLineWidth(borderWidth);
                    doc.rect(currentX, tableY, cellWidth, maxRowHeight);

                    // Draw cell content
                    doc.setTextColor(0);
                    doc.setFontSize(12);
                    doc.text(content, currentX + padding, tableY + padding + (doc.getTextDimensions(content).h / 2));

                    currentX += cellWidth;
                });

                tableY += maxRowHeight;
            });

            // Update current Y position
            y = tableY + 10; // Add some spacing after the table
            currentX = margin;
        }

        // Helper function to process content recursively
        async function processNode(node, indent = 0, fontSize = 12) {
            if (!node) return;

            console.log('\nProcessing node:', {
                type: node.nodeType,
                tag: node.nodeType === 1 ? node.tagName : 'text',
                content: node.nodeType === 3 ? node.textContent : null,
                indent: indent,
                currentX: currentX,
                currentY: y,
                fontSize: fontSize
            });

            switch (node.nodeType) {
                case 1:  // Element node
                    const tagName = node.tagName.toLowerCase();
                    
                    switch (tagName) {
                        case 'h1':
                        case 'h2':
                        case 'h3':
                            console.log(`Processing heading: ${tagName}`);
                            currentX = margin;
                            // Add some spacing before headings
                            if (y > margin + 20) {
                                y += 10;
                            }
                            // Process heading content
                            for (const child of node.childNodes) {
                                const fontSize = tagName === 'h1' ? 24 : tagName === 'h2' ? 20 : 16;
                                await processNode(child, indent, fontSize);
                            }
                            // Add spacing after headings
                            y += 16;
                            break;
                            
                        case 'table':
                            processTable(node);
                            break;
                            
                        case 'div':
                            console.log('Processing div');
                            currentX = margin;
                            
                            // Check if this div contains an image
                            const hasImage = Array.from(node.children).some(child => 
                                child.tagName && child.tagName.toLowerCase() === 'img'
                            );
                            
                            // Process all children
                            for (const child of node.childNodes) {
                                await processNode(child, indent);
                            }
                            
                            // Add line break after div, but only if it's not empty and doesn't contain an image
                            if (!hasImage && node.textContent.trim()) {
                                console.log('End of div with content, adding line break');
                                currentX = margin;
                                y += 12 * lineHeight;
                            }
                            break;
                            
                        case 'br':
                            // Reset x position and add new line for br tag
                            currentX = margin;
                            y += 12 * lineHeight;
                            break;
                            
                        case 'ul':
                        case 'ol':
                            currentX = margin;
                            processList(node, indent);
                            break;
                            
                        case 'li':
                            // Process list item content
                            for (const child of node.childNodes) {
                                await processNode(child, indent);
                            }
                            // Reset x position and add new line after list item
                            currentX = margin;
                            y += 12 * lineHeight;
                            break;
                            
                        case 'img':
                            await processImage(node);
                            break;
                            
                        default:
                            // Skip object tags (they just wrap tables)
                            if (tagName !== 'object' && tagName !== 'tbody') {
                                console.log('Processing default tag:', tagName);
                                // For all other tags, just process their content
                                for (const child of node.childNodes) {
                                    await processNode(child, indent);
                                }
                            } else {
                                // For object and tbody, process children directly
                                for (const child of node.childNodes) {
                                    await processNode(child, indent);
                                }
                            }
                    }
                    break;
                    
                case 3:  // Text node
                    if (node.textContent.trim()) {
                        processTextNode(node, fontSize, indent);
                    }
                    break;
            }
        }

        // Process the document body
        async function processDocument() {
            await processNode(document.body);
        }

        // Process content and write file
        await processDocument();
        
        // Ensure output directory exists
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        
        // Write PDF file
        await fs.writeFile(outputPath, Buffer.from(doc.output('arraybuffer')));
        
        console.log(`Successfully converted ${path.basename(inputPath)} to ${outputPath}`);
        return true;
    } catch (error) {
        console.error('Error converting file:', error);
        throw error;
    }
}

// If running directly (not imported as a module)
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length !== 2) {
        console.error('Usage: node html-to-pdf.js <input.html> <output.pdf>');
        console.error('Example: node html-to-pdf.js "note.html" "output/iCloud/A/B/note.pdf"');
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