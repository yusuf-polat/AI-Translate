document.addEventListener('DOMContentLoaded', function() {
    // Tab switching functionality
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.getAttribute('data-tab');
            
            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            button.classList.add('active');
            document.getElementById(`${targetTab}-tab`).classList.add('active');
        });
    });

    // Character counters
    const appNameInput = document.getElementById('appName');
    const shortDescInput = document.getElementById('shortDescription');
    const fullDescInput = document.getElementById('fullDescription');
    
    const appNameCounter = document.getElementById('appNameCounter');
    const shortDescCounter = document.getElementById('shortDescCounter');
    const fullDescCounter = document.getElementById('fullDescCounter');

    appNameInput.addEventListener('input', () => updateCounter(appNameInput, appNameCounter));
    shortDescInput.addEventListener('input', () => updateCounter(shortDescInput, shortDescCounter));
    fullDescInput.addEventListener('input', () => updateCounter(fullDescInput, fullDescCounter));

    // Load saved data
    loadSavedData();

    // Event listeners
    document.getElementById('saveSettings').addEventListener('click', saveSettings);
    document.getElementById('testApiKey').addEventListener('click', testApiKey);
    document.getElementById('startBot').addEventListener('click', startBot);
    document.getElementById('stopBot').addEventListener('click', stopBot);
});

// Load saved data from storage
async function loadSavedData() {
    try {
        // Load API key
        const apiKeyData = await chrome.runtime.sendMessage({action: 'getApiKey'});
        if (apiKeyData && apiKeyData.apiKey) {
            document.getElementById('apiKey').value = apiKeyData.apiKey;
        }

        // Load app data
        const appData = await chrome.runtime.sendMessage({action: 'getAppData'});
        if (appData) {
            const appNameInput = document.getElementById('appName');
            const shortDescInput = document.getElementById('shortDescription');
            const fullDescInput = document.getElementById('fullDescription');
            
            appNameInput.value = appData.appName || '';
            shortDescInput.value = appData.shortDescription || '';
            fullDescInput.value = appData.fullDescription || '';
            
            // Update counters
            updateCounter(appNameInput, document.getElementById('appNameCounter'));
            updateCounter(shortDescInput, document.getElementById('shortDescCounter'));
            updateCounter(fullDescInput, document.getElementById('fullDescCounter'));
        }
    } catch (error) {
        console.error('Veriler yüklenirken hata oluştu:', error);
        // showStatus fonksiyonu henüz tanımlanmamış olabilir, bu yüzden console.error kullanıyoruz
    }
}

// Save all settings
async function saveSettings() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const appName = document.getElementById('appName').value.trim();
    const shortDescription = document.getElementById('shortDescription').value.trim();
    const fullDescription = document.getElementById('fullDescription').value.trim();

    if (!apiKey) {
        showStatus('API anahtarı gereklidir!', 'error');
        return;
    }

    if (!appName || !shortDescription || !fullDescription) {
        showStatus('Tüm uygulama bilgileri gereklidir!', 'error');
        return;
    }

    if (appName.length > 30) {
        showStatus('Uygulama adı 30 karakterden uzun olamaz!', 'error');
        return;
    }

    if (shortDescription.length > 80) {
        showStatus('Kısa açıklama 80 karakterden uzun olamaz!', 'error');
        return;
    }

    if (fullDescription.length > 4000) {
        showStatus('Tam açıklama 4000 karakterden uzun olamaz!', 'error');
        return;
    }

    try {
        // Save API key
        await chrome.runtime.sendMessage({
            action: 'saveApiKey',
            apiKey: apiKey
        });

        // Save app data
        await chrome.runtime.sendMessage({
            action: 'saveAppData',
            appName: appName,
            shortDescription: shortDescription,
            fullDescription: fullDescription
        });

        showStatus('Ayarlar başarıyla kaydedildi!', 'success');
    } catch (error) {
        showStatus('Ayarlar kaydedilirken hata oluştu: ' + error.message, 'error');
    }
}

// Test API key
async function testApiKey() {
    const apiKey = document.getElementById('apiKey').value.trim();
    
    if (!apiKey) {
        showStatus('Test etmek için API anahtarı girin!', 'error');
        return;
    }

    const button = document.getElementById('testApiKey');
    const originalText = button.textContent;
    button.innerHTML = '<span class="loading"></span>Test ediliyor...';
    button.disabled = true;

    try {
        const result = await chrome.runtime.sendMessage({
            action: 'testApiKey',
            apiKey: apiKey
        });

        if (result.isValid) {
            showStatus('API anahtarı geçerli! Bağlantı başarılı.', 'success');
        } else {
            showStatus('API anahtarı geçersiz! Lütfen kontrol edin.', 'error');
        }
    } catch (error) {
        showStatus('API test edilirken hata oluştu: ' + error.message, 'error');
    } finally {
        button.textContent = originalText;
        button.disabled = false;
    }
}

// Start the bot
async function startBot() {
    try {
        // Check if we're on the right page
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        if (!tab.url.includes('play.google.com/console')) {
            showStatus('Bu bot sadece Google Play Console sayfalarında çalışır!', 'error');
            return;
        }

        // Update UI
        document.getElementById('startBot').style.display = 'none';
        document.getElementById('stopBot').style.display = 'block';
        
        updateBotStatus('Bot başlatılıyor...', 0);
        clearLanguagesList();

        // First, inject the content script if it's not already loaded
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content.js']
            });
            console.log('Content script injected successfully');
        } catch (injectError) {
            console.log('Content script already loaded or injection failed:', injectError);
        }

        // Wait a bit for content script to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Test if content script is responsive
        try {
            const testResponse = await chrome.tabs.sendMessage(tab.id, {
                action: 'ping'
            });
            console.log('Content script is responsive:', testResponse);
        } catch (testError) {
            console.error('Content script not responsive:', testError);
            showStatus('Content script yüklenemedi. Sayfayı yenileyip tekrar deneyin.', 'error');
            resetBotUI();
            return;
        }

        // Send message to content script to start the bot
        const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'startBot'
        });
        
        console.log('Content script response:', response);

        showStatus('Bot başlatıldı! Tüm diller otomatik olarak işlenecek.', 'success');
    } catch (error) {
        console.error('Bot başlatma hatası:', error);
        showStatus('Bot başlatılırken hata oluştu: ' + error.message, 'error');
        resetBotUI();
    }
}

// Stop the bot
async function stopBot() {
    try {
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: 'stopBot'
            });
        } catch (messageError) {
            console.log('Content script not available for stop message:', messageError);
        }

        updateBotStatus('Bot durduruldu', 0);
        showStatus('Bot durduruldu.', 'info');
        resetBotUI();
    } catch (error) {
        console.error('Bot durdurma hatası:', error);
        showStatus('Bot durdurulurken hata oluştu: ' + error.message, 'error');
    }
}

// Update bot status
function updateBotStatus(status, progress) {
    const statusText = document.querySelector('#botStatus .status-text');
    const progressBar = document.querySelector('#botStatus .progress-bar');
    const progressFill = document.querySelector('#botStatus .progress-fill');
    
    statusText.textContent = status;
    
    if (progress > 0) {
        progressBar.style.display = 'block';
        progressFill.style.width = progress + '%';
    } else {
        progressBar.style.display = 'none';
    }
}

// Add language to the list
function addLanguageToList(language, status) {
    const languagesList = document.getElementById('processedLanguages');
    
    if (languagesList.textContent === 'Henüz işlem başlamadı') {
        languagesList.innerHTML = '';
    }
    
    const languageItem = document.createElement('div');
    languageItem.className = `language-item ${status}`;
    
    const statusIcon = status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳';
    languageItem.textContent = `${statusIcon} ${language}`;
    
    languagesList.appendChild(languageItem);
    languagesList.scrollTop = languagesList.scrollHeight;
}

// Clear languages list
function clearLanguagesList() {
    document.getElementById('processedLanguages').innerHTML = 'Henüz işlem başlamadı';
}

// Reset bot UI
function resetBotUI() {
    document.getElementById('startBot').style.display = 'block';
    document.getElementById('stopBot').style.display = 'none';
}

// Show status message
function showStatus(message, type) {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    statusElement.className = `status ${type}`;
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        statusElement.style.display = 'none';
    }, 5000);
}

// Update character counter
function updateCounter(input, counter) {
    counter.textContent = input.value.length;
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'updateBotStatus') {
        updateBotStatus(request.status, request.progress);
    }
    
    if (request.action === 'addLanguage') {
        addLanguageToList(request.language, request.status);
    }
    
    if (request.action === 'botCompleted') {
        updateBotStatus('Bot tamamlandı!', 100);
        showStatus('Tüm diller başarıyla işlendi!', 'success');
        resetBotUI();
    }
    
    if (request.action === 'botError') {
        updateBotStatus('Bot hatası: ' + request.error, 0);
        showStatus('Bot hatası: ' + request.error, 'error');
        resetBotUI();
    }
});
