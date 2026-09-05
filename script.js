// Global Toast Notification
function showNotification(message, type = 'success') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white; padding: 10px 16px; margin-top: 8px; border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 12px; z-index: 99999;
        font-family: inherit; direction: rtl;
    `;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, 3500);
}

// Firebase Config
const firebaseConfig = {
    apiKey: "AIzaSyDdX6iplyIuYevuh6Ceyd7SMRZWmZy8pqY",
    authDomain: "bim-operations.firebaseapp.com",
    databaseURL: "https://bim-operations-default-rtdb.firebaseio.com",
    projectId: "bim-operations",
    storageBucket: "bim-operations.firebasestorage.app",
    messagingSenderId: "601649835431",
    appId: "1:601649835431:web:da5fd50f5f6dfb330d5a82"
};

if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
const db = firebase.database();

let currentSection = 'lfd';
let headerClickCount = 0;
let mapInstance = null;
let currentFilter = 'all';

// پین کۆدی ئەدمین
const ADMIN_PIN = "Razwan";

// دروستکردنی پین کۆد بۆ تیمەکانی 1 تا 150
const TEAM_PINS = {};
for (let i = 1; i <= 150; i++) {
    TEAM_PINS[`team_${i}`] = String(1000 + i);
}

// Populate Team Dropdowns
function populateTeamDropdowns() {
    const adminSelect = document.getElementById('privateMsgTeam');
    const kmlSelect = document.getElementById('kmlTargetTeam');
    const mainSelect = document.getElementById('teamSelect');

    if (adminSelect) adminSelect.innerHTML = '<option value="">-- تیم --</option>';
    if (kmlSelect) kmlSelect.innerHTML = '<option value="">-- هەڵبژاردنی تیم --</option>';
    if (mainSelect) mainSelect.innerHTML = '<option value="">-- تیم هەڵبژێرە --</option><option value="custom">✍️ نووسینی ناوی تیم بەدەست...</option>';

    for (let i = 1; i <= 150; i++) {
        const teamKey = `team_${i}`;
        const teamName = `Team ${i}`;

        if (mainSelect) {
            const opt = document.createElement('option');
            opt.value = teamKey;
            opt.textContent = teamName;
            mainSelect.appendChild(opt);
        }
        if (adminSelect) {
            const opt = document.createElement('option');
            opt.value = teamKey;
            opt.textContent = teamName;
            adminSelect.appendChild(opt);
        }
        if (kmlSelect) {
            const opt = document.createElement('option');
            opt.value = teamKey;
            opt.textContent = teamName;
            kmlSelect.appendChild(opt);
        }
    }
}

// Team Custom Input Handler
function loadTeamData() {
    const select = document.getElementById('teamSelect');
    if (select && select.value === 'custom') {
        const customName = prompt("تکایە ناوی تیمەکەت بنووسە:");
        if (customName && customName.trim()) {
            const customKey = customName.toLowerCase().replace(/\s+/g, '_');
            let exists = Array.from(select.options).some(opt => opt.value === customKey);
            if (!exists) {
                const opt = document.createElement('option');
                opt.value = customKey;
                opt.textContent = customName.trim();
                select.appendChild(opt);
            }
            select.value = customKey;
        } else {
            select.value = "";
        }
    }
}

// Admin Panel Trigger (3 Clicks)
function handleHeaderClick() {
    headerClickCount++;
    if (headerClickCount >= 3) {
        document.getElementById('customModalOverlay').style.display = 'flex';
        document.getElementById('modalTitle').innerText = "پشتڕاستکردنەوەی ئەدمین";
        document.getElementById('modalDesc').innerText = "تکایە پین کۆدی بەڕێوەبەر (Admin) بنووسە:";
        
        document.getElementById('modalConfirmBtn').onclick = () => {
            const pin = document.getElementById('customModalInput').value;
            if (pin === ADMIN_PIN) { 
                const adminPanel = document.getElementById('adminPanel');
                adminPanel.classList.toggle('active');
                showNotification('بەشی ئەدمین بە سەرکەوتوویی کرایەوە');
                closeCustomModal(true);
                loadAdminData(); // هێنانی داتای ئەدمین و لیدەربۆرد
            } else {
                showNotification('کۆدی ئەدمین هەڵەیە!', 'error');
            }
        };
        headerClickCount = 0;
    }
}

// Prompt PIN and Save Report to Firebase
function promptPinAndSave() {
    const selectedTeam = document.getElementById('teamSelect')?.value;
    if (!selectedTeam) {
        return showNotification('تکایە سەرەتا تیمەکەت هەڵبژێرە!', 'error');
    }

    const teamLabel = document.getElementById('teamSelect').options[document.getElementById('teamSelect').selectedIndex].text;

    document.getElementById('customModalOverlay').style.display = 'flex';
    document.getElementById('modalTitle').innerText = "پشتڕاستکردنەوەی تیم";
    document.getElementById('modalDesc').innerText = `تکایە پین کۆدی تایبەت بە ${teamLabel} بنووسە:`;

    document.getElementById('modalConfirmBtn').onclick = () => {
        const inputPin = document.getElementById('customModalInput').value;
        const correctPin = TEAM_PINS[selectedTeam];

        if ((correctPin && inputPin === correctPin) || inputPin === ADMIN_PIN || !correctPin) {
            closeCustomModal(true);
            saveReportToDatabase(selectedTeam, teamLabel);
        } else {
            showNotification('پین کۆدی ئەم تیمە هەڵەیە!', 'error');
        }
    };
}

function saveReportToDatabase(teamKey, teamName) {
    const isOffday = document.getElementById('c_offday')?.checked || false;
    const notes = document.getElementById('c_notes')?.value || '';
    
    let totalPoints = 0;
    const inputs = document.querySelectorAll('#casesGridContainer input');
    inputs.forEach(inp => {
        totalPoints += Number(inp.value) || 0;
    });

    const todayDate = new Date().toISOString().split('T')[0];

    db.ref(`reports/${todayDate}/${teamKey}`).set({
        teamName: teamName,
        total: totalPoints,
        offday: isOffday,
        notes: notes,
        timestamp: Date.now()
    }).then(() => {
        showNotification(`ڕاپۆرتی ${teamName} بە سەرکەوتوویی نێردرا و پاشەکەوت کرا.`);
        document.getElementById('c_notes').value = '';
        inputs.forEach(inp => inp.value = '');
        if(document.getElementById('c_offday')) document.getElementById('c_offday').checked = false;
        loadAdminData();
    }).catch(err => {
        showNotification('هەڵە ڕوویدا لە ناردنی داتا: ' + err.message, 'error');
    });
}

function closeCustomModal(clear) {
    document.getElementById('customModalOverlay').style.display = 'none';
    if(clear) document.getElementById('customModalInput').value = '';
}

// Feedback Modals
function openFeedbackModal() {
    document.getElementById('feedbackModalOverlay').style.display = 'flex';
}

function submitFeedbackFinal() {
    const author = document.getElementById('feedbackAuthor').value.trim() || 'نەناسراو';
    const text = document.getElementById('feedbackText').value.trim();
    if(!text) return showNotification('تکایە تێبینی یان پێشنیارەکەت بنووسە', 'error');

    db.ref('feedbacks').push({
        author: author,
        text: text,
        timestamp: Date.now()
    }).then(() => {
        showNotification('پێشنیارەکەت بە سەرکەوتوویی نێردرا');
        document.getElementById('feedbackText').value = '';
        document.getElementById('feedbackAuthor').value = '';
        document.getElementById('feedbackModalOverlay').style.display = 'none';
        loadAdminData();
    });
}

function openAdminFeedbackModal() {
    document.getElementById('adminFeedbackModalOverlay').style.display = 'flex';
    loadAdminFeedbacksList();
}

function loadAdminFeedbacksList() {
    db.ref('feedbacks').once('value', (snapshot) => {
        const container = document.getElementById('adminFeedbackListContent');
        if(!container) return;
        container.innerHTML = '';
        const data = snapshot.val() || {};
        let count = 0;
        Object.keys(data).forEach(key => {
            count++;
            const item = data[key];
            const div = document.createElement('div');
            div.style.cssText = "background:rgba(255,255,255,0.03); padding:8px; border-radius:8px; border:1px solid rgba(255,255,255,0.08);";
            div.innerHTML = `<strong style="color:var(--primary);">${item.author}:</strong> <p style="margin-top:4px;">${item.text}</p>`;
            container.appendChild(div);
        });
        const badge = document.getElementById('feedbackCounterBadge');
        if(badge) badge.innerText = count;
    });
}

// Load Admin Data & Leaderboard
function loadAdminData() {
    const todayDate = new Date().toISOString().split('T')[0];
    db.ref(`reports/${todayDate}`).on('value', (snapshot) => {
        const container = document.getElementById('leaderboardContainer');
        if(!container) return;
        container.innerHTML = '';
        const data = snapshot.val() || {};
        
        let grandTotal = 0;
        let sortedTeams = Object.keys(data).map(k => ({ key: k, ...data[k] }));
        sortedTeams.sort((a, b) => b.total - a.total);

        sortedTeams.forEach((item, index) => {
            grandTotal += item.total || 0;
            const div = document.createElement('div');
            div.className = 'leaderboard-item';
            div.innerHTML = `
                <div class="leaderboard-row-top">
                    <span><span class="rank-badge rank-${index+1 || 'other'}">${index+1}</span> ${item.teamName}</span>
                    <span style="font-weight:bold; color:#34d399;">${item.total} خاڵ</span>
                </div>
                ${item.notes ? `<div class="leaderboard-reason">تێبینی: ${item.notes}</div>` : ''}
            `;
            container.appendChild(div);
        });

        const totalBadge = document.getElementById('adminSectionTotal');
        if(totalBadge) totalBadge.innerText = `Total: ${grandTotal}`;
        
        const grandCounter = document.getElementById('grandTotalPoints');
        if(grandCounter) grandCounter.innerText = grandTotal;
    });
    loadAdminFeedbacksList();
}

// Section Switching
function switchSection(sec) {
    currentSection = sec;
    document.getElementById('tabLFD')?.classList.remove('active');
    document.getElementById('tabMoveIn')?.classList.remove('active');
    document.getElementById('tabChat')?.classList.remove('active');
    
    document.getElementById('operationsMainWrapper').style.display = 'block';
    document.getElementById('chatSectionContainer').classList.remove('active');

    if (sec === 'lfd') {
        document.getElementById('tabLFD')?.classList.add('active');
    } else if (sec === 'movein') {
        document.getElementById('tabMoveIn')?.classList.add('active');
    } else if (sec === 'chat') {
        document.getElementById('tabChat')?.classList.add('active');
        document.getElementById('operationsMainWrapper').style.display = 'none';
        document.getElementById('chatSectionContainer').classList.add('active');
        loadChatMessages();
    }
    renderCasesGrid();
}

// Render Cases Grid
function renderCasesGrid() {
    const container = document.getElementById('casesGridContainer');
    if (!container) return;

    if (currentSection === 'lfd') {
        container.innerHTML = `
            <div class="case-item">Paid <input type="number" id="c_paid" min="0" placeholder="0"></div>
            <div class="case-item">Disconnected <input type="number" id="c_disc" min="0" placeholder="0"></div>
            <div class="case-item">Reconnected <input type="number" id="c_reconn" min="0" placeholder="0"></div>
            <div class="case-item">Distribution <input type="number" id="c_dist" min="0" placeholder="0"></div>
            <div class="case-item">Special <input type="number" id="c_special" min="0" placeholder="0"></div>
            <div class="case-item">Tampered <input type="number" id="c_tampered" min="0" placeholder="0"></div>
        `;
    } else {
        container.innerHTML = `
            <div class="case-item">Inst. Meter <input type="number" id="c_inst_meter" min="0" placeholder="0"></div>
            <div class="case-item">Inst. Encl <input type="number" id="c_inst_encl" min="0" placeholder="0"></div>
            <div class="case-item">3P Encl <input type="number" id="c_inst_3p" min="0" placeholder="0"></div>
            <div class="case-item">BIM Team <input type="number" id="c_bim_team" min="0" placeholder="0"></div>
        `;
    }
}

// Broadcast & Admin Actions
function saveBroadcastMessage() {
    const msg = document.getElementById('adminBroadcastInput').value;
    if(!msg.trim()) return showNotification('تکایە پەیام بنووسە', 'error');
    db.ref('broadcastMessage').set({ text: msg, timestamp: Date.now() }).then(() => {
        showNotification('پەیامەکە بە سەرکەوتوویی بڵاوکرایەوە');
        document.getElementById('adminBroadcastInput').value = '';
    });
}

function sendPrivateTeamMessage() {
    const team = document.getElementById('privateMsgTeam').value;
    const msg = document.getElementById('privateMsgInput').value;
    if(!team || !msg.trim()) return showNotification('تکایە تیم و دەقی پەیامەکە دیاری بکە', 'error');
    db.ref(`privateMessages/${team}`).set({ text: msg, timestamp: Date.now() }).then(() => {
        showNotification('پەیامی تایبەت بۆ تیمەکە نێردرا');
        document.getElementById('privateMsgInput').value = '';
    });
}

function addNewTeam() {
    const section = document.getElementById('newTeamSection').value;
    const name = document.getElementById('newTeamNameInput').value;
    if(!name.trim()) return showNotification('ناوی تیم بنووسە', 'error');

    const key = name.toLowerCase().replace(/\s+/g, '_');
    db.ref(`teams/${key}`).set({ name, section, createdAt: Date.now() }).then(() => {
        showNotification('تیمی نوێ زیادکرا');
        document.getElementById('newTeamNameInput').value = '';
        populateTeamDropdowns();
    });
}

function convertExcelToKml() {
    const fileInput = document.getElementById('csvFileForKml');
    if (!fileInput.files.length) return showNotification('تکایە فایلی CSV هەڵبژێرە', 'error');

    const reader = new FileReader();
    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split('\n');
        let kmlContent = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n`;

        lines.forEach((line, idx) => {
            if (idx === 0 || !line.trim()) return;
            const cols = line.split(',');
            if (cols.length >= 3) {
                const name = cols[0].trim();
                const lat = cols[1].trim();
                const lng = cols[2].trim();
                kmlContent += `<Placemark><name>${name}</name><Point><coordinates>${lng},${lat},0</coordinates></Point></Placemark>\n`;
            }
        });
        kmlContent += `</Document></kml>`;

        const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'map_points.kml';
        a.click();
        showNotification('فایلی KML دروستکرا');
    };
    reader.readAsText(fileInput.files[0]);
}

function openLiveMapModal() {
    document.getElementById('liveMapModalOverlay').style.display = 'flex';
    if (!mapInstance) {
        mapInstance = L.map('mapContainer').setView([36.19, 44.01], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(mapInstance);
    }
}

function setFilter(filterType) {
    currentFilter = filterType;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`f_${filterType}`)?.classList.add('active');
}

// Chat System Functions
function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    const msg = input.value.trim();
    if (!msg) return;

    db.ref('chats').push({
        sender: 'کارمەند',
        text: msg,
        timestamp: Date.now()
    }).then(() => {
        input.value = '';
    });
}

function loadChatMessages() {
    db.ref('chats').limitToLast(30).on('value', (snapshot) => {
        const area = document.getElementById('chatMessagesArea');
        if (!area) return;
        area.innerHTML = '';
        const data = snapshot.val() || {};
        Object.keys(data).forEach(key => {
            const item = data[key];
            const div = document.createElement('div');
            div.className = 'chat-msg-bubble';
            div.innerHTML = `<strong>${item.sender}</strong>: <div>${item.text}</div>`;
            area.appendChild(div);
        });
        area.scrollTop = area.scrollHeight;
    });
}

// Chart.js Setup
function initChart() {
    const canvas = document.getElementById('trendChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['شەممە', 'یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە'],
            datasets: [{
                label: 'ئاماری خاڵەکان',
                data: [12, 19, 15, 25, 22, 30],
                borderColor: '#38bdf8',
                backgroundColor: 'rgba(56, 189, 248, 0.1)',
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } }
        }
    });
}

// Broadcast Ticker Listener
db.ref('broadcastMessage').on('value', (snapshot) => {
    const data = snapshot.val();
    const ticker = document.getElementById('broadcastTicker');
    const content = document.getElementById('broadcastTextContent');
    if (data && data.text && ticker && content) {
        content.innerText = data.text;
        ticker.style.display = 'flex';
    } else if (ticker) {
        ticker.style.display = 'none';
    }
});

function manualRefreshData() {
    loadAdminData();
    showNotification('داتاکان نوێکرانەوە');
}

// Startup Listener
window.onload = function() {
    renderCasesGrid();
    populateTeamDropdowns();
    initChart();
    loadAdminData();
};
