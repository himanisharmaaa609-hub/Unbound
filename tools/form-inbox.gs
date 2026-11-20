/**
 * UNBOUND website form inbox: a Google Apps Script web app.
 * weunbound.com sends its contact form, newsletter sign-ups and booking notices here.
 * Each one is saved to a Google Sheet ("UNBOUND website messages" in your Drive)
 * and emailed to INBOX. Set-up steps are in the README, under "Forms".
 */
const INBOX = 'connect@weunbound.com';

function doPost(e) {
  try {
    const d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.website) return reply_({ ok: true }); // hidden field that only spam bots fill in
    const type = text_(d.type || 'message', 40);
    const email = text_(d.email, 200);
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    if ((type === 'contact' || type === 'subscribe') && !emailOk) return reply_({ ok: false, error: 'invalid email' });

    let subject, rows;
    if (type === 'contact') {
      subject = 'New message · ' + text_(d.name, 100) + (d.company ? ' · ' + text_(d.company, 100) : '');
      rows = [['Name', d.name], ['Email', email], ['Company', d.company || 'not given'], ['Message', d.message]];
    } else if (type === 'subscribe') {
      subject = 'New subscriber · ' + email;
      rows = [['Email', email], ['Signed up from', d.source === 'popup' ? 'pop-up' : 'page section']];
    } else if (type === 'booking') {
      subject = 'Booking opened · ' + text_(d.slotLabel, 200);
      rows = [['Time picked', d.slotLabel], ['Visitor time zone', d.visitorTz]];
    } else {
      subject = 'Website form · ' + type;
      rows = [['Details', JSON.stringify(d)]];
    }
    rows.push(['Page', d.page]);

    save_(type, d, email, rows); // saved first, so nothing is lost even if the email fails
    try {
      const opts = {
        to: INBOX, subject: subject, name: 'UNBOUND website',
        body: rows.map((r) => r[0] + ': ' + text_(r[1], 5000)).join('\n\n'),
        htmlBody: '<table cellpadding="6" style="font-family:Arial,sans-serif;font-size:14px">' +
          rows.map((r) => '<tr><td valign="top" style="color:#6D6D74;white-space:nowrap">' + esc_(r[0]) + '</td><td>' +
            esc_(text_(r[1], 5000)).replace(/\n/g, '<br>') + '</td></tr>').join('') + '</table>',
      };
      if (emailOk) opts.replyTo = email; // "Reply" goes straight to the visitor
      MailApp.sendEmail(opts);
    } catch (mailErr) {
      console.error('Email not sent; the message is still in the sheet. ' + mailErr);
    }
    return reply_({ ok: true });
  } catch (err) {
    return reply_({ ok: false, error: String((err && err.message) || err) });
  }
}

// Opening the web app address in a browser shows this, so you can check it is running.
function doGet() {
  return ContentService.createTextOutput('The UNBOUND website form inbox is running.');
}

// Run once from the editor: it asks for permission, creates the sheet and sends INBOX a test email.
function setup() {
  const sh = sheet_();
  MailApp.sendEmail(INBOX, 'UNBOUND website form is connected',
    'Messages from the weunbound.com forms will arrive here. Every one is also saved in this sheet:\n' + sh.getParent().getUrl());
}

function save_(type, d, email, rows) {
  const details = type === 'contact' ? '' :
    rows.filter((r) => r[0] !== 'Email' && r[0] !== 'Page').map((r) => r[0] + ': ' + text_(r[1], 500)).join(' · ');
  sheet_().appendRow([new Date()].concat([type, d.name, email, d.company, d.message, details, d.page].map(cell_)));
}

function sheet_() {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty('SHEET_ID');
    if (id) {
      try { return SpreadsheetApp.openById(id).getSheets()[0]; } catch (e) { /* deleted: make a new one */ }
    }
    const ss = SpreadsheetApp.create('UNBOUND website messages');
    const sh = ss.getSheets()[0];
    sh.appendRow(['Received', 'Type', 'Name', 'Email', 'Company', 'Message', 'Details', 'Page']);
    sh.setFrozenRows(1);
    props.setProperty('SHEET_ID', ss.getId());
    return sh;
  } finally {
    lock.releaseLock();
  }
}

function text_(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 500); }
function cell_(v) { const s = text_(v, 5000); return /^[=+\-@]/.test(s) ? "'" + s : s; } // never run a message as a formula
function esc_(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
function reply_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
