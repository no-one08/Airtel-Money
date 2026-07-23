# Airtel Money Congo - Crédit Rapide

Application de crédit rapide style Airtel Money pour la RDC Congo.

## Fonctionnalités
- 📱 Design responsive mobile-first
- 💰 Calculateur de crédit avec sliders
- 🤖 Intégration Telegram Bot pour approbation admin
- 🔐 Vérification PIN (4 chiffres)
- 📲 Vérification OTP (5 chiffres)
- ✅ Polling de statut en temps réel

## Configuration

### 1. Créer un Bot Telegram
1. Envoyez `/newbot` à [@BotFather](https://t.me/BotFather)
2. Copiez le token du bot
3. Envoyez `/start` à votre bot
4. Visitez: `https://api.telegram.org/bot<TOKEN>/getUpdates`
5. Trouvez votre `chat.id` — c'est votre `ADMIN_CHAT_ID`

### 2. Installation
```bash
npm install
```

### 3. Configuration
Créez un fichier `.env`:
```env
PORT=3000
TELEGRAM_BOT_TOKEN=votre_token_ici
ADMIN_CHAT_ID=votre_chat_id
```

### 4. Lancer
```bash
npm start
```

### 5. Ouvrir
```
http://localhost:3000
```

## Déploiement Render

1. Poussez le code sur GitHub
2. Connectez votre repo sur [render.com](https://render.com)
3. Configurez:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. Ajoutez les variables d'environnement
5. Déployez!

## Comment ça marche

1. **Client remplit le formulaire** → montant, durée, infos perso, PIN
2. **Soumission** → Demande envoyée à votre bot Telegram
3. **Vous décidez** sur Telegram:
   - ✅ **Approuver** → OTP généré (affiché dans les logs)
   - ❌ **Refuser** → Client voit le refus
4. **Client entre l'OTP** → Vérification
5. **Succès** → Crédit approuvé!

## Commandes Telegram
- `/start` - Message de bienvenue
- `/pending` - Voir les demandes en attente
- `/approved` - Voir les crédits approuvés
- `/declined` - Voir les crédits refusés
- `/help` - Aide

## Notes Production
- Remplacer le stockage mémoire par MongoDB/PostgreSQL
- Intégrer une API SMS (Twilio, Africa's Talking) pour l'OTP réel
- Ajouter HTTPS/SSL
- Ajouter rate limiting
