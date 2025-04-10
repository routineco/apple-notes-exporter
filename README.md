# Apple Notes Importer

A desktop application built with Electron to export Apple Notes to HTML files while preserving folder structure and formatting.

## Features

- Exports all notes to HTML files
- Preserves folder hierarchy
- Maintains note formatting and styling
- Shows real-time export progress
- Creates clean, readable HTML output

## Prerequisites

- macOS (required for Apple Notes access)
- Node.js 14.0.0 or later
- npm 6.0.0 or later

## Installation

1. Clone the repository:
   ```bash
   git clone git@github.com:routineco/apple-notes-importer.git
   cd apple-notes-importer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the application:
   ```bash
   npm start
   ```

2. Click "Scan for Notes Database" to begin the export process
3. Notes will be exported to `~/Documents/ExportedNotes`

## Output Structure

Notes are exported with the following structure:
```
ExportedNotes/
└── iCloud/
    └── FolderName/
        └── NoteName.html
```

Each HTML file includes:
- Original note title
- Full note content
- Original folder path
- Preserved formatting
- Responsive styling

## License

MIT 