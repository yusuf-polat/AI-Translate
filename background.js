// Background script for AI Assistant Extension

// Extension yüklendiğinde context menu oluştur ve side panel ayarla
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "aiAssistant",
        title: "AI ile Analiz Et",
        contexts: ["selection"]
    });
    
    // Side panel'i Google Play Console sayfalarında etkinleştir
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

// Action (toolbar icon) tıklandığında side panel'i aç
chrome.action.onClicked.addListener(async (tab) => {
    // Google Play Console sayfasındaysa side panel'i aç
    if (tab.url && tab.url.includes('play.google.com/console')) {
        await chrome.sidePanel.open({ tabId: tab.id });
    } else {
        // Diğer sayfalarda bilgi göster
        chrome.tabs.create({
            url: 'https://play.google.com/console'
        });
    }
});

// Context menu tıklandığında
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "aiAssistant" && info.selectionText) {
        // Seçili metni AI'ya gönder
        await processWithAI(info.selectionText, tab.id);
    }
});

// Popup ve content script'lerden gelen mesajları dinle
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "processText") {
        processWithAI(request.text, sender.tab?.id, request.targetLanguage)
            .then(response => sendResponse({success: true, response}))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true; // Asenkron yanıt için
    }
    
    if (request.action === "saveApiKey") {
        chrome.storage.sync.set({geminiApiKey: request.apiKey}, () => {
            sendResponse({success: true});
        });
        return true;
    }
    
    if (request.action === "getApiKey") {
        chrome.storage.sync.get(['geminiApiKey'], (result) => {
            sendResponse({apiKey: result.geminiApiKey});
        });
        return true;
    }
    
    if (request.action === "testApiKey") {
        testApiKey(request.apiKey)
            .then(isValid => sendResponse({isValid}))
            .catch(() => sendResponse({isValid: false}));
        return true;
    }
    
    if (request.action === "saveToolSettings") {
        chrome.storage.sync.set({
            toolPurpose: request.toolPurpose,
            customPrompt: request.customPrompt,
            targetLanguage: request.targetLanguage
        }, () => {
            sendResponse({success: true});
        });
        return true;
    }
    
    if (request.action === "getToolSettings") {
        chrome.storage.sync.get(['toolPurpose', 'customPrompt', 'targetLanguage'], (result) => {
            sendResponse({
                toolPurpose: result.toolPurpose || 'translation',
                customPrompt: result.customPrompt || '',
                targetLanguage: result.targetLanguage || 'turkish'
            });
        });
        return true;
    }
    
    if (request.action === "saveAppData") {
        chrome.storage.sync.set({
            appName: request.appName,
            shortDescription: request.shortDescription,
            fullDescription: request.fullDescription
        }, () => {
            sendResponse({success: true});
        });
        return true;
    }
    
    if (request.action === "getAppData") {
        chrome.storage.sync.get(['appName', 'shortDescription', 'fullDescription'], (result) => {
            sendResponse({
                appName: result.appName || '',
                shortDescription: result.shortDescription || '',
                fullDescription: result.fullDescription || ''
            });
        });
        return true;
    }
    
    if (request.action === "translateAppData") {
        translateAppData(request.targetLanguage)
            .then(translations => sendResponse({success: true, translations}))
            .catch(error => sendResponse({success: false, error: error.message}));
        return true;
    }
});

// AI response parsing fonksiyonu - optimize edilmiş
function parseAIResponse(rawText) {
    if (!rawText || rawText.trim() === '') {
        return '';
    }
    
    console.log('Parsing AI Response - Length:', rawText.length);
    
    // 1. Markdown JSON formatını ara (```json ... ```)
    const markdownJsonRegex = /```json\s*(\{[\s\S]*?\})\s*```/gi;
    let markdownMatch = markdownJsonRegex.exec(rawText);
    if (markdownMatch) {
        try {
            const jsonStr = markdownMatch[1].trim();
            console.log('Found markdown JSON:', jsonStr.substring(0, 100) + '...');
            const jsonObj = JSON.parse(jsonStr);
            if (jsonObj.translation) {
                console.log('✅ Markdown JSON parse başarılı');
                return jsonObj.translation;
            }
        } catch (e) {
            console.log('❌ Markdown JSON parse hatası:', e.message);
        }
    }
    
    // 2. Düz JSON formatını ara
    const jsonRegex = /\{[\s\S]*"translation"\s*:\s*"([\s\S]*?)"[\s\S]*\}/gi;
    let jsonMatch = jsonRegex.exec(rawText);
    if (jsonMatch) {
        try {
            const fullJson = jsonMatch[0];
            console.log('Found direct JSON:', fullJson.substring(0, 100) + '...');
            const jsonObj = JSON.parse(fullJson);
            if (jsonObj.translation) {
                console.log('✅ Direct JSON parse başarılı');
                return jsonObj.translation;
            }
        } catch (e) {
            console.log('❌ Direct JSON parse hatası:', e.message);
        }
    }
    
    // 3. Translation değerini direkt ara (quotes ile)
    const translationRegex = /"translation"\s*:\s*"((?:[^"\\]|\\.)*)"/gi;
    let translationMatch = translationRegex.exec(rawText);
    if (translationMatch) {
        const translation = translationMatch[1]
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');
        console.log('✅ Translation regex başarılı');
        return translation;
    }
    
    // 4. Son çare: JSON object başlangıcı ve bitişi ara
    const startIndex = rawText.indexOf('{');
    const lastIndex = rawText.lastIndexOf('}');
    if (startIndex !== -1 && lastIndex !== -1 && lastIndex > startIndex) {
        try {
            const jsonStr = rawText.substring(startIndex, lastIndex + 1);
            console.log('Found JSON boundaries:', jsonStr.substring(0, 100) + '...');
            const jsonObj = JSON.parse(jsonStr);
            if (jsonObj.translation) {
                console.log('✅ JSON boundaries parse başarılı');
                return jsonObj.translation;
            }
        } catch (e) {
            console.log('❌ JSON boundaries parse hatası:', e.message);
        }
    }
    
    // 5. En son çare: düz metin döndür
    console.log('⚠️ JSON parse başarısız, düz metin döndürülüyor');
    return rawText.trim();
}

// Gemini API ile metin işleme
async function processWithAI(text, tabId, overrideTargetLanguage = null) {
    try {
        // API anahtarını al
        const result = await chrome.storage.sync.get(['geminiApiKey']);
        const apiKey = result.geminiApiKey;
        
        if (!apiKey) {
            throw new Error('Gemini API anahtarı bulunamadı. Lütfen popup\'tan API anahtarınızı girin.');
        }

        // Tool ayarlarını al
        const toolSettings = await chrome.storage.sync.get(['toolPurpose', 'customPrompt', 'targetLanguage']);
        const toolPurpose = toolSettings.toolPurpose || 'text_editing';
        const customPrompt = toolSettings.customPrompt || '';
        const targetLanguage = overrideTargetLanguage || toolSettings.targetLanguage || 'turkish';

        // Rate limiting kontrolü
        await checkRateLimit();

        // Tool purpose'a göre prompt oluştur
        const prompt = generatePrompt(text, toolPurpose, customPrompt, targetLanguage);

        // Gemma API çağrısı - JSON formatında yanıt almak için
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-3n-e2b-it:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: prompt
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.3,
                    topK: 40,
                    topP: 0.95,
                    maxOutputTokens: 8192
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Gemini API Hatası: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        
        // JSON response'u işle - optimize edilmiş
        let aiResponse = '';
        console.log('API Response:', data); // Debug için
        
        if (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) {
            const rawText = data.candidates[0].content.parts[0].text;
            console.log('Raw Text Length:', rawText.length, 'First 200 chars:', rawText.substring(0, 200)); // Debug için
            
            // Robust JSON parsing
            aiResponse = parseAIResponse(rawText);
            console.log('Final Response Length:', aiResponse.length, 'First 100 chars:', aiResponse.substring(0, 100));
        } else if (data.error) {
            throw new Error(`Gemma Hatası: ${data.error.message || 'Bilinmeyen hata'}`);
        } else {
            console.error('Beklenmeyen API yanıt formatı:', data);
            throw new Error('API yanıt formatı tanınmıyor');
        }

        // Eğer tabId varsa, content script'e sonucu gönder
        if (tabId) {
            console.log('Sending response to content script:', {
                action: "showAIResponse",
                response: aiResponse,
                originalText: text,
                tabId: tabId
            });
            
            try {
                await chrome.tabs.sendMessage(tabId, {
                    action: "showAIResponse",
                    response: aiResponse,
                    originalText: text
                });
                console.log('Message sent successfully to content script');
            } catch (error) {
                console.error('Error sending message to content script:', error);
            }
        }

        return aiResponse;

    } catch (error) {
        console.error('AI işleme hatası:', error);

        // Hata durumunda content script'e bilgi gönder
        if (tabId) {
            chrome.tabs.sendMessage(tabId, {
                action: "showAIError",
                error: error.message
            });
        }

        throw error;
    }
}

// Tool purpose'a göre prompt oluştur
function generatePrompt(text, toolPurpose, customPrompt, targetLanguage) {
    
    const basePrompts = {
        translation: `Sen profesyonel bir Google Play Store çeviri uzmanısın. Bu metni ${targetLanguage} diline çevir.

${text.includes('Uygulama Adı:') ? `
ÖNEMLİ: Bu çok alanlı bir uygulama çevirisi! Her alanı ayrı ayrı çevir.

KRITIK: Yanıtını SADECE aşağıdaki JSON formatında ver:
{
  "translation": {
    "appName": "çevrilmiş_uygulama_adı",
    "shortDescription": "çevrilmiş_kısa_açıklama", 
    "fullDescription": "çevrilmiş_tam_açıklama"
  }
}

KURALLAR:
- Her alanı ayrı ayrı çevir
- Karakter sınırlarına dikkat et (Uygulama Adı: 30, Kısa Açıklama: 80, Tam Açıklama: 4000)
- Hiçbir alanı atma
- JSON formatını tam olarak koru
- Escape karakterleri doğru kullan
` : `
KRITIK: Yanıtını SADECE JSON formatında ver:
{"translation": "TAM_ÇEVRİLMİŞ_METİN"}

UYARILAR:
- Tam metni çevir, hiçbir bölümü atma
- Uzun metinlerde bile JSON formatını koru
- Escape karakterleri doğru kullan (\", \\n)
- Metin uzunluğu önemli değil, tam çeviriyi yap
`}

Çevrilecek metin:
"${text}"`,
        
        app_store_translation: `Sen profesyonel bir Google Play Store çeviri uzmanısın. Bu mağaza metnini ${targetLanguage} diline çevir.

KRITIK: Yanıtını SADECE JSON formatında ver:
{"translation": "TAM_ÇEVRİLMİŞ_METİN"}

UYARILAR:
- Tam metni çevir, hiçbir bölümü atma
- Uzun metinlerde bile JSON formatını koru
- Escape karakterleri doğru kullan (\", \\n)
- Metin uzunluğu önemli değil, tam çeviriyi yap

Çevrilecek metin:
"${text}"`,
        
        custom: customPrompt ? `${customPrompt}

KRITIK: Yanıtını SADECE JSON formatında ver:
{"translation": "TAM_ÇEVRİLMİŞ_METİN"}

Metin: "${text}"` : `Bu metni ${targetLanguage} diline çevir.

KRITIK: Yanıtını SADECE JSON formatında ver:
{"translation": "TAM_ÇEVRİLMİŞ_METİN"}

UYARILAR:
- Tam metni çevir, hiçbir bölümü atma
- Uzun metinlerde bile JSON formatını koru
- Escape karakterleri doğru kullan (\", \\n)
- Metin uzunluğu önemli değil, tam çeviriyi yap

Çevrilecek metin:
"${text}"`
    };
    
    return basePrompts[toolPurpose] || basePrompts.translation;
}

// Uygulama verilerini çevir
async function translateAppData(targetLanguage) {
    try {
        const appData = await chrome.storage.sync.get(['appName', 'shortDescription', 'fullDescription']);
        
        if (!appData.appName && !appData.shortDescription && !appData.fullDescription) {
            throw new Error('Çevrilecek uygulama verisi bulunamadı. Lütfen önce uygulama bilgilerini girin.');
        }
        
        const translations = {};
        
        if (appData.appName) {
            translations.appName = await processWithAI(appData.appName, null);
        }
        
        if (appData.shortDescription) {
            translations.shortDescription = await processWithAI(appData.shortDescription, null);
        }
        
        if (appData.fullDescription) {
            translations.fullDescription = await processWithAI(appData.fullDescription, null);
        }
        
        return translations;
    } catch (error) {
        console.error('Çeviri hatası:', error);
        throw error;
    }
}

// Rate limiting için değişkenler
let lastRequestTime = 0;
let requestCount = 0;
const RATE_LIMIT_DELAY = 2000; // 2 saniye
const MAX_REQUESTS_PER_MINUTE = 10;

// Rate limiting kontrolü
async function checkRateLimit() {
    const now = Date.now();
    
    // Son istekten bu yana geçen süreyi kontrol et
    if (now - lastRequestTime < RATE_LIMIT_DELAY) {
        const waitTime = RATE_LIMIT_DELAY - (now - lastRequestTime);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    // Dakikada maksimum istek sayısını kontrol et
    if (requestCount >= MAX_REQUESTS_PER_MINUTE) {
        throw new Error('Çok fazla istek gönderildi. Lütfen bir dakika bekleyip tekrar deneyin.');
    }
    
    lastRequestTime = Date.now();
    requestCount++;
    
    // Her dakika request count'u sıfırla
    setTimeout(() => {
        requestCount = Math.max(0, requestCount - 1);
    }, 60000);
}

// Benzersiz ID oluştur
function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

        // API anahtarını test etme fonksiyonu
        async function testApiKey(apiKey) {
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemma-3n-e2b-it:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                text: "Merhaba"
                            }
                        ]
                    }
                ],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 8192
                }
            })
        });
        
        if (!response.ok) {
            return false;
        }
        
        const data = await response.json();
        console.log('Test API Response:', data); // Debug için
        
        // Yanıtın geçerli olup olmadığını kontrol et
        return data.candidates && data.candidates.length > 0;
    } catch (error) {
        console.error('API test hatası:', error);
        return false;
    }
}
