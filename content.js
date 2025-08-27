// Content script for Google Play Console translation automation bot

let isBotRunning = false;
let appData = null;
let processedLanguages = [];
let totalLanguages = 0;
let currentLanguageIndex = 0;

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initializeExtension();
});

// Also initialize if page is already loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}

function initializeExtension() {
    console.log('Google Play Store Çeviri Bot başlatılıyor...');
    
    // Check if we're on the translation page
    if (window.location.href.includes('app-translation-embed')) {
        setupTranslationPage();
    }
    
    // Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Content script received message:', request);
    
    // Send immediate response to confirm we're listening
    sendResponse({received: true});
    
    // Handle the message
    handleMessage(request, sender, sendResponse);
});
}

function setupTranslationPage() {
    console.log('Çeviri sayfası tespit edildi, bot hazırlanıyor...');
    
    // Load app data
    loadAppData();
    
    // Add extension indicator
    addExtensionIndicator();
}

async function loadAppData() {
    try {
        const response = await chrome.runtime.sendMessage({action: 'getAppData'});
        if (response) {
            appData = response;
            console.log('Uygulama verisi yüklendi:', appData);
        }
    } catch (error) {
        console.error('Uygulama verisi yüklenirken hata:', error);
    }
}

function handleMessage(request, sender, sendResponse) {
    if (request.action === 'ping') {
        sendResponse({status: 'alive', timestamp: Date.now()});
        return;
    }
    
    if (request.action === 'startBot') {
        startBot();
        sendResponse({success: true});
    }
    
    if (request.action === 'stopBot') {
        stopBot();
        sendResponse({success: true});
    }
}

async function startBot() {
    if (isBotRunning) {
        console.log('Bot zaten çalışıyor!');
        return;
    }

    if (!appData) {
        await loadAppData();
        if (!appData) {
            notifyBotError('Uygulama verisi bulunamadı. Lütfen önce ayarları kaydedin.');
            return;
        }
    }

    isBotRunning = true;
    processedLanguages = [];
    currentLanguageIndex = 0;

    console.log('🤖 Bot başlatılıyor...');
    notifyBotStatus('Bot başlatılıyor...', 0);

    try {
        // Find all translation buttons
        const translationButtons = await findTranslationButtons();
        totalLanguages = translationButtons.length;

        if (totalLanguages === 0) {
            notifyBotError('Çeviri butonu bulunamadı. Sayfayı yenileyip tekrar deneyin.');
            return;
        }

        console.log(`${totalLanguages} dil bulundu, işlem başlıyor...`);
        notifyBotStatus(`${totalLanguages} dil bulundu, işlem başlıyor...`, 0);

        // Process each language
        for (let i = 0; i < translationButtons.length; i++) {
            if (!isBotRunning) {
                console.log('Bot durduruldu.');
                break;
            }

            currentLanguageIndex = i;
            const button = translationButtons[i];
            const language = getLanguageFromButton(button);

            console.log(`İşleniyor: ${language} (${i + 1}/${totalLanguages})`);
            notifyBotStatus(`${language} işleniyor... (${i + 1}/${totalLanguages})`, ((i + 1) / totalLanguages) * 100);
            addLanguageToList(language, 'processing');

            try {
                await processLanguage(button, language);
                processedLanguages.push({language, status: 'success'});
                addLanguageToList(language, 'success');
                console.log(`✅ ${language} başarıyla tamamlandı`);
            } catch (error) {
                console.error(`❌ ${language} hatası:`, error);
                
                // Check if it's a rate limiting error
                const errorMessage = error.message.toLowerCase();
                if (errorMessage.includes('çok fazla istek') || 
                    errorMessage.includes('rate limit') ||
                    errorMessage.includes('too many requests') ||
                    errorMessage.includes('bir dakika bekleyip')) {
                    
                    console.log(`⏰ Rate limiting hatası algılandı. 30 saniye bekleniyor...`);
                    notifyBotStatus(`Rate limiting - 30 saniye bekleniyor... (${i + 1}/${totalLanguages})`, ((i + 1) / totalLanguages) * 100);
                    
                    // Wait 30 seconds for rate limiting
                    await sleep(30000);
                    
                    console.log(`🔄 30 saniye bekleme tamamlandı, tekrar deneniyor: ${language}`);
                    notifyBotStatus(`${language} tekrar deneniyor... (${i + 1}/${totalLanguages})`, ((i + 1) / totalLanguages) * 100);
                    
                    try {
                        // Retry the failed language
                        await processLanguage(button, language);
                        processedLanguages.push({language, status: 'success_retry'});
                        addLanguageToList(language, 'success');
                        console.log(`✅ ${language} başarıyla tamamlandı (retry)`);
                    } catch (retryError) {
                        console.error(`❌ ${language} tekrar denemede de başarısız:`, retryError);
                        processedLanguages.push({language, status: 'error', error: retryError.message});
                        addLanguageToList(language, 'error');
                    }
                } else {
                    // Regular error, not rate limiting
                    processedLanguages.push({language, status: 'error', error: error.message});
                    addLanguageToList(language, 'error');
                }
            }

            // Wait between languages to avoid rate limiting
            if (i < translationButtons.length - 1) {
                await sleep(3000);
            }
        }

        if (isBotRunning) {
            console.log('🎉 Tüm diller tamamlandı!');
            notifyBotCompleted();
        } else {
            console.log('Bot durduruldu.');
            notifyBotStatus('Bot durduruldu.', 0);
        }

    } catch (error) {
        console.error('Bot hatası:', error);
        notifyBotError('Bot hatası: ' + error.message);
    } finally {
        isBotRunning = false;
    }
}

function stopBot() {
    isBotRunning = false;
    console.log('Bot durdurma sinyali gönderildi.');
}

async function findTranslationButtons() {
    // Wait for the page to load completely
    await sleep(3000);

    // Find all "İncele ve uygula" buttons
    const buttons = Array.from(document.querySelectorAll('button')).filter(button => 
        button.textContent.includes('İncele ve uygula') || 
        button.textContent.includes('Review and apply')
    );

    console.log(`${buttons.length} çeviri butonu bulundu`);
    return buttons;
}

function getLanguageFromButton(button) {
    // Find the language from the table row
    const row = button.closest('.particle-table-row') || button.closest('tr');
    if (row) {
        const languageCell = row.querySelector('[essfield="order-detail-language-column"]') || 
                           row.querySelector('td:nth-child(1)') ||
                           row.querySelector('.language-column');
        
        if (languageCell) {
            return languageCell.textContent.trim();
        }
    }
    
    return 'Bilinmeyen Dil';
}

async function processLanguage(button, language) {
    // Check if there's already an open modal and close it
    await closeExistingModal();
    
    // Simulate human-like mouse movement and click
    await simulateHumanClick(button);
    console.log(`Modal açılıyor: ${language}`);

    // Wait for modal to appear
    const modal = await waitForElement('.modal.visible, .modal[style*="display: block"], .modal[style*="display:block"]');
    if (!modal) {
        throw new Error('Modal açılamadı');
    }

    // Wait a bit for modal to fully load
    await sleep(1000);

    // Get the input fields
    const inputs = modal.querySelectorAll('input, textarea');
    if (inputs.length < 3) {
        throw new Error('Yeterli input alanı bulunamadı');
    }

    console.log(`Tek seferde tüm alanlar çevriliyor: ${language}`);

    // Translate all fields at once
    const translations = await translateAllFields(appData, language);
    
    // Fill all fields with translations
    if (translations.appName) {
        await simulateTyping(inputs[0], translations.appName.substring(0, 30));
        console.log(`✅ Uygulama adı: ${translations.appName.substring(0, 30)}`);
    }
    await sleep(500);

    if (translations.shortDescription) {
        await simulateTyping(inputs[1], translations.shortDescription.substring(0, 80));
        console.log(`✅ Kısa açıklama: ${translations.shortDescription.substring(0, 50)}...`);
    }
    await sleep(500);

    if (translations.fullDescription) {
        await simulateTyping(inputs[2], translations.fullDescription.substring(0, 4000));
        console.log(`✅ Tam açıklama: ${translations.fullDescription.substring(0, 100)}...`);
    }
    await sleep(500);

    // Click the "Uygula" (Apply) button
    const applyButton = modal.querySelector('button[debug-id="yes-button"]') ||
                       modal.querySelector('button:contains("Uygula")') ||
                       modal.querySelector('button:contains("Apply")') ||
                       modal.querySelector('button[type="submit"]');

    if (applyButton) {
        await simulateHumanClick(applyButton);
        console.log(`Uygula butonuna tıklandı: ${language}`);
        
        // Wait for modal to close
        await sleep(3000);
    } else {
        throw new Error('Uygula butonu bulunamadı');
    }
}

// Translate all fields at once with a single API call
async function translateAllFields(appData, targetLanguage) {
    try {
        // Create combined text for all fields
        const combinedText = `Uygulama Adı: ${appData.appName || ''}
Kısa Açıklama: ${appData.shortDescription || ''}
Tam Açıklama: ${appData.fullDescription || ''}`;

        console.log(`🔄 Tek API çağrısıyla çeviri başlıyor: ${targetLanguage}`);
        
        // Send single translation request to background script
        const response = await chrome.runtime.sendMessage({
            action: 'processText',
            text: combinedText,
            targetLanguage: targetLanguage
        });
        
        if (response.success) {
            const translatedText = sanitizeText(response.response);
            console.log('📥 Çeviri alındı, ayrıştırılıyor...');
            
            // Parse the translated response back into separate fields
            const translations = parseCombinedTranslation(translatedText);
            return translations;
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Toplu çeviri hatası:', error);
        // Fallback to individual translations if combined fails
        console.log('⚠️ Fallback: Tek tek çeviri yapılıyor...');
        return {
            appName: await translateText(appData.appName, targetLanguage),
            shortDescription: await translateText(appData.shortDescription, targetLanguage),
            fullDescription: await translateText(appData.fullDescription, targetLanguage)
        };
    }
}

// Parse combined translation response into separate fields
function parseCombinedTranslation(translatedText) {
    const translations = {
        appName: '',
        shortDescription: '',
        fullDescription: ''
    };
    
    try {
        // Try to parse as JSON first (new format)
        try {
            const jsonMatch = translatedText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                
                // New nested format: {translation: {appName: "", shortDescription: "", fullDescription: ""}}
                if (parsed.translation && typeof parsed.translation === 'object') {
                    const trans = parsed.translation;
                    if (trans.appName || trans.shortDescription || trans.fullDescription) {
                        translations.appName = trans.appName || '';
                        translations.shortDescription = trans.shortDescription || '';
                        translations.fullDescription = trans.fullDescription || '';
                        console.log('✅ Nested JSON formatı ayrıştırıldı');
                        return translations;
                    }
                }
                
                // Old direct format: {appName: "", shortDescription: "", fullDescription: ""}
                if (parsed.appName || parsed.shortDescription || parsed.fullDescription) {
                    translations.appName = parsed.appName || '';
                    translations.shortDescription = parsed.shortDescription || '';
                    translations.fullDescription = parsed.fullDescription || '';
                    console.log('✅ Direct JSON formatı ayrıştırıldı');
                    return translations;
                }
            }
        } catch (jsonError) {
            console.log('JSON parse başarısız, text parsing deneniyor...');
        }
        
        // Fallback to text parsing
        const appNameMatch = translatedText.match(/(?:Uygulama Adı|UYGULAMA_ADI):\s*(.+?)(?=\n(?:Kısa Açıklama|KISA_ACIKLAMA):|$)/s);
        const shortDescMatch = translatedText.match(/(?:Kısa Açıklama|KISA_ACIKLAMA):\s*(.+?)(?=\n(?:Tam Açıklama|TAM_ACIKLAMA):|$)/s);
        const fullDescMatch = translatedText.match(/(?:Tam Açıklama|TAM_ACIKLAMA):\s*(.+?)$/s);
        
        if (appNameMatch) {
            translations.appName = appNameMatch[1].trim();
        }
        if (shortDescMatch) {
            translations.shortDescription = shortDescMatch[1].trim();
        }
        if (fullDescMatch) {
            translations.fullDescription = fullDescMatch[1].trim();
        }
        
        console.log('✅ Text parsing başarılı:', {
            appName: translations.appName.substring(0, 30),
            shortDesc: translations.shortDescription.substring(0, 50),
            fullDesc: translations.fullDescription.substring(0, 100)
        });
        
    } catch (error) {
        console.error('Ayrıştırma hatası:', error);
    }
    
    return translations;
}

async function translateText(text, targetLanguage) {
    try {
        // Send translation request to background script with target language
        const response = await chrome.runtime.sendMessage({
            action: 'processText',
            text: text,
            targetLanguage: targetLanguage
        });
        
        if (response.success) {
            return sanitizeText(response.response);
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        console.error('Çeviri hatası:', error);
        throw error;
    }
}

function addExtensionIndicator() {
    const indicator = document.createElement('div');
    indicator.id = 'extension-indicator';
    indicator.innerHTML = `
        <div style="
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 10px 15px;
            border-radius: 8px;
            font-size: 12px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: ${isBotRunning ? 'block' : 'none'};
        ">
            🤖 Çeviri Bot Aktif
        </div>
    `;
    document.body.appendChild(indicator);
}

function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 12px 16px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        z-index: 10001;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-width: 300px;
        word-wrap: break-word;
    `;
    
    switch (type) {
        case 'success':
            notification.style.background = '#d4edda';
            notification.style.color = '#155724';
            notification.style.border = '1px solid #c3e6cb';
            break;
        case 'error':
            notification.style.background = '#f8d7da';
            notification.style.color = '#721c24';
            notification.style.border = '1px solid #f5c6cb';
            break;
        case 'info':
            notification.style.background = '#d1ecf1';
            notification.style.color = '#0c5460';
            notification.style.border = '1px solid #bee5eb';
            break;
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

function waitForElement(selector) {
    return new Promise((resolve) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }
        
        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        // Timeout after 10 seconds
        setTimeout(() => {
            observer.disconnect();
            resolve(null);
        }, 10000);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

        // Normal input typing (no human simulation)
        async function simulateTyping(input, text) {
            // Focus on the input
            input.focus();
            await sleep(100);
            
            // Clear existing content
            input.value = '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            await sleep(50);
            
            // Set the text directly
            input.value = text;
            
            // Dispatch events
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            input.dispatchEvent(new Event('blur', { bubbles: true }));
            
            await sleep(100);
        }

// Ensure proper character encoding for Turkish and other special characters
function sanitizeText(text) {
    if (!text) return '';
    
    // Decode any HTML entities
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    let decodedText = textarea.value;
    
    // Ensure proper Unicode characters
    decodedText = decodedText
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ');
    
    return decodedText;
}

// Close any existing modal before opening a new one
async function closeExistingModal() {
    try {
        // Look for visible modals
        const existingModals = document.querySelectorAll('.modal.visible, .modal[style*="display: block"], .modal[style*="display:block"]');
        
        if (existingModals.length > 0) {
            console.log(`🗑️ ${existingModals.length} açık modal bulundu, kapatılıyor...`);
            
            for (const modal of existingModals) {
                // Try to find close buttons in the modal
                let closeButtons = modal.querySelectorAll(
                    'button[debug-id="no-button"], ' +
                    'button[aria-label*="close"], ' +
                    'button[aria-label*="kapat"], ' +
                    '.close-button, ' +
                    '[data-dismiss="modal"]'
                );
                
                // If no specific close buttons found, look for buttons with close text
                if (closeButtons.length === 0) {
                    const allButtons = modal.querySelectorAll('button');
                    closeButtons = Array.from(allButtons).filter(btn => {
                        const text = btn.textContent.toLowerCase();
                        return text.includes('İptal') || text.includes('cancel') || 
                               text.includes('kapat') || text.includes('close') ||
                               text.includes('×') || text.includes('✕');
                    });
                }
                
                if (closeButtons.length > 0) {
                    console.log(`✅ Modal kapatma butonu bulundu, tıklanıyor...`);
                    await simulateHumanClick(closeButtons[0]);
                    await sleep(1000);
                } else {
                    // Try pressing Escape key
                    console.log(`⌨️ Kapatma butonu bulunamadı, Escape tuşu deneniyor...`);
                    document.dispatchEvent(new KeyboardEvent('keydown', {
                        key: 'Escape',
                        code: 'Escape',
                        keyCode: 27,
                        bubbles: true
                    }));
                    await sleep(1000);
                }
                
                // If modal still exists, try clicking outside
                if (document.contains(modal) && modal.style.display !== 'none') {
                    console.log(`🖱️ Modal hala açık, dışarıya tıklama deneniyor...`);
                    const backdrop = document.querySelector('.modal-backdrop, .backdrop');
                    if (backdrop) {
                        await simulateHumanClick(backdrop);
                    } else {
                        // Click on body if no backdrop found
                        document.body.click();
                    }
                    await sleep(1000);
                }
            }
            
            console.log(`✅ Var olan modal(lar) kapatıldı`);
        } else {
            console.log(`ℹ️ Açık modal bulunamadı`);
        }
    } catch (error) {
        console.error('Modal kapatma hatası:', error);
        // Don't throw error, just log it and continue
    }
}

        // Normal click (no human simulation)
        async function simulateHumanClick(element) {
            // Simple click
            element.click();
            await sleep(100);
        }

// Notification functions for popup communication
function notifyBotStatus(status, progress) {
    chrome.runtime.sendMessage({
        action: 'updateBotStatus',
        status: status,
        progress: progress
    });
}

function addLanguageToList(language, status) {
    chrome.runtime.sendMessage({
        action: 'addLanguage',
        language: language,
        status: status
    });
}

function notifyBotCompleted() {
    chrome.runtime.sendMessage({
        action: 'botCompleted'
    });
}

function notifyBotError(error) {
    chrome.runtime.sendMessage({
        action: 'botError',
        error: error
    });
}

// Update extension indicator when bot status changes
function updateExtensionIndicator() {
    const indicator = document.getElementById('extension-indicator');
    if (indicator) {
        const statusDiv = indicator.querySelector('div');
        if (statusDiv) {
            statusDiv.style.display = isBotRunning ? 'block' : 'none';
        }
    }
}
