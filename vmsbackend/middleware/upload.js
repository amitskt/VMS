const multer = require('multer');

// Memory storage — files land in req.file(s).buffer and go straight to
// Google Drive (utils/driveUpload.js), never touching local disk.
// 15MB covers a task's PDF/doc or a phone photo comfortably without letting
// someone upload something huge into the app.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

module.exports = upload;
