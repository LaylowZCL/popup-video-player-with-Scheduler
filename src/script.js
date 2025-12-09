const urlParams = new URLSearchParams(window.location.search);
const videoUrl = urlParams.get("videoUrl");
const videoId = urlParams.get("videoId");
const videoTitle = urlParams.get("videoTitle");
const triggerType = urlParams.get("triggerType") || "scheduled";

const videoPlayer = document.getElementById("videoPlayer");
const closeButton = document.getElementById("closeButton");
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const progressContainer = document.getElementById("progressContainer");

// Variáveis globais para estado do vídeo
window.hasVideoCompleted = false;
window.videoDuration = 0;
window.playbackStartTime = null;
window.videoPlayer = videoPlayer;
window.sessionId = Math.random().toString(36).substring(2, 15);

// Log inicial para debug
console.log("🎬 Dados do vídeo:", { videoId, videoTitle, triggerType });

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function reportVideoEvent(eventType, additionalData = {}) {
    try {
        if (!window.require) {
            console.log('⚠️ Electron não disponível');
            return;
        }

        const electron = window.require("electron");
        if (!electron || !electron.ipcRenderer) {
            console.log('⚠️ ipcRenderer não disponível');
            return;
        }

        const { ipcRenderer } = electron;

        const reportData = {
            video_id: videoId,
            video_title: videoTitle,
            timestamp: new Date().toISOString(),
            event_type: eventType,
            trigger_type: triggerType,
            playback_position: videoPlayer ? Math.floor(videoPlayer.currentTime * 100) / 100 || 0 : 0,
            video_duration: Math.floor(window.videoDuration * 100) / 100 || 0,
            session_id: window.sessionId,
            ...additionalData,
        };

        console.log('📤 Enviando evento:', eventType, {
            video_id: reportData.video_id,
            video_title: reportData.video_title,
            position: reportData.playback_position,
            duration: reportData.video_duration
        });
        
        ipcRenderer.send("report-video-view", reportData);
    } catch (error) {
        console.error("❌ Erro ao reportar evento:", error);
    }
}

function setupVideoEventListeners() {
    if (!videoPlayer) return;

    videoPlayer.addEventListener("loadedmetadata", function () {
        window.videoDuration = videoPlayer.duration;
        console.log('📏 Duração do vídeo:', window.videoDuration);

        if (durationEl) {
            durationEl.textContent = formatTime(window.videoDuration);
        }
        
        // Reportar que o vídeo foi carregado
        reportVideoEvent("video_loaded", {
            video_duration: window.videoDuration
        });
    });

    videoPlayer.addEventListener("timeupdate", function () {
        // Atualizar display de tempo
        if (currentTimeEl) {
            currentTimeEl.textContent = formatTime(videoPlayer.currentTime);
        }
        
        // Verificar marcos de porcentagem
        if (window.videoDuration > 0) {
            const percent = (videoPlayer.currentTime / window.videoDuration) * 100;
            
            // Reportar marcos de 25%, 50%, 75%
            if (percent >= 25 && percent < 26 && !window.reported25) {
                reportVideoEvent("playback_25_percent", {
                    playback_position: videoPlayer.currentTime,
                    percentage: 25
                });
                window.reported25 = true;
            }
            if (percent >= 50 && percent < 51 && !window.reported50) {
                reportVideoEvent("playback_50_percent", {
                    playback_position: videoPlayer.currentTime,
                    percentage: 50
                });
                window.reported50 = true;
            }
            if (percent >= 75 && percent < 76 && !window.reported75) {
                reportVideoEvent("playback_75_percent", {
                    playback_position: videoPlayer.currentTime,
                    percentage: 75
                });
                window.reported75 = true;
            }
            
            // Verificar conclusão (último 5% do vídeo)
            if (percent >= 95 && !window.hasVideoCompleted) {
                window.hasVideoCompleted = true;
                console.log('✅ Vídeo concluído!');
                reportVideoEvent("video_completed", {
                    video_duration: window.videoDuration,
                    final_position: videoPlayer.currentTime,
                    completed_loop: true,
                    percentage_completed: percent
                });
            }
        }
    });

    videoPlayer.addEventListener("ended", function () {
        window.hasVideoCompleted = true;
        
        if (!videoPlayer.loop) {
            reportVideoEvent("video_completed", {
                video_duration: window.videoDuration,
                final_position: videoPlayer.currentTime,
                completed_loop: false
            });
        }
        
        // Resetar flags para próximo loop
        if (videoPlayer.loop) {
            setTimeout(() => {
                window.hasVideoCompleted = false;
                window.reported25 = false;
                window.reported50 = false;
                window.reported75 = false;
            }, 100);
        }
    });

    videoPlayer.addEventListener("play", function () {
        window.playbackStartTime = Date.now();

        if (videoPlayer.currentTime === 0) {
            reportVideoEvent("playback_started", {
                video_duration: window.videoDuration
            });
        } else {
            reportVideoEvent("playback_resumed", {
                current_position: videoPlayer.currentTime,
                video_duration: window.videoDuration
            });
        }
    });

    videoPlayer.addEventListener("pause", function () {
        if (window.playbackStartTime) {
            const playbackTime = Date.now() - window.playbackStartTime;
            reportVideoEvent("playback_paused", {
                current_position: videoPlayer.currentTime,
                video_duration: window.videoDuration,
                playback_duration_ms: playbackTime
            });
            window.playbackStartTime = null;
        }
    });

    videoPlayer.addEventListener("error", function (e) {
        console.error('❌ Erro no vídeo:', e);
        reportVideoEvent("playback_error", {
            error_code: videoPlayer.error ? videoPlayer.error.code : 0,
            error_message: videoPlayer.error ? videoPlayer.error.message : 'Erro desconhecido'
        });
    });
}

function initializeVideo() {
    if (!videoPlayer) return;

    if (videoUrl && videoId) {
        try {
            videoPlayer.src = videoUrl;
            videoPlayer.loop = true;
            videoPlayer.autoplay = true;
            videoPlayer.muted = true;
            videoPlayer.playsInline = true;

            // Setup dos listeners de eventos
            setupVideoEventListeners();

            // Reportar abertura do popup
            reportVideoEvent("popup_opened", {
                video_duration: 0, // Será atualizado após loadedmetadata
                trigger_type: triggerType
            });

            const playPromise = videoPlayer.play();

            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        console.log('▶️ Autoplay iniciado com sucesso');
                        reportVideoEvent("autoplay_started");
                    })
                    .catch((error) => {
                        console.log('⚠️ Autoplay bloqueado:', error.message);
                        if (progressContainer) {
                            const clickMsg = document.createElement("div");
                            clickMsg.style.cssText =
                                "color:yellow;font-size:14px;margin-top:10px;text-align:center;";
                            clickMsg.textContent = "Clique no vídeo para iniciar";
                            progressContainer.appendChild(clickMsg);
                        }
                        reportVideoEvent("autoplay_blocked", {
                            error: error.message
                        });
                    });
            }
        } catch (error) {
            console.error('❌ Erro ao carregar vídeo principal:', error);
            // Fallback para vídeo de exemplo
            videoPlayer.src =
                "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
            videoPlayer.loop = true;
            setupVideoEventListeners();
            videoPlayer.play().catch(() => {});
        }
    } else {
        // Fallback se não houver dados na URL
        console.warn('⚠️ Sem dados de vídeo na URL, usando fallback');
        videoPlayer.src =
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";
        videoPlayer.loop = true;
        setupVideoEventListeners();
        videoPlayer.play().catch(() => {});
    }
}

// Evento do botão de fechar
if (closeButton) {
    closeButton.addEventListener("click", function () {
        let eventType = "user_closed";
        let additionalData = {
            final_position: videoPlayer ? Math.floor(videoPlayer.currentTime * 100) / 100 : 0,
        };

        // Determinar tipo de evento baseado no estado
        if (videoPlayer) {
            if (window.hasVideoCompleted) {
                eventType = "window_closed_after_completion";
                additionalData.completed_before_close = true;
            } else if (videoPlayer.currentTime > 0) {
                eventType = "video_interrupted";
                additionalData.interruption_reason = "user_clicked_close";
                additionalData.video_duration = window.videoDuration;
                additionalData.percentage_completed = window.videoDuration > 0 ? 
                    Math.floor((videoPlayer.currentTime / window.videoDuration) * 100) : 0;
            }
        }

        // Pausar vídeo antes de fechar
        if (videoPlayer) {
            videoPlayer.pause();
            videoPlayer.currentTime = 0;
        }

        // Reportar o evento
        reportVideoEvent(eventType, additionalData);

        // Fechar/minimizar após delay
        setTimeout(() => {
            try {
                if (window.require && window.require("electron")) {
                    const electron = window.require("electron");
                    if (electron && electron.ipcRenderer) {
                        electron.ipcRenderer.send("minimize-window");
                    } else if (window.close) {
                        window.close();
                    }
                }
            } catch (error) {
                console.error("❌ Erro ao minimizar janela:", error);
            }
        }, 100);
    });
}

// Controles de teclado
document.addEventListener("keydown", function (e) {
    if (!videoPlayer) return;

    switch (e.key) {
        case "Escape":
        case "x":
        case "X":
            if (closeButton) closeButton.click();
            break;
        case " ":
            e.preventDefault();
            if (videoPlayer.paused) {
                videoPlayer.play();
                if (progressContainer) progressContainer.style.opacity = "1";
            } else {
                videoPlayer.pause();
                if (progressContainer) progressContainer.style.opacity = "1";
            }
            break;
        case "m":
        case "M":
            e.preventDefault();
            videoPlayer.muted = !videoPlayer.muted;
            break;
    }
});

// Esconder controles após inatividade
let progressTimeout;
document.addEventListener("mousemove", function () {
    if (progressContainer) progressContainer.style.opacity = "1";
    if (closeButton) closeButton.style.opacity = "1";

    clearTimeout(progressTimeout);
    progressTimeout = setTimeout(function () {
        if (videoPlayer && !videoPlayer.paused) {
            if (progressContainer) progressContainer.style.opacity = "0.3";
            if (closeButton) closeButton.style.opacity = "0.5";
        }
    }, 2000);
});

// Controle por clique no vídeo
if (videoPlayer) {
    videoPlayer.addEventListener("click", function () {
        if (videoPlayer.paused) {
            videoPlayer.play();
        } else {
            videoPlayer.pause();
        }
    });
}

// Inicialização quando a página carrega
window.addEventListener("DOMContentLoaded", function () {
    console.log('🚀 DOM carregado, inicializando vídeo...');
    initializeVideo();

    // Reportar que a janela foi carregada
    reportVideoEvent("window_loaded");

    setTimeout(function () {
        if (progressContainer) progressContainer.style.opacity = "0.3";
        if (closeButton) closeButton.style.opacity = "0.5";
    }, 3000);
});

// Função para ser chamada quando a janela for minimizada
window.reportWindowClose = function () {
    if (videoPlayer && !window.hasVideoCompleted && videoPlayer.currentTime > 0) {
        reportVideoEvent("video_interrupted", {
            final_position: videoPlayer.currentTime,
            interruption_reason: "window_minimized",
            video_duration: window.videoDuration,
            percentage_completed: window.videoDuration > 0 ? 
                Math.floor((videoPlayer.currentTime / window.videoDuration) * 100) : 0
        });
    }
};