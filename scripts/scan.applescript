-- Global variables
global totalNotesProcessed, outputExportPath

on run argv
    if length of argv < 1 then
        set scriptName to name of (info for (path to me))
        return scriptName & " [path to output export directory]"
    end if
    
    -- Initialize global counter variables
    set totalNotesProcessed to 0

    -- Process command line arguments
    set outputExportPath to item 1 of argv

    -- Initialize local variables
    set currentFolderCount to 0
    set totalFolders to 0
    
    try
        tell application "Notes"
            log "[info] starting scanning..."
            
            try
                set accountCount to count of accounts
                if accountCount is 0 then
                    return "No accounts found in Notes."
                end if
                
                log "[info] found " & accountCount & " accounts"
                
                repeat with theAccount in accounts
                    try
                        set accountName to name of theAccount
                        log "[info] scanning account " & accountName
                        
                        try
                            -- Get all folders first
                            set allFolders to folders of theAccount
                            set totalFolders to count of allFolders
                            log "[info] found " & totalFolders & " root folders in account " & accountName
                            
                            -- Build a map of folder paths to folders
                            set folderMap to {}
                            repeat with theFolder in allFolders
                                try
                                    set currentFolderCount to currentFolderCount + 1

                                    -- Get the folder's path
                                    set folderPath to my getFolderPath(theFolder)

                                    log "[debug " & currentFolderCount & "/" & totalFolders & "] registering folder " & folderPath

                                    -- Add to map
                                    copy theFolder to end of folderMap
                                    copy folderPath to end of folderMap
                                end try
                            end repeat
                            
                            -- Get root folders (those with no "/" in path except account name)
                            set rootFolders to {}
                            repeat with i from 1 to count of folderMap by 2
                                set theFolder to item i of folderMap
                                set folderPath to item (i + 1) of folderMap
                                set pathParts to my split(folderPath, "/")
                                if (count of pathParts) is 2 then
                                    -- Only account name and folder name
                                    set end of rootFolders to theFolder
                                end if
                            end repeat

                            -- Process root folders
                            set folderCount to count of rootFolders
                            log "[info] identified " & folderCount & " root folders"

                            repeat with theFolder in rootFolders
                                try
                                    log "[info] processing root folder " & my getFolderPath(theFolder)
                                    my processFolderRecursively(theFolder, folderMap)
                                end try
                            end repeat
                        end try
                    end try
                end repeat
            end try
            
            log "[info] total notes processed: " & totalNotesProcessed
            return "Export completed. Total notes processed: " & totalNotesProcessed
        end tell
    on error errMsg
        return "Failed to access Apple Notes application: " & errMsg
    end try
end run

on getFolderPath(theFolder)
    tell application "Notes"
        set folderPath to name of theFolder
        set currentFolder to theFolder
        
        repeat
            try
                set parentFolder to container of currentFolder
                if parentFolder is missing value then
                    exit repeat
                end if
                
                set parentName to name of parentFolder
                set folderPath to parentName & "/" & folderPath
                set currentFolder to parentFolder
            on error
                exit repeat
            end try
        end repeat
        
        return folderPath
    end tell
end getFolderPath

on processFolderRecursively(theFolder, folderMap)
    tell application "Notes"
        set currentPath to my getFolderPath(theFolder)

        log "[debug] traversing folder " & currentPath
        
        try
            -- Find child folders by checking paths
            set childFolders to {}
            repeat with i from 1 to count of folderMap by 2
                set potentialChild to item i of folderMap
                set potentialPath to item (i + 1) of folderMap
                
                -- Check if this folder's path indicates it's a direct child
                set currentParts to my split(currentPath, "/")
                set potentialParts to my split(potentialPath, "/")
                
                if (count of potentialParts) is ((count of currentParts) + 1) then
                    -- Check if all parent parts match
                    set isChild to true
                    repeat with j from 1 to count of currentParts
                        if item j of currentParts is not equal to item j of potentialParts then
                            set isChild to false
                            exit repeat
                        end if
                    end repeat
                    
                    if isChild then
                        set end of childFolders to potentialChild
                    end if
                end if
            end repeat
            
            -- Process child folders recursively
            repeat with childFolder in childFolders
                my processFolderRecursively(childFolder, folderMap)
            end repeat
        end try
        
        -- Process notes in this folder
        try
            set folderNotes to notes of theFolder
            set folderPath to my getFolderPath(theFolder)
            set totalNotes to count of folderNotes

            log "[info] found " & totalNotes & " notes in " & folderPath
            
            set noteIndex to 0
            repeat with theNote in folderNotes
                set noteIndex to noteIndex + 1
                try
                    set noteName to name of theNote
                    set exportPath to outputExportPath & "/" & my sanitizeFolderPath(folderPath)
                    my exportNote(theNote, exportPath)
                end try
            end repeat
        end try
    end tell
end processFolderRecursively

on exportNote(theNote, outputDir)
    tell application "Notes"
        try
            -- Compute output filename
            set noteName to name of theNote
            set outputFile to outputDir & "/" & my sanitizePath(noteName) & ".html"

            -- Check if note is password protected
            if password protected of theNote then
                log "[warning] skipping password protected note: " & noteName
                return
            end if

            -- Check if file already exists, skip if so
            try
                do shell script "test -f " & quoted form of outputFile
                log "[info] skipping note (already exported): " & outputFile
                return
            on error
                -- File does not exist, continue
            end try

            log "[debug] exporting note " & noteName

            -- Get note content
            set noteContent to ""
            try
                set noteContent to body of theNote
            on error
                try
                    set noteContent to plaintext of theNote
                on error
                    log "[error] unable to get content for note: " & name of theNote
                    return
                end try
            end try
            
            log "[info] saving note to " & outputFile
            
            -- Write to file
            set theFile to null
            try
                -- First ensure the output directory exists
                try
                    do shell script "mkdir -p " & quoted form of outputDir
                    log "[info] created output directory: " & outputDir
                end try
                
                -- Try to touch the file to test write permissions
                try
                    do shell script "touch " & quoted form of outputFile
                    log "[info] created output file for note: " & noteName
                on error errMsg
                    log "[error] unable to create output file for note " & noteName & " (permission denied or invalid path): " & errMsg
                    return
                end try
                
                -- Write the note content
                set theFile to open for access POSIX file outputFile with write permission
                write noteContent to theFile as «class utf8»
                close access theFile
                
                log "[info] exported note successfully: " & noteName
                set totalNotesProcessed to totalNotesProcessed + 1

            on error errMsg
                log "[error] failed to write note " & noteName & ": " & errMsg
                if theFile is not null then
                    try
                        close access theFile
                    end try
                end if
            end try
        end try
    end tell
end exportNote

on sanitizePath(thePath)
    -- Replace invalid characters with underscores (for file names)
    set invalidChars to {":", "/", "\\", "?", "*", "|", "\"", "<", ">", " "}
    set sanitized to thePath
    repeat with invalidChar in invalidChars
        set sanitized to my replaceText(sanitized, invalidChar, " ")
    end repeat
    return sanitized
end sanitizePath

on sanitizeFolderPath(thePath)
    -- Sanitize a folder path while preserving directory structure
    set pathParts to my split(thePath, "/")
    set sanitizedParts to {}
    
    repeat with pathPart in pathParts
        -- Sanitize each part individually (excluding "/" from invalid chars)
        set invalidChars to {":", "\\", "?", "*", "|", "\"", "<", ">"}
        set sanitizedPart to pathPart
        repeat with invalidChar in invalidChars
            set sanitizedPart to my replaceText(sanitizedPart, invalidChar, "_")
        end repeat
        set end of sanitizedParts to sanitizedPart
    end repeat
    
    -- Rejoin with "/"
    set AppleScript's text item delimiters to "/"
    set sanitizedPath to sanitizedParts as text
    set AppleScript's text item delimiters to ""
    return sanitizedPath
end sanitizeFolderPath

on split(theText, theDelimiter)
    set AppleScript's text item delimiters to theDelimiter
    set theArray to every text item of theText
    set AppleScript's text item delimiters to ""
    return theArray
end split

on replaceText(theText, searchString, replacementString)
    set AppleScript's text item delimiters to searchString
    set theTextItems to every text item of theText
    set AppleScript's text item delimiters to replacementString
    set theText to theTextItems as text
    set AppleScript's text item delimiters to ""
    return theText
end replaceText