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
const auth = firebase.auth();

let currentUserAccount = JSON.parse(localStorage.getItem('bim_chat_user')) || null;

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
const DAILY_TARGET = 7;
const WEEKLY_TARGET = 42;
const MONTHLY_TARGET = 180;
let isAdmin = false;
let cloudStore = {};
let yesterdayStore = {};
let feedbacksStore = {};
let auditLogsStore = {};
let chatMessagesStore = {};
let mapInstance = null;

let todayFormatted = new Date().toISOString().split('T')[0];
let modalResolveCallback = null;

// Helper Notifications
function showNotification(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white; padding: 10px 16px; margin-top: 8px; border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-family: inherit; font-size: 12px;
        transition: opacity 0.3s ease; opacity: 1; z-index: 99999; backdrop-filter: blur(8px);
    `;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Authentication Handlers
function switchAuthTab(tab) {
    document.getElementById('authTabLoginBtn').classList.remove('active');
    document.getElementById('authTabRegisterBtn').classList.remove('active');
    document.getElementById('loginFormPanel').classList.remove('active');
    document.getElementById('registerFormPanel').classList.remove('active');

    if (tab === 'login') {
        document.getElementById('authTabLoginBtn').classList.add('active');
        document.getElementById('loginFormPanel').classList.add('active');
    } else {
        document.getElementById('authTabRegisterBtn').classList.add('active');
        document.getElementById('registerFormPanel').classList.add('active');
    }
}

function handleFirebaseRegister() {
    let name = document.getElementById('regUsernameInput').value.trim();
    let team = document.getElementById('regTeamSelect').value;
    let email = document.getElementById('regEmailInput').value.trim();
    let password = document.getElementById('regPasswordInput').value;

    if (!name || !team || !email || !password) {
        alert("تکایە هەموو خانەکان پڕبکەرەوە بۆ دروستکردنی ئەکاونت!");
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
        .then((userCredential) => {
            let user = userCredential.user;
            user.updateProfile({ displayName: name }).then(() => {
                currentUserAccount = { name, team, email };
                localStorage.setItem('bim_chat_user', JSON.stringify(currentUserAccount));
                document.getElementById('accountModalOverlay').style.display = 'none';
                document.getElementById('teamSelect').value = team;
                updateChatUserDisplay();
                showNotification("ئەکاونتەکەت بە سەرکەوتوویی دروستکرا و چوویتە ژوورەوە!");
            });
        })
        .catch((error) => alert("کێشە لە دروستکردنی ئەکاونت: " + error.message));
}

function handleFirebaseLogin() {
    let email = document.getElementById('loginEmailInput').value.trim();
    let password = document.getElementById('loginPasswordInput').value;

    if (!email || !password) {
        alert("تکایە ئیمەیڵ و وشەی تێپەڕ بنووسە!");
        return;
    }

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            let user = userCredential.user;
            let name = user.displayName || email.split('@')[0];
            let allTeams = [...new Set([...lfdTeams, ...moveInTeams])];
            currentUserAccount = { name, team: allTeams[0], email };
            localStorage.setItem('bim_chat_user', JSON.stringify(currentUserAccount));
            document.getElementById('accountModalOverlay').style.display = 'none';
            updateChatUserDisplay();
            showNotification("بە سەرکەوتوویی چوویتە ژوورەوە!");
        })
        .catch((error) => alert("کێشە لە چوونەژوورەوە: " + error.message));
}

function bypassAuthAsGuest() {
    currentUserAccount = { name: "میوان", team: "Guest" };
    localStorage.setItem('bim_chat_user', JSON.stringify(currentUserAccount));
    document.getElementById('accountModalOverlay').style.display = 'none';
    updateChatUserDisplay();
    showNotification("بەردەوام بوویت وەک میوان.");
}

function updateChatUserDisplay() {
    if (currentUserAccount) {
        let displayName = currentUserAccount.name === "میوان" ? "میوان" : `${currentUserAccount.name} (${currentUserAccount.team})`;
        document.getElementById('chatUserInfoDisplay').innerText = `👤 ${displayName}`;
    }
}

// Section Switching
function switchSection(sec) {
    currentSection = sec;
    document.getElementById('tabLFD').classList.remove('active');
    document.getElementById('tabMoveIn').classList.remove('active');
    document.getElementById('tabChat').classList.remove('active');
    
    let mainWrapper = document.getElementById('operationsMainWrapper');
    let chatContainer = document.getElementById('chatSectionContainer');

    if (sec === 'chat') {
        document.getElementById('tabChat').classList.add('active');
        mainWrapper.style.display = 'none';
        chatContainer.classList.add('active');
        renderChatMessages();
        return;
    } else {
        mainWrapper.style.display = 'block';
        chatContainer.classList.remove('active');
    }

    if (sec === 'lfd') {
        document.getElementById('tabLFD').classList.add('active');
    } else {
        document.getElementById('tabMoveIn').classList.add('active');
    }
    renderCasesGrid();
    populateTeamDropdown();
}

// Chat Functions
function sendChatMessage() {
    let input = document.getElementById('chatMessageInput');
    let text = input.value.trim();
    if (!text) return;
    if (!currentUserAccount) {
        document.getElementById('accountModalOverlay').style.display = 'flex';
        return;
    }
    let chatObj = {
        username: currentUserAccount.name,
        team: currentUserAccount.team,
        text: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: todayFormatted
    };
    db.ref('chat_messages').push(chatObj).then(() => { input.value = ''; });
}

function renderChatMessages() {
    let area = document.getElementById('chatMessagesArea');
    let keys = Object.keys(chatMessagesStore);
    if (keys.length === 0) {
        area.innerHTML = `<p style="text-align:center; opacity:0.6; margin-top: 20px; font-size: 11px;">هیچ پەیامێک لە چاتدا نییە.</p>`;
        return;
    }
    let html = '';
    keys.forEach(key => {
        let msg = chatMessagesStore[key];
        let isMine = currentUserAccount && msg.username === currentUserAccount.name;
        html += `
            <div class="chat-msg-bubble ${isMine ? 'my-msg' : ''}">
                <div class="chat-msg-header">
                    <span>👤 ${msg.username} (${msg.team})</span>
                    <span style="font-size: 8px; opacity: 0.6;">${msg.timestamp}</span>
                </div>
                <p style="word-break: break-word; white-space: pre-wrap;">${msg.text}</p>
            </div>
        `;
    });
    area.innerHTML = html;
    area.scrollTop = area.scrollHeight;
}

// UI Grid Generators
function renderCasesGrid() {
    let container = document.getElementById('casesGridContainer');
    if (currentSection === 'lfd') {
        container.innerHTML = `
            <div class="case-item">Paid <input type="number" id="c_paid" min="0" placeholder=""></div>
            <div class="case-item">Disconnected <input type="number" id="c_disc" min="0" placeholder=""></div>
            <div class="case-item">Reconnected <input type="number" id="c_reconn" min="0" placeholder=""></div>
            <div class="case-item">Distribution <input type="number" id="c_dist" min="0" placeholder=""></div>
            <div class="case-item">Special <input type="number" id="c_special" min="0" placeholder=""></div>
            <div class="case-item">Tampered <input type="number" id="c_tampered" min="0" placeholder=""></div>
            <div class="case-item">Denied <input type="number" id="c_denied" min="0" placeholder=""></div>
            <div class="case-item">NotFound <input type="number" id="c_notfound" min="0" placeholder=""></div>
            <div class="case-item">Inaccessible <input type="number" id="c_inaccess" min="0" placeholder=""></div>
            <div class="case-item" style="grid-column: span 3;">Other <input type="number" id="c_other" min="0" placeholder=""></div>
        `;
    } else if (currentSection === 'movein') {
        container.innerHTML = `
            <div class="case-item">Inst. Meter <input type="number" id="c_inst_meter" min="0" placeholder=""></div>
            <div class="case-item">Inst. Encl <input type="number" id="c_inst_encl" min="0" placeholder=""></div>
            <div class="case-item">3P Encl <input type="number" id="c_inst_3p" min="0" placeholder=""></div>
            <div class="case-item">BIM Team <input type="number" id="c_bim_team" min="0" placeholder=""></div>
            <div class="case-item">Other Team <input type="number" id="c_other_team" min="0" placeholder=""></div>
        `;
    }
}

function populateTeamDropdown() {
    let teamSelect = document.getElementById('teamSelect');
    let kmlTeamSelect = document.getElementById('kmlTargetTeam');
    let privateSelect = document.getElementById('privateMsgTeam');
    let teamsList = currentSection === 'lfd' ? lfdTeams : moveInTeams;
    let allTeamsCombined = [...new Set([...lfdTeams, ...moveInTeams])];

    let html = `<option value="">-- تیم هەڵبژێرە --</option>`;
    teamsList.forEach(t => { html += `<option value="${t}">${t}</option>`; });
    teamSelect.innerHTML = html;

    let kmlHtml = `<option value="">-- هەڵبژاردنی تیم --</option>`;
    allTeamsCombined.forEach(t => { kmlHtml += `<option value="${t}">${t}</option>`; });
    kmlTeamSelect.innerHTML = kmlHtml;

    let privateHtml = `<option value="">-- تیم --</option>`;
    allTeamsCombined.forEach(t => { privateHtml += `<option value="${t}">${t}</option>`; });
    privateSelect.innerHTML = privateHtml;
}

// Convert CSV file to KML
function convertExcelToKml() {
    let fileInput = document.getElementById('csvFileForKml');
    if (!fileInput.files.length) return alert("تکایە فایلی CSV هەڵبژێرە!");

    let file = fileInput.files[0];
    let reader = new FileReader();

    reader.onload = function (e) {
        let text = e.target.result;
        let lines = text.split('\n');
        let kmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>`;
        let kmlFooter = `\n</Document>\n</kml>`;
        let kmlBody = '';

        for (let i = 1; i < lines.length; i++) {
            let cols = lines[i].split(',');
            if (cols.length >= 3) {
                let name = cols[0].trim();
                let lat = cols[1].trim();
                let lng = cols[2].trim();
                if (lat && lng) {
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

        let blob = new Blob([kmlHeader + kmlBody + kmlFooter], { type: 'application/vnd.google-earth.kml+xml' });
        let link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = file.name.replace('.csv', '') + '.kml';
        link.click();
        showNotification("فایلی KML دروستکرا و داگیرا!");
    };

    reader.readAsText(file);
}

// Realtime Chat Sync
db.ref('chat_messages').limitToLast(50).on('value', (snapshot) => {
    chatMessagesStore = snapshot.val() || {};
    if (document.getElementById('tabChat').classList.contains('active')) {
        renderChatMessages();
    }
});

// App Startup Initializers
window.onload = function() {
    renderCasesGrid();
    populateTeamDropdown();
};
