// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDdX6iplyIuYevuh6Ceyd7SMRZWmZy8pqY",
    authDomain: "bim-operations.firebaseapp.com",
    databaseURL: "https://bim-operations-default-rtdb.firebaseio.com",
    projectId: "bim-operations",
    storageBucket: "bim-operations.firebasestorage.app",
    messagingSenderId: "601649835431",
    appId: "1:601649835431:web:da5fd50f5f6dfb330d5a82",
    measurementId: "G-JKY20T7HDR"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.database();

// Global Variables
let defaultLfdTeams = [];
for(let i = 1; i <= 150; i++) { defaultLfdTeams.push(`Team ${i}`); }
let lfdTeams = JSON.parse(localStorage.getItem('bim_lfd_teams')) || defaultLfdTeams;
lfdTeams = [...new Set([...lfdTeams, ...defaultLfdTeams])];

let defaultMoveInTeams = [];
for(let i = 1; i <= 150; i++) { defaultMoveInTeams.push(`Team ${i}`); }
let moveInTeams = JSON.parse(localStorage.getItem('bim_movein_teams')) || defaultMoveInTeams;
moveInTeams = [...new Set([...moveInTeams, ...defaultMoveInTeams])];

let currentSection = 'lfd';
let cloudStore = {};
let chatMessagesStore = {};
let todayFormatted = new Date().toISOString().split('T')[0];

// 📱 دیاریکردنی جۆری مۆبایل و ئامێر
function getDeviceInfo() {
    const ua = navigator.userAgent;
    if (/android/i.test(ua)) return "📱 Android Mobile";
    if (/iPhone|iPad|iPod/i.test(ua)) return "🍎 iOS Device (iPhone/iPad)";
    if (/Win/i.test(ua)) return "💻 Windows PC";
    if (/Mac/i.test(ua)) return "💻 Mac Computer";
    return "📱/💻 Unknown Device";
}

// Notifications System
function showNotification(message, type = 'success') {
    const container = document.getElementById('toast-container') || document.body;
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white; padding: 10px 20px; border-radius: 10px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.4); font-size: 12px; font-weight: 600;
        transition: opacity 0.3s ease; opacity: 1; z-index: 99999; backdrop-filter: blur(8px);
    `;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// UI Refresh
function refreshData() {
    const btn = document.getElementById('btnRefreshMain');
    if (btn) btn.classList.add('spinning');
    
    db.ref(`operations_data/${currentSection}/${todayFormatted}`).once('value')
        .then((snapshot) => {
            cloudStore = snapshot.val() || {};
            renderAdminAuditLogs();
            showNotification("داتاکان نوێکرانەوە!");
        })
        .catch(err => {
            showNotification("کێشە لە نوێکردنەوە: " + err.message, 'error');
        })
        .finally(() => {
            if (btn) setTimeout(() => btn.classList.remove('spinning'), 600);
        });
}

// Section Switching
function switchSection(sec) {
    currentSection = sec;
    document.getElementById('tabLFD')?.classList.remove('active');
    document.getElementById('tabMoveIn')?.classList.remove('active');
    document.getElementById('tabChat')?.classList.remove('active');
    
    let mainWrapper = document.getElementById('operationsMainWrapper');
    let chatContainer = document.getElementById('chatSectionContainer');

    if (sec === 'chat') {
        document.getElementById('tabChat')?.classList.add('active');
        if (mainWrapper) mainWrapper.style.display = 'none';
        if (chatContainer) chatContainer.classList.add('active');
        renderChatMessages();
        return;
    } else {
        if (mainWrapper) mainWrapper.style.display = 'block';
        if (chatContainer) chatContainer.classList.remove('active');
    }

    if (sec === 'lfd') {
        document.getElementById('tabLFD')?.classList.add('active');
    } else {
        document.getElementById('tabMoveIn')?.classList.add('active');
    }
    renderCasesGrid();
    populateTeamDropdown();
    listenToRealtimeLogs();
}

// Grid Render
function renderCasesGrid() {
    let container = document.getElementById('casesGridContainer');
    if (!container) return;
    if (currentSection === 'lfd') {
        container.innerHTML = `
            <div class="case-item">Paid <input type="number" id="c_paid" min="0" placeholder="0"></div>
            <div class="case-item">Disconnected <input type="number" id="c_disc" min="0" placeholder="0"></div>
            <div class="case-item">Reconnected <input type="number" id="c_reconn" min="0" placeholder="0"></div>
            <div class="case-item">Distribution <input type="number" id="c_dist" min="0" placeholder="0"></div>
            <div class="case-item">Special <input type="number" id="c_special" min="0" placeholder="0"></div>
            <div class="case-item">Tampered <input type="number" id="c_tampered" min="0" placeholder="0"></div>
            <div class="case-item">Denied <input type="number" id="c_denied" min="0" placeholder="0"></div>
            <div class="case-item">NotFound <input type="number" id="c_notfound" min="0" placeholder="0"></div>
            <div class="case-item">Inaccessible <input type="number" id="c_inaccess" min="0" placeholder="0"></div>
            <div class="case-item" style="grid-column: span 3;">Other <input type="number" id="c_other" min="0" placeholder="0"></div>
        `;
    } else if (currentSection === 'movein') {
        container.innerHTML = `
            <div class="case-item">Inst. Meter <input type="number" id="c_inst_meter" min="0" placeholder="0"></div>
            <div class="case-item">Inst. Encl <input type="number" id="c_inst_encl" min="0" placeholder="0"></div>
            <div class="case-item">3P Encl <input type="number" id="c_inst_3p" min="0" placeholder="0"></div>
            <div class="case-item">BIM Team <input type="number" id="c_bim_team" min="0" placeholder="0"></div>
            <div class="case-item">Other Team <input type="number" id="c_other_team" min="0" placeholder="0"></div>
        `;
    }
}

function populateTeamDropdown() {
    let teamSelect = document.getElementById('teamSelect');
    let teamsList = currentSection === 'lfd' ? lfdTeams : moveInTeams;

    let html = `<option value="">-- تیم هەڵبژێرە --</option>`;
    teamsList.forEach(t => { html += `<option value="${t}">${t}</option>`; });
    if (teamSelect) teamSelect.innerHTML = html;
}

// 📤 ناردنی فۆڕم و تۆمارکردنی زانیاری ئامێر
function submitMainForm() {
    let team = document.getElementById('teamSelect')?.value;
    if (!team) {
        showNotification("تکایە سەرەتا تیم هەڵبژێرە!", 'error');
        return;
    }

    let casesData = {};
    if (currentSection === 'lfd') {
        casesData = {
            paid: parseInt(document.getElementById('c_paid')?.value) || 0,
            disconnected: parseInt(document.getElementById('c_disc')?.value) || 0,
            reconnected: parseInt(document.getElementById('c_reconn')?.value) || 0,
            distribution: parseInt(document.getElementById('c_dist')?.value) || 0,
            special: parseInt(document.getElementById('c_special')?.value) || 0,
            tampered: parseInt(document.getElementById('c_tampered')?.value) || 0,
            denied: parseInt(document.getElementById('c_denied')?.value) || 0,
            notFound: parseInt(document.getElementById('c_notfound')?.value) || 0,
            inaccessible: parseInt(document.getElementById('c_inaccess')?.value) || 0,
            other: parseInt(document.getElementById('c_other')?.value) || 0
        };
    } else {
        casesData = {
            instMeter: parseInt(document.getElementById('c_inst_meter')?.value) || 0,
            instEncl: parseInt(document.getElementById('c_inst_encl')?.value) || 0,
            inst3p: parseInt(document.getElementById('c_inst_3p')?.value) || 0,
            bimTeam: parseInt(document.getElementById('c_bim_team')?.value) || 0,
            otherTeam: parseInt(document.getElementById('c_other_team')?.value) || 0
        };
    }

    let deviceInfo = getDeviceInfo();
    let timeLogged = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    let entryData = {
        team: team,
        section: currentSection,
        device: deviceInfo,
        cases: casesData,
        date: todayFormatted,
        time: timeLogged,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    };

    let newLogRef = db.ref(`operations_data/${currentSection}/${todayFormatted}/${team}`).push();
    
    newLogRef.set(entryData)
        .then(() => {
            showNotification(`ڕاپۆرت بە سەرکەوتوویی نێردرا! (${deviceInfo})`);
            clearFormInputs();
        })
        .catch((error) => {
            showNotification("کێشە لە ناردنی داتا: " + error.message, 'error');
        });
}

function clearFormInputs() {
    let inputs = document.querySelectorAll('#casesGridContainer input');
    inputs.forEach(input => input.value = '');
}

// 📊 نیشاندانی لۆگی ئامێرەکان تەنها لە بەشی ئەدمین (Admin Panel)
function listenToRealtimeLogs() {
    db.ref(`operations_data/${currentSection}/${todayFormatted}`).on('value', (snapshot) => {
        cloudStore = snapshot.val() || {};
        renderAdminAuditLogs();
    });
}

function renderAdminAuditLogs() {
    let logContainer = document.getElementById('adminLogsList');
    if (!logContainer) return;

    let html = '';
    let hasLogs = false;

    Object.keys(cloudStore).forEach(teamName => {
        let teamEntries = cloudStore[teamName];
        Object.keys(teamEntries).forEach(logId => {
            hasLogs = true;
            let log = teamEntries[logId];
            html += `
                <div class="leaderboard-item" style="background: rgba(255,255,255,0.03); padding: 8px; border-radius: 8px; border: 1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; font-size:11px;">
                        <strong>👥 ${log.team}</strong>
                        <span style="color: var(--primary); font-weight: bold;">${log.device}</span>
                    </div>
                    <div style="font-size: 10px; opacity: 0.7; margin-top: 4px; display: flex; justify-content: space-between;">
                        <span>⏰ کات: ${log.time}</span>
                        <span>بەش: ${log.section ? log.section.toUpperCase() : ''}</span>
                    </div>
                </div>
            `;
        });
    });

    if (!hasLogs) {
        logContainer.innerHTML = `<p style="text-align:center; opacity:0.5; font-size:11px; padding:10px;">هیچ لۆگێکی نێردراو بۆ ئەمڕۆ نییە.</p>`;
    } else {
        logContainer.innerHTML = html;
    }
}

// Chat Functionalities
function sendChatMessage() {
    let input = document.getElementById('chatMessageInput');
    let text = input.value.trim();
    if (!text) return;

    let deviceInfo = getDeviceInfo();
    let chatObj = {
        username: deviceInfo,
        text: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: todayFormatted
    };
    db.ref('chat_messages').push(chatObj).then(() => { input.value = ''; });
}

function renderChatMessages() {
    let area = document.getElementById('chatMessagesArea');
    if (!area) return;
    let keys = Object.keys(chatMessagesStore);
    if (keys.length === 0) {
        area.innerHTML = `<p style="text-align:center; opacity:0.6; margin-top: 20px; font-size: 11px;">هیچ پەیامێک لە چاتدا نییە.</p>`;
        return;
    }
    let html = '';
    keys.forEach(key => {
        let msg = chatMessagesStore[key];
        html += `
            <div class="chat-msg-bubble" style="background: rgba(255,255,255,0.05); padding: 8px; border-radius: 8px; margin-bottom: 6px;">
                <div style="display:flex; justify-content:space-between; font-size: 10px; color: var(--primary);">
                    <span>${msg.username}</span>
                    <span style="opacity: 0.6;">${msg.timestamp}</span>
                </div>
                <p style="word-break: break-word; font-size: 11px; margin-top: 4px;">${msg.text}</p>
            </div>
        `;
    });
    area.innerHTML = html;
    area.scrollTop = area.scrollHeight;
}

db.ref('chat_messages').limitToLast(50).on('value', (snapshot) => {
    chatMessagesStore = snapshot.val() || {};
    if (document.getElementById('tabChat')?.classList.contains('active')) {
        renderChatMessages();
    }
});

// CSV to KML Converter
function convertExcelToKml() {
    let fileInput = document.getElementById('csvFileForKml');
    if (!fileInput || !fileInput.files.length) return alert("تکایە فایلی CSV هەڵبژێرە!");

    let file = fileInput.files[0];
    let reader = new FileReader();

    reader.onload = function (e) {
        let text = e.target.result;
        let lines = text.split(/\r\n|\n/);
        let kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>`;
        let kmlFooter = `\n</Document>\n</kml>`;
        let kmlBody = '';

        for (let i = 1; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line) continue;
            let cols = line.split(',');
            if (cols.length >= 3) {
                let name = cols[0].trim().replace(/"/g, '');
                let lat = parseFloat(cols[1].trim());
                let lng = parseFloat(cols[2].trim());
                if (!isNaN(lat) && !isNaN(lng)) {
                    kmlBody += `
  <Placemark>
    <name>${name}</name>
    <Point>
      <coordinates>${lng},${lat},0</coordinates>
    </Point>
  </Placemark>`;
                }
            }
        }

        if (!kmlBody) {
            alert("هیچ داتایەکی دروست نادۆزرایەوە!");
            return;
        }

        let blob = new Blob([kmlHeader + kmlBody + kmlFooter], { type: 'application/vnd.google-earth.kml+xml' });
        let link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = file.name.replace(/\.[^/.]+$/, "") + '.kml';
        link.click();
        showNotification("فایلی KML دروستکرا!");
    };

    reader.readAsText(file);
}

// Startup
window.onload = function() {
    renderCasesGrid();
    populateTeamDropdown();
    listenToRealtimeLogs();
};
