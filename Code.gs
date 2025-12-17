// =======================================================
// 1. KONFIGURASI (WAJIB DIISI ULANG!)
// =======================================================
const SHEET_ID = "1vnBRC-DQ05mix6ryjMdg8hmVKpZk2GqJXTuB0oiPFik";     // ID Spreadsheet Anda
const SHEET_NAME = "Sheet1";                      // Nama Tab (Sheet1)
const PARENT_FOLDER_ID = "16aw4C5qTwJmNZw_FQe1Vcnm-M1xqmjbk";   // Folder Induk Data Siswa
const LEDGER_FOLDER_ID = "11rV1PEUjZT4VqIU-UMcEJPAzTDNyJ42_";  // Folder Khusus Ledger

// =======================================================
// 2. SYSTEM CODE (JANGAN DIUBAH)
// =======================================================

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('index')
      .setTitle('Sistem Rapor X AKL')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    const action = e.parameter.action;
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(SHEET_NAME);

    // --- A. BACA DATA ---
    if (!action || action === "read") {
      const lastRow = sheet.getLastRow();
      if (lastRow < 2) return responseJSON({ status: "success", data: [] });
      
      const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      const result = data.map((row, index) => ({
        row: index + 2,
        no: row[0],
        nis: row[1],
        nama: row[2],
        kelas: row[3],
        folder_id: row[4]
      }));
      return responseJSON({ status: "success", data: result });
    }

    // --- B. CEK STATUS FILE ---
    if (action === "check_status") {
      const folderId = e.parameter.folderId;
      if (!folderId) return responseJSON({ status: "error", message: "No folder ID" });
      
      try {
        const folder = DriveApp.getFolderById(folderId);
        const files = folder.getFiles();
        let hasRapor = false, hasIdentitas = false;
        let fileList = [];
        
        while (files.hasNext()) {
          const file = files.next();
          const name = file.getName();
          const nameLower = name.toLowerCase();
          
          fileList.push(name); // Log semua file
          
          // Cek apakah file mengandung kata "rapor" atau "identitas"
          if (nameLower.indexOf("rapor") !== -1) {
            hasRapor = true;
            Logger.log("Found Rapor: " + name);
          }
          if (nameLower.indexOf("identitas") !== -1) {
            hasIdentitas = true;
            Logger.log("Found Identitas: " + name);
          }
        }
        
        Logger.log("Folder ID: " + folderId);
        Logger.log("Files found: " + fileList.join(", "));
        Logger.log("Has Rapor: " + hasRapor + ", Has Identitas: " + hasIdentitas);
        
        return responseJSON({ 
          status: "success", 
          hasRapor: hasRapor, 
          hasIdentitas: hasIdentitas,
          fileCount: fileList.length,
          files: fileList
        });
      } catch (err) {
        Logger.log("Error checking status: " + err.toString());
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
      const folder = DriveApp.getFolderById(LEDGER_FOLDER_ID);
      const files = folder.getFiles();
      let hasFile = false, fileUrl = "", fileName = "";
      if (files.hasNext()) {
        const file = files.next();
        hasFile = true; fileUrl = file.getUrl(); fileName = file.getName();
      }
      return responseJSON({ status: "success", hasFile, fileUrl, fileName });
    }

    // --- D. UPLOAD FILE ---
    if (action === "upload") {
      try {
        const d = JSON.parse(e.postData.contents);
        const targetId = (d.folderId === "LEDGER") ? LEDGER_FOLDER_ID : d.folderId;
        const folder = DriveApp.getFolderById(targetId);
        
        // Hapus file lama dengan nama yang sama (untuk replace)
        const existingFiles = folder.getFilesByName(d.fileName);
        while (existingFiles.hasNext()) {
          existingFiles.next().setTrashed(true);
        }
        
        // Upload file baru
        const blob = Utilities.newBlob(Utilities.base64Decode(d.fileData), d.mimeType, d.fileName);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        
        return responseJSON({ 
          status: "success", 
          url: file.getUrl(),
          fileName: file.getName()
        });
      } catch (err) {
        return responseJSON({ 
          status: "error", 
          message: err.toString() 
        });
      }
    }

    // --- E. TAMBAH SISWA ---
    if (action === "add") {
      const p = JSON.parse(e.postData.contents);
      const parentFolder = DriveApp.getFolderById(PARENT_FOLDER_ID);
      const newFolder = parentFolder.createFolder(`${p.nama} - ${p.nis}`);
      newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      
      const lastRow = sheet.getLastRow();
      sheet.appendRow([lastRow, p.nis, p.nama, "X AKL", newFolder.getId()]);
      
      // Auto Sort A-Z
      if (sheet.getLastRow() >= 2) {
        sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).sort({column: 3, ascending: true});
      }
      return responseJSON({ status: "success" });
    }

    // --- F. HAPUS SISWA ---
    if (action === "delete") {
      const p = JSON.parse(e.postData.contents);
      sheet.deleteRow(parseInt(p.row));
      return responseJSON({ status: "success" });
    }

  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}