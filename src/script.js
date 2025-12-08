// REMOVA qualquer 'return' no top-level do arquivo
// Certifique-se de que todo o código está dentro de funções ou execução direta

console.log('=== VIDEO PLAYER INICIANDO ===');

// Verificar ambiente - CORRIGIDO: sem return
try {
    console.log('🔧 Verificando ambiente Electron...');
    console.log('  - window.require disponível:', typeof window.require !== 'undefined');
    if (typeof window.require !== 'undefined') {
        const electron = window.require('electron');
        console.log('  - electron disponível:', !!electron);
        console.log('  - ipcRenderer disponível:', !!electron.ipcRenderer);
    }
} catch (e) {
    console.error('⚠️  Erro ao verificar Electron:', e.message);
}

// Obter parâmetros da URL
const urlParams = new URLSearchParams(window.location.search);
const videoUrl = urlParams.get('videoUrl');
const videoId = urlParams.get('videoId');
const videoTitle = urlParams.get('videoTitle');
const triggerType = urlParams.get('triggerType') || 'scheduled';

console.log('📋 Parâmetros recebidos:');
console.log('  Title:', videoTitle);
console.log('  ID:', videoId);
console.log('  Trigger:', triggerType);
console.log('  URL:', videoUrl ? videoUrl.substring(0, 100) + '...' : 'null');

// Referências aos elementos DOM
const videoPlayer = document.getElementById('videoPlayer');
const closeButton = document.getElementById('closeButton');
const currentTimeEl = document.getElementById('currentTime');
const durationEl = document.getElementById('duration');
const progressContainer = document.getElementById('progressContainer');

// Verificar se elementos existem
if (!videoPlayer) {
    console.error('❌ Elemento videoPlayer não encontrado!');
    document.body.innerHTML = '<div style="color:white;padding:20px;text-align:center;font-size:20px;">Erro: Elemento de vídeo não encontrado</div>';
} else {
    console.log('✅ Elementos HTML encontrados:', {
        videoPlayer: !!videoPlayer,
        closeButton: !!closeButton,
        currentTimeEl: !!currentTimeEl,
        durationEl: !!durationEl,
        progressContainer: !!progressContainer
    });
}

// Função para formatar tempo
function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Função para reportar eventos
function reportVideoEvent(eventType, additionalData = {}) {
    try {
        console.log(`📤 Tentando reportar evento: ${eventType}`);
        
        if (!window.require) {
            console.log('⚠️  window.require não disponível');
            return; // ESTE return está dentro de uma função, então é válido
        }
        
        const electron = window.require('electron');
        if (!electron || !electron.ipcRenderer) {
            console.log('⚠️  ipcRenderer não disponível');
            return;
        }
        
        const { ipcRenderer } = electron;
        
        const reportData = {
            videoId: videoId,
            videoTitle: videoTitle,
            timestamp: new Date().toISOString(),
            event_type: eventType,
            trigger_type: triggerType,
            playback_position: videoPlayer ? videoPlayer.currentTime || 0 : 0,
            ...additionalData
        };
        
        console.log('📤 Enviando evento:', eventType);
        ipcRenderer.send('report-video-view', reportData);
        console.log('✅ Evento enviado com sucesso');
    } catch (error) {
        console.error('❌ Erro ao enviar evento:', error.message);
    }
}

// Inicializar o vídeo se temos URL
function initializeVideo() {
    if (!videoPlayer) return;
    
    if (videoUrl && videoId) {
        console.log('🔗 Configurando vídeo...');
        
        try {
            // Configurar para LOOP infinito
            videoPlayer.src = videoUrl;
            videoPlayer.loop = true; // IMPORTANTE: loop ativado
            videoPlayer.autoplay = true;
            videoPlayer.muted = true; // Necessário para autoplay
            
            console.log('✅ Vídeo configurado com loop ativado');
            
            // Evento quando vídeo termina (e recomeça devido ao loop)
            videoPlayer.addEventListener('ended', function() {
                console.log('🔄 Vídeo terminou - recomeçando devido ao loop');
                // O loop automático deve recomeçar o vídeo
            });
            
            // Tentar reproduzir
            const playPromise = videoPlayer.play();
            
            if (playPromise !== undefined) {
                playPromise.then(() => {
                    console.log('✅ Vídeo iniciado automaticamente');
                }).catch(error => {
                    console.log('⚠️  Auto-play prevenido:', error.message);
                    // Mostrar instrução
                    if (progressContainer) {
                        const clickMsg = document.createElement('div');
                        clickMsg.style.cssText = 'color:yellow;font-size:14px;margin-top:10px;text-align:center;';
                        clickMsg.textContent = 'Clique no vídeo para iniciar';
                        progressContainer.appendChild(clickMsg);
                    }
                });
            }
            
        } catch (error) {
            console.error('❌ Erro ao configurar vídeo:', error);
            // Fallback
            videoPlayer.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
            videoPlayer.loop = true;
            videoPlayer.play().catch(console.error);
        }
    } else {
        console.log('⚠️  Usando vídeo de fallback');
        videoPlayer.src = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
        videoPlayer.loop = true;
        videoPlayer.play().catch(console.error);
    }
}

// No evento do botão fechar:
if (closeButton) {
    closeButton.addEventListener('click', function() {
        console.log('❌ Botão fechar clicado - minimizando janela');
        
        // Parar vídeo
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.currentTime = 0;
        }
        
        // Reportar evento (opcional)
        try {
            if (typeof reportVideoEvent === 'function') {
                reportVideoEvent('user_closed', {
                    final_position: videoPlayer ? videoPlayer.currentTime : 0
                });
            }
        } catch (e) {
            console.log('⚠️  Não foi possível reportar evento');
        }
        
        // Enviar comando para minimizar
        setTimeout(() => {
            try {
                if (window.require && window.require('electron')) {
                    const electron = window.require('electron');
                    if (electron && electron.ipcRenderer) {
                        console.log('📤 Enviando minimize-window...');
                        electron.ipcRenderer.send('minimize-window');
                    } else {
                        console.log('⚠️  IPC não disponível, usando fallback');
                        // Fallback: tentar fechar apenas esta janela
                        if (window.close) {
                            window.close();
                        }
                    }
                } else {
                    console.log('⚠️  Electron não disponível');
                }
            } catch (error) {
                console.error('❌ Erro ao enviar comando minimize:', error);
            }
        }, 50);
    });
}


// Atalhos de teclado
document.addEventListener('keydown', function(e) {
    if (!videoPlayer) return;
    
    switch(e.key) {
        case 'Escape':
        case 'x':
        case 'X':
            if (closeButton) closeButton.click();
            break;
        case ' ':
            e.preventDefault();
            if (videoPlayer.paused) {
                videoPlayer.play();
                if (progressContainer) progressContainer.style.opacity = '1';
            } else {
                videoPlayer.pause();
                if (progressContainer) progressContainer.style.opacity = '1';
            }
            break;
    }
});

// Mostrar/ocultar controles com mouse
let progressTimeout;
document.addEventListener('mousemove', function() {
    if (progressContainer) progressContainer.style.opacity = '1';
    if (closeButton) closeButton.style.opacity = '1';
    
    clearTimeout(progressTimeout);
    progressTimeout = setTimeout(function() {
        if (videoPlayer && !videoPlayer.paused) {
            if (progressContainer) progressContainer.style.opacity = '0.5';
            if (closeButton) closeButton.style.opacity = '0.8';
        }
    }, 2000);
});

// Clique no vídeo para pausar/retomar
if (videoPlayer) {
    videoPlayer.addEventListener('click', function() {
        if (videoPlayer.paused) {
            videoPlayer.play();
        } else {
            videoPlayer.pause();
        }
    });
}

// Inicializar quando a página carregar
window.addEventListener('DOMContentLoaded', function() {
    console.log('✅ DOM carregado, inicializando vídeo...');
    initializeVideo();
    
    // Mostrar controles inicialmente
    setTimeout(function() {
        if (progressContainer) progressContainer.style.opacity = '0.5';
        if (closeButton) closeButton.style.opacity = '0.8';
    }, 3000);
});

console.log('✅ Script do vídeo carregado com sucesso');