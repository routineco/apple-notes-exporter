on run argv
    if length of argv < 2 then
        return "Error: Please provide note path and output directory (e.g., 'iCloud/Folder/Note' '/path/to/output')"
    end if
    
    set notePath to item 1 of argv
    set outputDir to item 2 of argv
    
    try
        tell application "Notes"
            -- Parse the path
            set pathParts to my split(notePath, "/")
            set accountName to item 1 of pathParts
            set noteName to item -1 of pathParts -- last item
            
            -- Get folders path (everything between account and note name)
            set folderPath to {}
            repeat with i from 2 to (length of pathParts) - 1
                set end of folderPath to item i of pathParts
            end repeat
            
            log "Looking for note:"
            log "  Account: " & accountName
            log "  Folders: " & my joinList(folderPath, "/")
            log "  Note: " & noteName
            
            -- Find the account
            set targetAccount to null
            log "Available accounts:"
            repeat with theAccount in accounts
                log "  - " & name of theAccount
                if name of theAccount is equal to accountName then
                    set targetAccount to theAccount
                    log "    Found target account!"
                    exit repeat
                end if
            end repeat
            
            if targetAccount is null then
                error "Account not found: " & accountName
            end if
            
            -- Navigate through folders
            set currentFolder to null
            
            -- First find the root folder if we have folders
            if length of folderPath > 0 then
                log "Looking for root folder: " & item 1 of folderPath
                log "Available root folders in " & accountName & ":"
                repeat with theFolder in folders of targetAccount
                    log "  - " & name of theFolder
                    if name of theFolder is equal to (item 1 of folderPath) then
                        set currentFolder to theFolder
                        log "    Found target folder!"
                        exit repeat
                    end if
                end repeat
                
                if currentFolder is null then
                    error "Root folder not found: " & (item 1 of folderPath)
                end if
                
                -- Then traverse the rest of the path if we have more folders
                if length of folderPath > 1 then
                    repeat with i from 2 to length of folderPath
                        set folderName to item i of folderPath
                        set found to false
                        log "Looking for subfolder: " & folderName
                        log "Available subfolders in " & name of currentFolder & ":"
                        
                        repeat with theFolder in folders of currentFolder
                            log "  - " & name of theFolder
                            if name of theFolder is equal to folderName then
                                set currentFolder to theFolder
                                set found to true
                                log "    Found target folder!"
                                exit repeat
                            end if
                        end repeat
                        
                        if not found then
                            error "Subfolder not found: " & folderName
                        end if
                    end repeat
                end if
            else
                -- If no folders, look for note directly in account
                set currentFolder to targetAccount
            end if
            
            -- Find the note
            set targetNote to null
            if currentFolder is not null then
                log "Looking for note: " & noteName
                log "Available notes in " & name of currentFolder & ":"
                repeat with theNote in notes of currentFolder
                    log "  - " & name of theNote
                    if name of theNote is equal to noteName then
                        set targetNote to theNote
                        log "    Found target note!"
                        exit repeat
                    end if
                end repeat
            end if
            
            if targetNote is null then
                error "Note not found: " & noteName
            end if
            
            -- Check if note is password protected
            if password protected of targetNote then
                error "Note is password protected and cannot be exported"
            end if
            
            -- Get note content
            set noteContent to ""
            try
                set noteContent to body of targetNote
            on error
                try
                    set noteContent to plaintext of targetNote
                on error
                    error "Could not get note content"
                end try
            end try
            
            -- Create output filename (use .html extension)
            set outputFile to outputDir & "/" & my sanitizeFilename(noteName) & ".html"
            
            -- Write to file
            set theFile to null
            try
                -- First ensure the output directory exists
                try
                    do shell script "mkdir -p " & quoted form of outputDir
                    log "Created output directory: " & outputDir
                end try
                
                -- Try to touch the file to test write permissions
                try
                    do shell script "touch " & quoted form of outputFile
                    log "Successfully created output file"
                on error errMsg
                    log "Error creating output file: " & errMsg
                    error "Cannot create output file (permission denied or invalid path)"
                end try
                
                log "Opening file for writing: " & outputFile
                set theFile to open for access POSIX file outputFile with write permission
                
                log "Writing note content..."
                -- Write raw note content without HTML wrapping
                write noteContent to theFile as «class utf8»
                
                log "Closing file..."
                close access theFile
                
                log "Export completed successfully"
                return "Successfully exported note to " & outputFile
                
            on error errMsg
                log "Error during file operations: " & errMsg
                if theFile is not null then
                    try
                        log "Attempting to close file after error..."
                        close access theFile
                    end try
                end if
                error "Failed to write file: " & errMsg
            end try
        end tell
    on error errMsg
        return "Error: " & errMsg
    end try
end run

on sanitizeFilename(filename)
    -- Replace invalid characters with underscores
    set invalidChars to {":", "/", "\\", "?", "*", "|", "\"", "<", ">"}
    set sanitized to filename
    repeat with invalidChar in invalidChars
        set sanitized to my replaceText(sanitized, invalidChar, "_")
    end repeat
    return sanitized
end sanitizeFilename

on split(theText, theDelimiter)
    set AppleScript's text item delimiters to theDelimiter
    set theArray to every text item of theText
    set AppleScript's text item delimiters to ""
    return theArray
end split

on joinList(theList, theDelimiter)
    set AppleScript's text item delimiters to theDelimiter
    set theText to theList as string
    set AppleScript's text item delimiters to ""
    return theText
end joinList

on replaceText(theText, searchString, replacementString)
    set AppleScript's text item delimiters to searchString
    set theTextItems to every text item of theText
    set AppleScript's text item delimiters to replacementString
    set theText to theTextItems as string
    set AppleScript's text item delimiters to ""
    return theText
end replaceText 