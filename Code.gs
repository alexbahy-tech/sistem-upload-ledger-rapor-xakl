// =======================================================
// 1. KONFIGURASI (WAJIB DIISI ULANG!)
// =======================================================
const SHEET_ID = "1vnBRC-DQ05mix6ryjMdg8hmVKpZk2GqJXTuB0oiPFik";
const SHEET_NAME = "Sheet1";
const PARENT_FOLDER_ID = "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA";
const LEDGER_FOLDER_ID = "11rV1PEUjZT4VqIU-UMcEJPAzTDNyJ42_";

// =======================================================
// 2. SYSTEM CODE (JANGAN DIUBAH)
// =======================================================

function doGet(e) {
  try {
    return HtmlService.createHtmlOutputFromFile('index')
        .setTitle('Sistem Rapor X AKL')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch(err) {
    Logger.log("doGet Error: " + err.toString());
    return HtmlService.createHtmlOutput("Error: " + err.toString());
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  
  try {
    lock.tryLock(10000);
  } catch(lockErr) {
    return responseJSON({ status: "error", message: "Could not acquire lock: " + lockErr.toString() });
  }

  try {
    // Parse parameter action
    var action = null;
    if (e && e.parameter && e.parameter.action) {
      action = e.parameter.action;
    }
    
    Logger.log("Action received: " + action);
    
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

    // --- A. BACA DATA ---
    if (!action || action === "read") {
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) {
        return responseJSON({ status: "success", data: [] });
      }
      
      const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      const result = data.map(function(row, index) {
        return {
          row: index + 2,
          no: row[0],
          nis: row[1],
          nama: row[2],
          kelas: row[3],
          folder_id: row[4]
        };
      });
      
      return responseJSON({ status: "success", data: result });
    }

    // --- B. CEK STATUS FILE ---
    if (action === "check_status") {
      var folderId = e.parameter.folderId;
      
      if (!folderId) {
        return responseJSON({ 
          status: "error", 
          message: "No folder ID provided",
          hasRapor: false,
          hasIdentitas: false
        });
      }
      
      try {
        const folder = DriveApp.getFolderById(folderId);
        const files = folder.getFiles();
        var hasRapor = false;
        var hasIdentitas = false;
        var fileList = [];
        
        while (files.hasNext()) {
          var file = files.next();
          var fileName = file.getName();
          var fileNameLower = fileName.toLowerCase();
          
          fileList.push(fileName);
          
          // Cek kata kunci
          if (fileNameLower.indexOf("rapor") > -1) {
            hasRapor = true;
            Logger.log("Found Rapor file: " + fileName);
          }
          
          if (fileNameLower.indexOf("identitas") > -1) {
            hasIdentitas = true;
            Logger.log("Found Identitas file: " + fileName);
          }
        }
        
        Logger.log("Folder: " + folderId + " | Files: " + fileList.length + " | Rapor: " + hasRapor + " | Identitas: " + hasIdentitas);
        
        return responseJSON({ 
          status: "success", 
          hasRapor: hasRapor, 
          hasIdentitas: hasIdentitas,
          fileCount: fileList.length,
          files: fileList
        });
        
      } catch (err) {
        Logger.log("Error in check_status: " + err.toString());
        return responseJSON({ 
          status: "error", 
          message: err.toString(),
          hasRapor: false,
          hasIdentitas: false
        });
      }
    }

    // --- C. CEK LEDGER ---
    if (action === "check_ledger") {
      try {
        const folder = DriveApp.getFolderById(LEDGER_FOLDER_ID);
        const files = folder.getFiles();
        var hasFile = false;
        var fileUrl = "";
        var fileName = "";
        
        if (files.hasNext()) {
          var file = files.next();
          hasFile = true;
          fileUrl = file.getUrl();
          fileName = file.getName();
        }
        
        return responseJSON({ 
          status: "success", 
          hasFile: hasFile, 
          fileUrl: fileUrl, 
          fileName: fileName 
        });
        
      } catch(err) {
        Logger.log("Error in check_ledger: " + err.toString());
        return responseJSON({ 
          status: "error", 
          message: err.toString(),
          hasFile: false
        });
      }
    }

    // --- D. UPLOAD FILE ---
    if (action === "upload") {
      try {
        if (!e.postData || !e.postData.contents) {
          return responseJSON({ status: "error", message: "No post data" });
        }
        
        var d = JSON.parse(e.postData.contents);
        
        if (!d.folderId || !d.fileName || !d.fileData) {
          return responseJSON({ status: "error", message: "Missing required fields" });
        }
        
        var targetId = (d.folderId === "LEDGER") ? LEDGER_FOLDER_ID : d.folderId;
        const folder = DriveApp.getFolderById(targetId);
        
        // Hapus file lama dengan nama yang sama
        var existingFiles = folder.getFilesByName(d.fileName);
        while (existingFiles.hasNext()) {
          var oldFile = existingFiles.next();
          oldFile.setTrashed(true);
          Logger.log("Deleted old file: " + d.fileName);
        }
        
        // Upload file baru
        var mimeType = d.mimeType || "application/pdf";
        var decodedData = Utilities.base64Decode(d.fileData);
        var blob = Utilities.newBlob(decodedData, mimeType, d.fileName);
        var newFile = folder.createFile(blob);
        
        // Set sharing
        newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        Logger.log("Uploaded file: " + d.fileName + " to folder: " + targetId);
        
        return responseJSON({ 
          status: "success", 
          url: newFile.getUrl(),
          fileName: newFile.getName(),
          fileId: newFile.getId()
        });
        
      } catch (err) {
        Logger.log("Error in upload: " + err.toString());
        return responseJSON({ 
          status: "error", 
          message: err.toString() 
        });
      }
    }

    // --- E. TAMBAH SISWA ---
    if (action === "add") {
      try {
        if (!e.postData || !e.postData.contents) {
          return responseJSON({ status: "error", message: "No post data" });
        }
        
        var p = JSON.parse(e.postData.contents);
        
        if (!p.nama) {
          return responseJSON({ status: "error", message: "Nama is required" });
        }
        
        const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
        var folderName = p.nama + " - " + (p.nis || "");
        const newFolder = parentFolder.createFolder(folderName);
        newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        var lastRow = sheet.getLastRow();
        var newNo = lastRow > 1 ? lastRow : 1;
        
        sheet.appendRow([newNo, p.nis || "", p.nama, "X AKL", newFolder.getId()]);
        
        // Auto Sort A-Z
        var dataRange = sheet.getLastRow();
        if (dataRange >= 2) {
          sheet.getRange(2, 1, dataRange - 1, 5).sort({column: 3, ascending: true});
        }
        
        Logger.log("Added student: " + p.nama);
        
        return responseJSON({ status: "success" });
        
      } catch(err) {
        Logger.log("Error in add: " + err.toString());
        return responseJSON({ 
          status: "error", 
          message: err.toString() 
        });
      }
    }

    // --- F. HAPUS SISWA ---
    if (action === "delete") {
      try {
        if (!e.postData || !e.postData.contents) {
          return responseJSON({ status: "error", message: "No post data" });
        }
        
        var p = JSON.parse(e.postData.contents);
        
        if (!p.row) {
          return responseJSON({ status: "error", message: "Row number is required" });
        }
        
        var rowNum = parseInt(p.row);
        sheet.deleteRow(rowNum);
        
        Logger.log("Deleted row: " + rowNum);
        
        return responseJSON({ status: "success" });
        
      } catch(err) {
        Logger.log("Error in delete: " + err.toString());
        return responseJSON({ 
          status: "error", 
          message: err.toString() 
        });
      }
    }

    // Action tidak dikenali
    return responseJSON({ 
      status: "error", 
      message: "Unknown action: " + action 
    });

  } catch (err) {
    Logger.log("doPost Error: " + err.toString());
    return responseJSON({ 
      status: "error", 
      message: err.toString() 
    });
  } finally {
    if (lock) {
      lock.releaseLock();
    }
  }
}

function responseJSON(obj) {
  var json = JSON.stringify(obj);
  return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
}