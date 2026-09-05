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
let statsChartInstance = null;
let teamCoordinates = null;

const ADMIN_PIN = "Razwan";

const TEAM_PINS = {};
for (let i = 1; i <= 150; i++) {
    TEAM_PINS[`team_${i}`] = String(1000 + i);
}

// 📱 دەستنیشانکردنی جۆری ئامێر و مۆبایلی بەکارهێنەر (Device Info)
function getDeviceInfo() {
    const ua = navigator.userAgent;
    let device = "Desktop / PC";
    
    if (/android/i.test(ua)) {
        device = "Android Mobile";
    } else if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) {
        device = "iOS / iPhone";
    } else if (/tablet/i.test(ua)) {
        device = "Tablet";
    }

    let browser = "Web Browser";
    if (ua.indexOf("Chrome") > -1) browser = "Google Chrome";
    else if (ua.indexOf("Safari") > -1) browser = "Safari";
    else if (ua.indexOf("Firefox") > -1) browser = "Firefox";
    else if (ua.indexOf("Edge") > -1) browser = "MS Edge";

    return `${device} (${browser})`;
}

// 📋 تۆمارکردنی چالاکییەکان لە داتابەیس (Audit Log)
function logActivity(actionType, description) {
    const deviceInfo = getDeviceInfo();
    const logData = {
        action: actionType,
        desc: description,
        device: deviceInfo,
        timestamp: Date.now(),
        dateFormatted: new Date().toLocaleString()
    };
    db.ref('auditLogs').push(logData);
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

// Team Custom Input & GPS Capture
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
            logActivity("Custom Team", "تیمی نوێی دەستکرد زیادکرا: " + customName);
        } else {
            select.value = "";
        }
    }

    if (navigator.geolocation && select.value) {
        navigator.geolocation.getCurrentPosition((position) => {
            teamCoordinates = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
        }, (error) => {
            console.log('GPS Error:', error.message);
        }, { enableHighAccuracy: true });
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
                logActivity("Admin Login", "ئەدمین (Razwan) چووە ژوورەوە بۆ پانێڵ");
                loadAdminData();
            } else {
                showNotification('کۆدی ئەدمین هەڵەیە!', 'error');
                logActivity("Failed Login", "هەوڵی شکستخواردوو بۆ چوونەژوورەوەی ئەدمین");
            }
        };
        headerClickCount = 0;
    }
}

// Prompt PIN and Save Report
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
            logActivity("Team Pin Error", `هەڵە لە پین کۆدی ${teamLabel}`);
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
        coords: teamCoordinates || { lat: 36.19, lng: 44.01 },
        timestamp: Date.now()
    }).then(() => {
        showNotification(`ڕاپۆرتی ${teamName} بە سەرکەوتوویی نێردرا.`);
        logActivity("Report Submitted", `ڕاپۆرت نێردرا لەلایەن ${teamName} - کۆی خاڵ: ${totalPoints}`);
        document.getElementById('c_notes').value = '';
        inputs.forEach(inp => inp.value = '');
        if(document.getElementById('c_offday')) document.getElementById('c_offday').checked = false;
        loadAdminData();
    }).catch(err => {
        showNotification('هەڵە لە ناردنی داتا: ' + err.message, 'error');
    });
}

function closeCustomModal(clear) {
    document.getElementById('customModalOverlay').style.display = 'none';
    if(clear) document.getElementById('customModalInput').value = '';
}

// Load Admin Data, Leaderboard, Analytics & Audit Logs (لە جێگەی پێشنیارەکان)
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

        let chartLabels = [];
        let chartValues = [];

        sortedTeams.forEach((item, index) => {
            grandTotal += item.total || 0;
            if(index < 7) {
                chartLabels.push(item.teamName);
                chartValues.push(item.total);
            }

            const div = document.createElement('div');
            div.className = 'leaderboard-item';
            div.style.cssText = "background:rgba(11,15,25,0.8); padding:8px 12px; border-radius:8px; margin-bottom:6px; border:1px solid rgba(255,255,255,0.05); font-size:11px;";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span><strong>#${index+1}</strong> ${item.teamName}</span>
                    <span style="font-weight:bold; color:#34d399;">${item.total} خاڵ</span>
                </div>
                ${item.notes ? `<div style="color:#f87171; margin-top:2px;">تێبینی: ${item.notes}</div>` : ''}
            `;
            container.appendChild(div);
        });

        const totalBadge = document.getElementById('adminSectionTotal');
        if(totalBadge) totalBadge.innerText = `Total: ${grandTotal}`;
        
        const grandCounter = document.getElementById('grandTotalPoints');
        if(grandCounter) grandCounter.innerText = grandTotal;

        updateStatsChart(chartLabels, chartValues);
    });

    // 📋 بارکردنی لۆگی چالاکییەکان لە بەشی ئەدمیندا
    loadAuditLogsIntoAdmin();
}

// 📋 پیشاندانی تەواوی مێژووی لۆگی چالاکییەکان و زانیاری مۆبایل (Device Info)
function loadAuditLogsIntoAdmin() {
    db.ref('auditLogs').limitToLast(100).on('value', (snapshot) => {
        // گەڕان بەدوای کۆنتێنەری لۆگ، ئەگەر نەبوو لە پانێڵی ئەدمین دروستی دەکەین
        let logContainer = document.getElementById('auditLogsContainer');
        if (!logContainer) {
            const adminPanel = document.getElementById('adminPanel');
            if (adminPanel) {
                let section = document.createElement('div');
                section.id = 'auditLogsSection';
                section.style.cssText = "margin-top:15px; padding:12px; background:rgba(0,0,0,0.4); border-radius:10px; border:1px solid rgba(56,189,248,0.2); max-height:250px; overflow-y:auto;";
                section.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <h4 style="color:#38bdf8; font-size:13px; margin:0;">📋 مێژووی لۆگی چالاکییە گشتییەکان (Audit Logs)</h4>
                        <span style="font-size:10px; color:#94a3b8; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">Device & Action History</span>
                    </div>
                    <div id="auditLogsContainer"></div>
                `;
                adminPanel.appendChild(section);
                logContainer = document.getElementById('auditLogsContainer');
            } else {
                return;
            }
        }

        logContainer.innerHTML = '';
        const logs = snapshot.val() || {};
        
        Object.keys(logs).reverse().forEach(key => {
            const item = logs[key];
            const div = document.createElement('div');
            div.style.cssText = "font-size:11px; padding:8px; margin-bottom:6px; background:rgba(255,255,255,0.03); border-radius:6px; border:1px solid rgba(255,255,255,0.05); color:#e2e8f0;";
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; color:#94a3b8; font-size:10px; margin-bottom:3px;">
                    <span>🕒 ${item.dateFormatted || 'N/A'}</span>
                    <span style="color:#38bdf8; font-weight:bold;">📱 ${item.device || 'Unknown Device'}</span>
                </div>
                <div><strong style="color:#facc15;">[${item.action}]:</strong> ${item.desc}</div>
            `;
            logContainer.appendChild(div);
        });
    });
}

function updateStatsChart(labels, dataValues) {
    const canvas = document.getElementById('statsChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (statsChartInstance) {
        statsChartInstance.destroy();
    }

    statsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels.length ? labels : ['هیچ داتایەک نییە'],
            datasets: [{
                label: 'خاڵی تیمەکان ئەمڕۆ',
                data: dataValues.length ? dataValues : [0],
                backgroundColor: '#38bdf8',
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                y: { ticks: { color: '#f8fafc', font: { size: 10 } } },
                x: { ticks: { color: '#f8fafc', font: { size: 10 } } }
            }
        }
    });
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

// Broadcast & Live Push
db.ref('broadcastMessage').on('value', (snapshot) => {
    const data = snapshot.val();
    const ticker = document.getElementById('broadcastTicker');
    const content = document.getElementById('broadcastTextContent');

    if (data && data.text) {
        if(content) content.innerText = data.text;
        if(ticker) ticker.style.display = 'flex';
    } else {
        if(ticker) ticker.style.display = 'none';
    }
});

function saveBroadcastMessage() {
    const msg = document.getElementById('adminBroadcastInput').value;
    if(!msg.trim()) return showNotification('تکایە پەیام بنووسە', 'error');
    db.ref('broadcastMessage').set({ text: msg, timestamp: Date.now() }).then(() => {
        showNotification('پەیامی گشتی بڵاوکرایەوە');
        logActivity("Broadcast", "ئەدمین پەیامی گشتی بڵاوکردەوە: " + msg);
        document.getElementById('adminBroadcastInput').value = '';
    });
}

function sendPrivateTeamMessage() {
    const team = document.getElementById('privateMsgTeam').value;
    const msg = document.getElementById('privateMsgInput').value;
    if(!team || !msg.trim()) return showNotification('تکایە تیم و دەقی پەیامەکە دیاری بکە', 'error');
    db.ref(`privateMessages/${team}`).set({ text: msg, timestamp: Date.now() }).then(() => {
        showNotification('پەیامی تایبەت نێردرا');
        logActivity("Private Msg", `پەیامی تایبەت نێردرا بۆ ${team}`);
        document.getElementById('privateMsgInput').value = '';
    });
}

function openLiveMapModal() {
    document.getElementById('liveMapModalOverlay').style.display = 'flex';
    if (!mapInstance) {
        mapInstance = L.map('mapContainer').setView([36.19, 44.01], 11);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(mapInstance);
    }

    const todayDate = new Date().toISOString().split('T')[0];
    db.ref(`reports/${todayDate}`).once('value', (snapshot) => {
        const data = snapshot.val() || {};
        Object.keys(data).forEach(k => {
            const rep = data[k];
            if (rep.coords && rep.coords.lat && rep.coords.lng) {
                L.marker([rep.coords.lat, rep.coords.lng]).addTo(mapInstance)
                    .bindPopup(`<b>${rep.teamName}</b><br>خاڵ: ${rep.total}`);
            }
        });
    });
}

function setFilter(filterType) {
    currentFilter = filterType;
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`f_${filterType}`)?.classList.add('active');
}

// Chat System
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

function initChart() {
    const canvas = document.getElementById('trendChartCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['شەممە', 'یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە'],
            datasets: [{
                label: 'کۆی گشتی خاڵەکان',
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
    logActivity("App Launch", "سیستمەکە کرایەوە لەسەر ئامێر");
};
