// Toast Notification
function showNotification(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.style.cssText = `
        background: ${type === 'success' ? '#10b981' : '#ef4444'};
        color: white; padding: 10px 16px; margin-top: 8px; border-radius: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-size: 12px; z-index: 99999;
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
const auth = firebase.auth();

let currentUserAccount = JSON.parse(localStorage.getItem('bim_chat_user')) || null;
let currentSection = 'lfd';
let headerClickCount = 0;
let mapInstance = null;

function populateRegisterTeamSelect() {
    const adminSelect = document.getElementById('privateMsgTeam');
    if(!adminSelect) return;
    
    adminSelect.innerHTML = '<option value="">-- تیم --</option>';

    db.ref('teams').once('value', (snapshot) => {
        const teams = snapshot.val() || {};
        Object.keys(teams).forEach(teamKey => {
            const option = document.createElement('option');
            option.value = teamKey;
            option.textContent = teams[teamKey].name || teamKey;
            adminSelect.appendChild(option);
        });
    });
}

// Navigation & Admin Controls
function handleHeaderClick() {
    headerClickCount++;
    if (headerClickCount >= 3) {
        document.getElementById('customModalOverlay').style.display = 'flex';
        document.getElementById('modalConfirmBtn').onclick = () => {
            const pin = document.getElementById('customModalInput').value;
            if (pin === '1234') { 
                document.getElementById('adminPanel').classList.toggle('active');
                showNotification('بەشی ئەدمین بە سەرکەوتوویی کرایەوە');
                closeCustomModal(true);
            } else {
                showNotification('پین کۆد هەڵەیە', 'error');
            }
        };
        headerClickCount = 0;
    }
}

function closeCustomModal(clear) {
    document.getElementById('customModalOverlay').style.display = 'none';
    if(clear) document.getElementById('customModalInput').value = '';
}

function switchSection(sec) {
    currentSection = sec;
    document.getElementById('tabLFD').classList.remove('active');
    document.getElementById('tabMoveIn').classList.remove('active');
    document.getElementById('tabChat').classList.remove('active');
    
    document.getElementById('operationsMainWrapper').style.display = 'block';
    document.getElementById('chatSectionContainer').classList.remove('active');

    if(sec === 'lfd') {
        document.getElementById('tabLFD').classList.add('active');
    } else if(sec === 'movein') {
        document.getElementById('tabMoveIn').classList.add('active');
    } else if(sec === 'chat') {
        document.getElementById('tabChat').classList.add('active');
        document.getElementById('operationsMainWrapper').style.display = 'none';
        document.getElementById('chatSectionContainer').classList.add('active');
        loadChatMessages();
    }
}

// Admin Operations
function saveBroadcastMessage() {
    const msg = document.getElementById('adminBroadcastInput').value;
    if(!msg.trim()) return showNotification('دەق بنووسە', 'error');
    db.ref('broadcastMessage').set({ text: msg, timestamp: Date.now() }).then(() => {
        showNotification('پەیامەکە بڵاوکرایەوە');
        document.getElementById('adminBroadcastInput').value = '';
    });
}

function sendPrivateTeamMessage() {
    const team = document.getElementById('privateMsgTeam').value;
    const msg = document.getElementById('privateMsgInput').value;
    if(!team || !msg) return showNotification('زانیارییەکان بەتاڵن', 'error');
    db.ref(`privateMessages/${team}`).set({ text: msg, timestamp: Date.now() }).then(() => {
        showNotification('پەیامی تایبەت نێردرا');
        document.getElementById('privateMsgInput').value = '';
    });
}

function addNewTeam() {
    const section = document.getElementById('newTeamSection').value;
    const name = document.getElementById('newTeamNameInput').value;
    if(!name.trim()) return showNotification('ناوی تیم بنووسە', 'error');

    const key = name.toLowerCase().replace(/\s+/g, '_');
    db.ref(`teams/${key}`).set({ name, section, createdAt: Date.now() }).then(() => {
        showNotification('تیم بە سەرکەوتوویی زیادکرا');
        document.getElementById('newTeamNameInput').value = '';
        populateRegisterTeamSelect();
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
        a.download = 'points.kml';
        a.click();
        showNotification('فایلی KML بە سەرکەوتوویی دروستکرا');
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

// Chat Functionality
function sendChatMessage() {
    const input = document.getElementById('chatMessageInput');
    const msg = input.value.trim();
    if (!msg) return;

    const sender = currentUserAccount ? (currentUserAccount.name || currentUserAccount.email) : 'میوان';
    db.ref('chats').push({
        sender: sender,
        text: msg,
        timestamp: Date.now()
    }).then(() => {
        input.value = '';
    });
}

function loadChatMessages() {
    db.ref('chats').limitToLast(30).on('value', (snapshot) => {
        const area = document.getElementById('chatMessagesArea');
        area.innerHTML = '';
        const data = snapshot.val() || {};
        Object.keys(data).forEach(key => {
            const item = data[key];
            const div = document.createElement('div');
            const myName = currentUserAccount ? (currentUserAccount.name || currentUserAccount.email) : 'میوان';
            const isMe = item.sender === myName;
            div.className = `chat-msg-bubble ${isMe ? 'my-msg' : ''}`;
            div.innerHTML = `<strong>${item.sender}</strong>: <div>${item.text}</div>`;
            area.appendChild(div);
        });
        area.scrollTop = area.scrollHeight;
    });
}

// Initialize Chart
function initChart() {
    const ctx = document.getElementById('trendChartCanvas').getContext('2d');
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

// Real-time Listeners
db.ref('broadcastMessage').on('value', (snapshot) => {
    const data = snapshot.val();
    const ticker = document.getElementById('broadcastTicker');
    const content = document.getElementById('broadcastTextContent');
    if (data && data.text) {
        content.innerText = data.text;
        ticker.style.display = 'flex';
    } else {
        ticker.style.display = 'none';
    }
});

window.onload = function() {
    populateRegisterTeamSelect();
    initChart();
};
