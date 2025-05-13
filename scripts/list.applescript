on run argv
    if length of argv is 0 then
        return "Error: Please provide an output file path as argument"
    end if
    
    set outputPath to item 1 of argv
    
    try
        tell application "Notes"
            log "Starting Notes export..."
            
            -- Initialize the JSON structure
            set jsonOutput to "{"
            set jsonOutput to jsonOutput & "\"accounts\": ["
            
            try
                set accountCount to count of accounts
                if accountCount is 0 then
                    return "{\"error\": \"No accounts found in Notes.\"}"
                end if
                
                log "Found " & accountCount & " accounts"
                
                set accountIndex to 0
                repeat with theAccount in accounts
                    set accountIndex to accountIndex + 1
                    try
                        set accountName to name of theAccount
                        log "Processing account: " & accountName
                        
                        set jsonOutput to jsonOutput & "{"
                        set jsonOutput to jsonOutput & "\"name\": \"" & my escapeJSON(accountName) & "\","
                        set jsonOutput to jsonOutput & "\"folders\": ["
                        
                        try
                            -- Get all folders first
                            set allFolders to folders of theAccount
                            log "Total folders in account: " & (count of allFolders)
                            
                            -- Build a map of folder paths to folders
                            set folderMap to {}
                            repeat with theFolder in allFolders
                                try
                                    set folderName to name of theFolder
                                    log "Checking folder: " & folderName
                                    
                                    -- Get the folder's path
                                    set folderPath to my getFolderPath(theFolder)
                                    log "Folder path: " & folderPath
                                    
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
                                    log "Found root folder: " & name of theFolder
                                    set end of rootFolders to theFolder
                                            end if
                                        end repeat
                                    
                            -- Process root folders
                            set folderCount to count of rootFolders
                            log "Found " & folderCount & " root folders"
                                    
                            set folderIndex to 0
                            repeat with theFolder in rootFolders
                                set folderIndex to folderIndex + 1
                                try
                                    set jsonOutput to jsonOutput & my processFolderRecursively(theFolder, folderMap)
                                    if folderIndex < folderCount then
                                        set jsonOutput to jsonOutput & ","
                                    end if
                                end try
                            end repeat
                        end try
                        
                        set jsonOutput to jsonOutput & "]"
                        set jsonOutput to jsonOutput & "}"
                        
                        if accountIndex < accountCount then
                            set jsonOutput to jsonOutput & ","
                        end if
                    end try
                end repeat
            end try
            
            set jsonOutput to jsonOutput & "]"
            set jsonOutput to jsonOutput & "}"
            
            -- Write to file with UTF-8 encoding
            try
                set theFile to open for access outputPath with write permission
                write jsonOutput to theFile starting at 0 as «class utf8»
                close access theFile
                return "Successfully wrote Notes hierarchy to " & outputPath
            on error errMsg
                try
                    close access theFile
                end try
                return "{\"error\": \"Failed to write to file: " & my escapeJSON(errMsg) & "\"}"
            end try
        end tell
    on error errMsg
        return "{\"error\": \"Failed to access Notes application: " & my escapeJSON(errMsg) & "\"}"
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
        set folderName to name of theFolder
        set currentPath to my getFolderPath(theFolder)
        log "Processing folder recursively: " & folderName & " (path: " & currentPath & ")"
        
        set jsonOutput to "{"
        set jsonOutput to jsonOutput & "\"name\": \"" & my escapeJSON(folderName) & "\","
        
        -- Add subfolders array
        set jsonOutput to jsonOutput & "\"subfolders\": ["
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
                        log "Found child folder: " & name of potentialChild & " under " & folderName
                        set end of childFolders to potentialChild
                    end if
                end if
            end repeat
            
            -- Process child folders
            set childCount to count of childFolders
            log "Found " & childCount & " child folders for: " & folderName
            
            set childIndex to 0
            repeat with childFolder in childFolders
                set childIndex to childIndex + 1
                set jsonOutput to jsonOutput & my processFolderRecursively(childFolder, folderMap)
                if childIndex < childCount then
                    set jsonOutput to jsonOutput & ","
                end if
            end repeat
        end try
        set jsonOutput to jsonOutput & "],"
        
        -- Add notes array
        set jsonOutput to jsonOutput & "\"notes\": ["
        try
            set folderNotes to notes of theFolder
            log "Found " & (count of folderNotes) & " notes in folder: " & folderName
            
            set noteIndex to 0
            repeat with theNote in folderNotes
                set noteIndex to noteIndex + 1
                try
                    set noteName to name of theNote
                    
                    -- Get note content and calculate size
                    set noteSize to 0
                    try
                        set noteContent to body of theNote
                        set noteSize to length of noteContent
                    on error
                        try
                            set noteContent to plaintext of theNote
                            set noteSize to length of noteContent
                        on error
                            set noteSize to 0
                        end try
                    end try
                    
                    set jsonOutput to jsonOutput & "{"
                    set jsonOutput to jsonOutput & "\"name\": \"" & my escapeJSON(noteName) & "\","
                    set jsonOutput to jsonOutput & "\"size\": " & noteSize
                    set jsonOutput to jsonOutput & "}"
                    if noteIndex < (count of folderNotes) then
                        set jsonOutput to jsonOutput & ","
                    end if
                end try
            end repeat
        end try
        set jsonOutput to jsonOutput & "]"
        set jsonOutput to jsonOutput & "}"
        return jsonOutput
    end tell
end processFolderRecursively

on split(theText, theDelimiter)
    set AppleScript's text item delimiters to theDelimiter
    set theArray to every text item of theText
    set AppleScript's text item delimiters to ""
    return theArray
end split

on escapeJSON(str)
    -- Handle special JSON characters
    set str to my replaceText(str, "\\", "\\\\") -- Must be first
    set str to my replaceText(str, "\"", "\\\"")
    set str to my replaceText(str, return, "\\n")
    set str to my replaceText(str, tab, "\\t")
    return str
end escapeJSON

on replaceText(theText, searchString, replacementString)
    set AppleScript's text item delimiters to searchString
    set theTextItems to every text item of theText
    set AppleScript's text item delimiters to replacementString
    set theText to theTextItems as text
    set AppleScript's text item delimiters to ""
    return theText
end replaceText 