const PDFDocument = require('pdfkit');

/**
 * Renders the actual downloadable certificate PDF — the mockups' "Download
 * PDF" buttons were a plain `alert('Downloading…')` with nothing behind
 * them; this is the real thing. Landscape A4. Reads CertificateSettings
 * (signatory name/designation — already a real model, wired up from the
 * admin Settings page's "Certificate Signatory" section) for the signature
 * line, falling back to sensible defaults if that hasn't been configured
 * yet — same "works today, looks better once configured" pattern as
 * GEMINI_API_KEY / DO_SPACES_* / GOOGLE_DRIVE_* before it.
 *
 * TEMPLATE MODE: if a template is resolved for this certificate (see
 * `cert.templateImage` below — set by the caller from either
 * Application.certificateTemplateId's CertificateTemplate, for an
 * already-issued certificate, or CertificateSettings.activeTemplateId, when
 * issuing a new one; see utils/certificateData.js), that image is drawn as
 * the full-page background via PDFKit's doc.image(), and the template's
 * own design is treated as the *entire* visual — logos, border pattern,
 * title text, medal/ribbon, QR code, and signature block are all baked
 * into that image. Only 4 fields are overlaid on top, at fixed coordinates
 * measured against the reference design: the volunteer's name, the issue
 * date, the certificate ID, and the "Verify at sankalptaru.org/verify/…"
 * line (redrawn since the URL itself is per-certificate even when its
 * static surrounding text is part of the base image). There is no
 * opportunityTitle/track/signatory overlay in this mode — these designs
 * have no place for them.
 *
 * MULTI-LAYOUT: different template images place those 4 fields at
 * different coordinates/colors, so each CertificateTemplate carries a
 * `layout` key (+ optional `palette`) selecting one entry in LAYOUTS below.
 * This is a fixed-position overlay tuned to specific template images, not
 * a WYSIWYG editor — a differently laid-out admin template needs a new
 * LAYOUTS entry with coordinates re-measured by hand (see each layout's own
 * comment for how those numbers were derived).
 *
 * No template resolved => falls back to the original fully drawn-from-shapes
 * design below, built entirely from drawn shapes + text so no image assets
 * are needed. This remains the true fallback for installs that have never
 * configured any certificate template at all.
 *
 * colors match the app's own design tokens (AdminShell.css / VolunteerShell.css
 * :root), so a downloaded certificate looks like it belongs to the same product.
 *
 * Two ways to get this PDF out of PDFKit, both built on the same
 * drawCertificate() drawing routine so there's exactly one place that draws
 * a certificate:
 *   - streamCertificatePdf(res, cert): pipes straight to an Express response
 *     (the existing "Download PDF" button's endpoint).
 *   - generateCertificatePdfBuffer(cert): resolves a Buffer instead, for
 *     attaching the same PDF to an outgoing email (utils/mailer.js) — SES
 *     needs the whole file as an attachment, not a stream to a live HTTP
 *     response that doesn't exist in that context.
 */

const COLOR = {
  forest: '#1F6B52',
  deep: '#16423C',
  beige: '#F5F1E8',
  gold: '#D8B75C',
  gray: '#6b7280',
  grayLight: '#9ca3af',
};

// Hand-measured overlay coordinates, one entry per template design. All
// coordinates are in PDFKit pt-space (A4 landscape, 841.89 x 595.28pt),
// derived from pixel measurements on a 3508x2480px (300dpi) rasterization
// of each reference image by dividing by 4.1667 (300dpi / 72dpi).
const LAYOUTS = {
  // The original admin-uploaded template (Certificate_of_Volunteering02.pdf).
  // Single color scheme baked into the coordinates themselves (no palette).
  layoutA: {
    name: { cx: null, y: 312.5, fontSize: 31, color: '#02301F', uppercase: true, centered: true, width: 'full' },
    issued: { x: 162, y: 506.2, fontSize: 13, color: '#0B2027' },
    certid: { x: 193, y: 525.4, fontSize: 12, color: '#0B2027' },
    verify: { x: 126, y: 544.6, fontSize: 4.8, color: '#364650' },
  },
  // The Cr01/Cr02/Cr03 template family — one shared coordinate set
  // (measured on Cr01) reused by all three, since pixel-diffing confirmed
  // Cr02 and Cr03 share Cr01's exact text positions and only their
  // background artwork/color differs. Two color variants cover the two
  // background tones: 'light' for Cr01 (dark text on a light background),
  // 'dark' for Cr02/Cr03 (light/gold text on a dark green background).
  layoutB: {
    name: { cx: 432, y: 272.4, fontSize: 26.4, uppercase: true, centered: true },
    issued: { x: 128.4, y: 504.7, fontSize: 13.92 },
    certid: { x: 159.1, y: 522.7, fontSize: 14.88 },
    verify: { x: 91.5, y: 542.4, fontSize: 10.08, font: 'Helvetica' },
    palettes: {
      light: { name: '#0A6846', value: '#0C2027', verify: '#35464D' },
      dark: { name: '#EFF2F7', value: '#FFECAA', verify: '#CEE1DB' },
    },
  },
};

function drawCertificate(doc, cert) {
  const {
    certificateId,
    volunteerName,
    opportunityTitle,
    track,
    issuedAt,
    signatoryName,
    signatoryDesignation,
    // Resolved by the caller (utils/certificateData.js) — the actual
    // template image + layout/palette to render with. `certificateTemplate`
    // (legacy: a bare base64 string, always layoutA) is still accepted for
    // any caller that hasn't been updated to pass the richer shape yet.
    templateImage,
    templateLayout,
    templatePalette,
    certificateTemplate,
  } = cert;

  const W = doc.page.width;
  const H = doc.page.height;

  // Always re-derives x from the box's own width so the box stays centered
  // on the page no matter what width a caller passes in — a fixed x=70 with
  // an overridden (narrower) width would shrink the box from the right edge
  // only, silently pulling that one line off-center relative to every other
  // line still using the default width (exactly the bug that shipped here:
  // opportunityTitle's `{ width: W - 220 }` override left everything else
  // correctly centered but visibly dragged the opportunity title left).
  const centered = (text, y, opts = {}) => {
    const width = opts.width !== undefined ? opts.width : W - 140;
    const x = (W - width) / 2;
    doc.text(text, x, y, { ...opts, width, align: 'center' });
  };

  const resolvedImage = templateImage || certificateTemplate || null;
  const resolvedLayout = templateLayout || (resolvedImage ? 'layoutA' : null);

  let usingTemplate = false;
  if (typeof resolvedImage === 'string' && resolvedImage.startsWith('data:image/') && LAYOUTS[resolvedLayout]) {
    try {
      const base64 = resolvedImage.slice(resolvedImage.indexOf(',') + 1);
      const imageBuffer = Buffer.from(base64, 'base64');
      doc.image(imageBuffer, 0, 0, { width: W, height: H });
      usingTemplate = true;
    } catch (err) {
      usingTemplate = false;
    }
  }

  if (usingTemplate) {
    const layout = LAYOUTS[resolvedLayout];
    const palette = layout.palettes ? layout.palettes[templatePalette] || layout.palettes.light : null;

    const nameColor = palette ? palette.name : layout.name.color;
    const valueColor = palette ? palette.value : null;
    const verifyColor = palette ? palette.verify : layout.verify.color;

    const issuedText = new Date(issuedAt).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // Volunteer name — bold, centered, uppercase (matches every reference
    // design's placeholder styling).
    const nameText = layout.name.uppercase ? String(volunteerName || '').toUpperCase() : String(volunteerName || '');
    doc.fillColor(nameColor).font('Helvetica-Bold').fontSize(layout.name.fontSize);
    if (layout.name.cx != null) {
      const nameWidth = doc.widthOfString(nameText);
      doc.text(nameText, layout.name.cx - nameWidth / 2, layout.name.y, { lineBreak: false });
    } else {
      centered(nameText, layout.name.y, { width: W, lineBreak: false });
    }

    // Issued date value.
    doc.fillColor(valueColor || layout.issued.color).font('Helvetica-Bold').fontSize(layout.issued.fontSize);
    doc.text(issuedText, layout.issued.x, layout.issued.y, { lineBreak: false });

    // Certificate ID value.
    doc.fillColor(valueColor || layout.certid.color).font('Helvetica-Bold').fontSize(layout.certid.fontSize);
    doc.text(certificateId, layout.certid.x, layout.certid.y, { lineBreak: false });

    // Verify line — the label text around it is static/baked into the
    // template image, but the URL itself is per-certificate so the whole
    // line is redrawn here, directly over the (removed) original. Drawn as
    // two pieces (not one string) so the URL specifically can carry its
    // own underline + a real clickable PDF link — "Verify at" itself stays
    // plain, same as how an inline link normally reads.
    doc.fillColor(verifyColor).font(layout.verify.font || 'Helvetica').fontSize(layout.verify.fontSize);
    const verifyPrefix = 'Verify at ';
    const verifyUrlText = `sankalptaru.org/verify/${certificateId}`;
    const verifyPrefixWidth = doc.widthOfString(verifyPrefix);
    const verifyUrlWidth = doc.widthOfString(verifyUrlText);
    const verifyUrlX = layout.verify.x + verifyPrefixWidth;
    doc.text(verifyPrefix, layout.verify.x, layout.verify.y, { lineBreak: false });
    // A tiny bit of slack beyond the string's own measured width — PDFKit's
    // word-wrap treats a hyphen as a soft break point, so a `width` set to
    // the EXACT rendered width (no margin) can wrap a hyphenated URL like
    // this one onto a second line even though it visually fits on one.
    doc.text(verifyUrlText, verifyUrlX, layout.verify.y, { lineBreak: false, underline: true, width: verifyUrlWidth + 15 });
    // Drawn as an explicit annotation rather than text()'s own `link`
    // option — combined with lineBreak:false, that option fails to size
    // its own link rectangle (PDFKit tries to read a rendered-width value
    // that's never set on this code path and throws "unsupported number:
    // NaN"). A manual doc.link() over the same box PDFKit just drew avoids
    // that entirely.
    doc.link(verifyUrlX, layout.verify.y, verifyUrlWidth, doc.currentLineHeight(), `https://sankalptaru.org/verify/${certificateId}`);

    return;
  }

  // Background + double border frame.
  doc.rect(0, 0, W, H).fill(COLOR.beige);
  doc.lineWidth(2.5).rect(22, 22, W - 44, H - 44).stroke(COLOR.gold);
  doc.lineWidth(1).rect(34, 34, W - 68, H - 68).stroke(COLOR.forest);

  // Decorative corner circles, echoing the app's card visuals (.cert-visual::before/::after).
  doc.save();
  doc.opacity(0.12).circle(W - 70, 70, 70).fill(COLOR.forest);
  doc.opacity(0.1).circle(70, H - 70, 55).fill(COLOR.gold);
  doc.restore();

  doc.fillColor(COLOR.deep).font('Helvetica-Bold').fontSize(12);
  centered('SANKALPTARU FOUNDATION', 66);

  doc.fillColor(COLOR.deep).font('Helvetica-Bold').fontSize(30);
  centered('Certificate of Participation', 92);

  doc.moveTo(W / 2 - 70, 134).lineTo(W / 2 + 70, 134).lineWidth(1.5).stroke(COLOR.gold);

  doc.fillColor(COLOR.gray).font('Helvetica').fontSize(13);
  centered('This certificate is proudly presented to', 152);

  doc.fillColor(COLOR.forest).font('Helvetica-Bold').fontSize(32);
  centered(volunteerName, 176);

  doc.fillColor(COLOR.gray).font('Helvetica').fontSize(13);
  centered('for successfully completing', 226);

  doc.fillColor(COLOR.deep).font('Helvetica-Bold').fontSize(18);
  centered(opportunityTitle, 248, { width: W - 220 });

  doc.fillColor(COLOR.grayLight).font('Helvetica').fontSize(10.5);
  centered(track === 'a' ? 'TRACK A · EVERGREEN VOLUNTEERING' : 'TRACK B · SKILLED VOLUNTEERING', 292);

  // Medal seal — no logo image available, so this is drawn entirely from
  // vector shapes (a real emoji/glyph like 🏅 isn't reliably renderable in
  // a PDF's built-in Helvetica font, which is why one doesn't appear here).
  // Also fills what would otherwise be a large empty gap between the track
  // label and the footer.
  const medalCx = W / 2;
  const medalCy = 372;
  doc.polygon([medalCx - 22, medalCy - 6], [medalCx - 8, medalCy + 46], [medalCx - 2, medalCy + 10]).fill(COLOR.gold);
  doc.polygon([medalCx + 22, medalCy - 6], [medalCx + 8, medalCy + 46], [medalCx + 2, medalCy + 10]).fill(COLOR.gold);
  doc.circle(medalCx, medalCy, 30).lineWidth(3).fillAndStroke(COLOR.forest, COLOR.gold);
  doc.circle(medalCx, medalCy, 22).lineWidth(1).stroke(COLOR.beige);
  doc
    .lineWidth(3)
    .lineJoin('round')
    .moveTo(medalCx - 12, medalCy + 1)
    .lineTo(medalCx - 3, medalCy + 11)
    .lineTo(medalCx + 14, medalCy - 11)
    .stroke(COLOR.beige);

  // Footer: signature block (left) + issue details (right).
  const footerY = H - 108;

  doc.fillColor(COLOR.deep).font('Helvetica-Bold').fontSize(12);
  doc.text(signatoryName || 'Program Team', 90, footerY, { width: 220, align: 'center' });
  doc.moveTo(90, footerY + 20).lineTo(310, footerY + 20).lineWidth(1).stroke(COLOR.grayLight);
  doc.fillColor(COLOR.gray).font('Helvetica').fontSize(9.5);
  doc.text(signatoryDesignation || 'SankalpTaru Foundation', 90, footerY + 27, { width: 220, align: 'center' });

  doc.fillColor(COLOR.deep).font('Helvetica-Bold').fontSize(11);
  doc.text(
    `Issued: ${new Date(issuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`,
    W - 310,
    footerY,
    { width: 220, align: 'center' }
  );
  doc.fillColor(COLOR.gray).font('Helvetica').fontSize(9.5);
  doc.text(`Certificate ID: ${certificateId}`, W - 310, footerY + 20, { width: 220, align: 'center' });
  doc.fillColor(COLOR.grayLight).fontSize(8.5);
  {
    // Same prefix/URL split as the template-mode verify line above, so
    // this fallback design's URL is underlined + clickable too. PDFKit's
    // built-in width/align:'center' box can't easily be split into two
    // differently-styled runs, so the centered start x is computed by hand
    // here instead — same technique centered() above already uses.
    const verifyPrefix = 'Verify at ';
    const verifyUrlText = `sankalptaru.org/verify/${certificateId}`;
    const boxWidth = 220;
    const boxX = W - 310;
    const verifyUrlWidth = doc.widthOfString(verifyUrlText);
    const fullWidth = doc.widthOfString(verifyPrefix) + verifyUrlWidth;
    const startX = boxX + (boxWidth - fullWidth) / 2;
    const verifyUrlX = startX + doc.widthOfString(verifyPrefix);
    doc.text(verifyPrefix, startX, footerY + 34, { lineBreak: false });
    // Same hyphen-wrap slack as the template-mode verify line above.
    doc.text(verifyUrlText, verifyUrlX, footerY + 34, { lineBreak: false, underline: true, width: verifyUrlWidth + 15 });
    // See the template-mode verify line above for why this is a manual
    // annotation rather than text()'s own `link` option.
    doc.link(verifyUrlX, footerY + 34, verifyUrlWidth, doc.currentLineHeight(), `https://sankalptaru.org/verify/${certificateId}`);
  }
}

function streamCertificatePdf(res, cert) {
  const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 0 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${cert.certificateId}.pdf"`);
  doc.pipe(res);

  drawCertificate(doc, cert);

  doc.end();
}

// Same PDF as streamCertificatePdf, collected into a Buffer instead of piped
// to a response — for attaching to an outgoing email (utils/mailer.js),
// where there's no live `res` to pipe to.
function generateCertificatePdfBuffer(cert) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ layout: 'landscape', size: 'A4', margin: 0 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawCertificate(doc, cert);

    doc.end();
  });
}

module.exports = { streamCertificatePdf, generateCertificatePdfBuffer };
