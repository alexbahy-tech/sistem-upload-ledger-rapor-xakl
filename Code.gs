// =======================================================
// 1. KONFIGURASI SISTEM (JANGAN UBAH ID DI SINI)
// =======================================================
const CONFIG = {
  // ID Spreadsheet Database Siswa
  SHEET_ID: "1vnBRC-DQ05mix6ryjMdg8hmVKpZk2GqJXTuB0oiPFik", 
  
  // Nama Sheet/Tab di Spreadsheet
  SHEET_NAME: "Sheet1",
  
  // Folder Induk (Tempat folder siswa dibuat otomatis)
  PARENT_FOLDER_ID: "1Og56eOesHTBCJhwTKhAGMYwAJpyAvFHA",
  
  // Folder Khusus Ledger (Pusat Data)
  LEDGER_FOLDER_ID: "11rV1PEUjZT4VqIU-UMcEJPAzTDNyJ42_"
};

// =======================================================
// 2. API GATEWAY (Penghubung GitHub & Google Script)
// =======================================================

/**
 * Handle Request GET (Biasanya untuk mengambil data / cek status)
 */
function doGet(e) {
  return handleRequest(e, true);
}

/**
 * Handle Request POST (Biasanya untuk Upload / Simpan Data)
 */
function doPost(e) {
  return handleRequest(e, false);
}

/**
 * Fungsi Utama Pengelola Request
 */
function handleRequest(e, isGet) {
  const lock = LockService.getScriptLock();
  // Kunci script 30 detik agar tidak bentrok saat banyak user akses
  lock.tryLock(30000); 

  try {
    let action = "";
    let data = {};

    // 1. Parsing Data Masuk
    if (isGet) {
      // Data dari URL Parameter
      action = e.parameter.action;
      data = e.parameter; 
    } else if (e.postData && e.postData.contents) {
      // Data dari Body JSON (Fetch)
      const body = JSON.parse(e.postData.contents);
      action = body.action;
      data = body;
    }

    let result;

    // 2. Arahkan ke Fungsi yang Sesuai
    switch (action) {
      case "read":
        result = getAllStudents();
        break;
      case "checkStatus":
        // Cek folder siswa atau folder ledger
        result = checkFolderStatus(data.folderId);
        break;
      case "add":
        result = addStudent(data);
        break;
      case "delete":
        result = deleteStudent(data.row);
        break;
      case "upload":
        result = uploadFileToDrive(data);
        break;
      default:
        result = { status: "error", message: "Action tidak dikenal: " + action };
    }

    // 3. Kembalikan Hasil JSON
    return responseJSON(result);

  } catch (err) {
    return responseJSON({ status: "error", message: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// =======================================================
// 3. LOGIKA BISNIS (CORE FUNCTIONS)
// =======================================================

/**
 * Helper: Format output jadi JSON
 */
function responseJSON(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 1. Ambil Semua Data Siswa dari Spreadsheet
 */
function getAllStudents() {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const lastRow = sheet.getLastRow();
  
  if (lastRow < 2) return []; // Belum ada data
  
  // Ambil data baris 2 s.d. terakhir, kolom 1 s.d. 5
  // Format Kolom: [No, NIS, Nama, Kelas, FolderID]
  const values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  
  // Ubah Array Excel jadi Object JSON yang rapi
  return values.map((row, i) => ({
    row: i + 2,         // Disimpan untuk referensi saat menghapus
    no: row[0],
    nis: row[1],
    nama: row[2],
    kelas: row[3],
    folderId: row[4]    // ID Folder Drive Siswa
  }));
}

/**
 * 2. Cek Isi Folder (Bisa Folder Siswa atau Folder Ledger)
 */
function checkFolderStatus(folderId) {
  if (!folderId) return { status: "error", message: "Folder ID Kosong" };

  // LOGIKA KHUSUS: Jika Frontend kirim "LEDGER", ganti ke ID Ledger Asli
  const targetId = (folderId === "LEDGER") ? CONFIG.LEDGER_FOLDER_ID : folderId;
  
  try {
    const folder = DriveApp.getFolderById(targetId);
    const files = folder.getFiles();
    
    let fileList = [];
    let hasRapor = false;
    let hasIdentitas = false;

    while (files.hasNext()) {
      let f = files.next();
      let name = f.getName();
      let lowerName = name.toLowerCase();

      // OTOMATIS: Set file jadi Public (Anyone with link view)
      f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

      // Deteksi Kata Kunci
      if (lowerName.includes("rapor")) hasRapor = true;
      if (lowerName.includes("identitas")) hasIdentitas = true;

      fileList.push({ 
        name: name, 
        url: f.getUrl(),
        id: f.getId()
      });
    }

    return { 
      status: "success", 
      hasRapor: hasRapor, 
      hasIdentitas: hasIdentitas, 
      files: fileList,
      totalFiles: fileList.length // Untuk statistik dashboard
    };
  } catch (e) {
    return { status: "error", message: "Gagal cek folder: " + e.message };
  }
}

/**
 * 3. Tambah Siswa Baru & Buat Folder
 */
function addStudent(data) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  const parentFolder = DriveApp.getFolderById(CONFIG.PARENT_FOLDER_ID);
  
  // Buat Folder di Google Drive
  const folderName = `${data.nama} - ${data.nis}`;
  const newFolder = parentFolder.createFolder(folderName);
  newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  // Tambah baris baru di Spreadsheet
  const lastRow = sheet.getLastRow();
  const newNo = lastRow < 2 ? 1 : lastRow; // Nomor urut sederhana
  
  sheet.appendRow([newNo, data.nis, data.nama, "X AKL", newFolder.getId()]);
  
  // Auto Sort berdasarkan Nama (Opsional)
  if (sheet.getLastRow() >= 2) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).sort({column: 3, ascending: true});
  }
  
  return { status: "success" };
}

/**
 * 4. Hapus Siswa (Hapus baris Excel)
 */
function deleteStudent(row) {
  const ss = SpreadsheetApp.openById(CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONFIG.SHEET_NAME);
  
  // Hapus baris (Note: Folder di Drive tidak dihapus demi keamanan data)
  sheet.deleteRow(parseInt(row));
  return { status: "success" };
}

/**
 * 5. Upload File (Support Siswa & Ledger)
 */
function uploadFileToDrive(data) {
  try {
    let targetId;

    // PILIH FOLDER TUJUAN
    if (data.folderId === "LEDGER") {
      targetId = CONFIG.LEDGER_FOLDER_ID; // Masuk folder Ledger
    } else {
      targetId = data.folderId; // Masuk folder Siswa
    }

    const folder = DriveApp.getFolderById(targetId);
    
    // CEK DUPLIKAT: Hapus file lama dengan nama sama agar tidak menumpuk
    const existing = folder.getFilesByName(data.fileName);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    // PROSES UPLOAD BASE64
    const decoded = Utilities.base64Decode(data.fileData);
    const blob = Utilities.newBlob(decoded, data.mimeType, data.fileName);
    const file = folder.createFile(blob);
    
    // Set Permission
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { 
      status: "success", 
      url: file.getUrl(),
      name: file.getName()
    };

  } catch (e) {
    return { status: "error", message: "Gagal Upload: " + e.message };
  }
}