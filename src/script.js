const urlParams = new URLSearchParams(window.location.search);
const videoUrl = urlParams.get("videoUrl");
const videoId = urlParams.get("videoId");
const scheduleId = urlParams.get("scheduleId");
const videoTitle = urlParams.get("videoTitle");
const triggerType = urlParams.get("triggerType") || "scheduled";
const subtitlesParam = urlParams.get("subtitles");

let availableSubtitleFiles = [];
let activeSubtitleIndex = -1;

// Elementos do DOM
const videoPlayer = document.getElementById("videoPlayer");
const closeButton = document.getElementById("closeButton");
const currentTimeEl = document.getElementById("currentTime");
const durationEl = document.getElementById("duration");
const videoControls = document.getElementById("videoControls");
const loadingOverlay = document.getElementById("loadingOverlay");

// Controles
const playPauseBtn = document.getElementById("playPauseBtn");
const stopBtn = document.getElementById("stopBtn");
const volumeBtn = document.getElementById("volumeBtn");
const volumeSlider = document.getElementById("volumeSlider");
const loopBtn = document.getElementById("loopBtn");
const speedBtn = document.getElementById("speedBtn");
const pipBtn = document.getElementById("pipBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const subtitleBtn = document.getElementById("subtitleBtn");

// Barra de progresso
const progressBar = document.getElementById("progressBar");
const progressFilled = document.getElementById("progressFilled");
const progressHandle = document.getElementById("progressHandle");
const bufferedBar = document.getElementById("bufferedBar");

// Legendas
const subtitleContainer = document.getElementById("subtitleContainer");
const subtitleText = document.getElementById("subtitleText");
const subtitleMenu = document.getElementById("subtitleMenu");
const closeSubtitleMenu = document.getElementById("closeSubtitleMenu");
const loadSubtitleFile = document.getElementById("loadSubtitleFile");
const loadSubtitleURL = document.getElementById("loadSubtitleURL");
const subtitleList = document.getElementById("subtitleList");
const subtitleToggle = document.getElementById("subtitleToggle");

// Variáveis globais para estado do vídeo
window.hasVideoCompleted = false;
window.videoDuration = 0;
window.playbackStartTime = null;
window.videoPlayer = videoPlayer;
window.sessionId = Math.random().toString(36).substring(2, 15);

// Estado dos controles
let isPlaying = false;
let isDragging = false;
let isFullscreen = false;
let isLooping = false; // Desabilitado por padrão
let currentSpeed = 1;
let hideControlsTimeout;

const runtimeInfo =
    window.electronAPI && typeof window.electronAPI.getRuntimeInfo === "function"
        ? window.electronAPI.getRuntimeInfo()
        : { isProduction: false, logLevel: "debug" };

const rendererLevels = { debug: 10, info: 20, warn: 30, error: 40, none: 100 };
const rendererCurrentLevel = rendererLevels[runtimeInfo.logLevel] ? runtimeInfo.logLevel : "debug";

function canRenderLog(level) {
    return rendererLevels[level] >= rendererLevels[rendererCurrentLevel];
}

const logger = {
    debug: (...args) => {
        if (!canRenderLog("debug")) return;
        console.debug("[renderer]", ...args);
    },
    info: (...args) => {
        if (!canRenderLog("info")) return;
        console.info("[renderer]", ...args);
    },
    warn: (...args) => {
        if (!canRenderLog("warn")) return;
        console.warn("[renderer]", ...args);
    },
    error: (...args) => {
        if (!canRenderLog("error")) return;
        console.error("[renderer]", ...args);
    },
};

logger.info("🎬 Dados do vídeo:", { videoId, videoTitle, triggerType });

if (subtitlesParam) {
    try {
        const parsed = JSON.parse(subtitlesParam);
        if (Array.isArray(parsed)) {
            availableSubtitleFiles = parsed.filter(item => item && item.url);
        }
    } catch (error) {
        logger.warn("⚠️ Falha ao ler legendas da API:", error);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function reportVideoEvent(eventType, additionalData = {}) {
    try {
        if (!window.electronAPI || typeof window.electronAPI.reportVideoView !== "function") {
            logger.info('⚠️ electronAPI não disponível');
            return;
        }

        const reportData = {
            video_id: videoId || null,
            video_title: videoTitle,
            schedule_id: scheduleId || null,
            timestamp: new Date().toISOString(),
            event_type: eventType,
            trigger_type: triggerType,
            playback_position: videoPlayer ? Math.floor(videoPlayer.currentTime * 100) / 100 || 0 : 0,
            video_duration: Math.floor(window.videoDuration * 100) / 100 || 0,
            session_id: window.sessionId,
            ...additionalData,
        };

        logger.info('📤 Enviando evento:', eventType, {
            video_id: reportData.video_id,
            video_title: reportData.video_title,
            position: reportData.playback_position,
            duration: reportData.video_duration
        });
        
        window.electronAPI.reportVideoView(reportData);
    } catch (error) {
        logger.error("❌ Erro ao reportar evento:", error);
    }
}

// Funções dos controles
function updatePlayPauseButton() {
    const playIcon = playPauseBtn.querySelector('.play-icon');
    const pauseIcon = playPauseBtn.querySelector('.pause-icon');
    
    if (isPlaying) {
        playIcon.style.display = 'none';
        pauseIcon.style.display = 'block';
        playPauseBtn.classList.add('playing');
        playPauseBtn.classList.remove('paused');
    } else {
        playIcon.style.display = 'block';
        pauseIcon.style.display = 'none';
        playPauseBtn.classList.add('paused');
        playPauseBtn.classList.remove('playing');
    }
}

function updateVolumeButton() {
    const volumeUpIcon = volumeBtn.querySelector('.volume-up-icon');
    const volumeDownIcon = volumeBtn.querySelector('.volume-down-icon');
    const volumeOffIcon = volumeBtn.querySelector('.volume-off-icon');
    
    // Esconder todos os ícones
    volumeUpIcon.style.display = 'none';
    volumeDownIcon.style.display = 'none';
    volumeOffIcon.style.display = 'none';
    
    // Mostrar o ícone apropriado
    if (videoPlayer.muted || videoPlayer.volume === 0) {
        volumeOffIcon.style.display = 'block';
        volumeBtn.classList.add('volume-off');
        volumeBtn.classList.remove('volume-up', 'volume-down');
    } else if (videoPlayer.volume < 0.5) {
        volumeDownIcon.style.display = 'block';
        volumeBtn.classList.add('volume-down');
        volumeBtn.classList.remove('volume-up', 'volume-off');
    } else {
        volumeUpIcon.style.display = 'block';
        volumeBtn.classList.add('volume-up');
        volumeBtn.classList.remove('volume-down', 'volume-off');
    }
}

function updateFullscreenButton() {
    const enterIcon = fullscreenBtn.querySelector('.fullscreen-enter-icon');
    const exitIcon = fullscreenBtn.querySelector('.fullscreen-exit-icon');
    
    if (isFullscreen) {
        enterIcon.style.display = 'none';
        exitIcon.style.display = 'block';
        fullscreenBtn.classList.add('fullscreen');
        fullscreenBtn.classList.remove('not-fullscreen');
    } else {
        enterIcon.style.display = 'block';
        exitIcon.style.display = 'none';
        fullscreenBtn.classList.add('not-fullscreen');
        fullscreenBtn.classList.remove('fullscreen');
    }
}

function updateLoopButton() {
    if (isLooping) {
        loopBtn.classList.add('active');
    } else {
        loopBtn.classList.remove('active');
    }
}

function updateSpeedButton() {
    speedBtn.querySelector('.speed-text').textContent = currentSpeed + 'x';
}

function updateProgress() {
    if (!isDragging && videoPlayer.duration) {
        const percent = (videoPlayer.currentTime / videoPlayer.duration) * 100;
        progressFilled.style.width = percent + '%';
        progressHandle.style.left = percent + '%';
    }
    
    // Atualizar tempo atual
    if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(videoPlayer.currentTime);
    }
}

function updateBuffered() {
    if (videoPlayer.buffered.length > 0) {
        const bufferedEnd = videoPlayer.buffered.end(videoPlayer.buffered.length - 1);
        const duration = videoPlayer.duration;
        if (duration > 0) {
            const bufferedPercent = (bufferedEnd / duration) * 100;
            bufferedBar.style.width = bufferedPercent + '%';
        }
    }
}

function showControls() {
    videoControls.classList.add('show');
    clearTimeout(hideControlsTimeout);
    
    if (isPlaying) {
        hideControlsTimeout = setTimeout(() => {
            videoControls.classList.remove('show');
        }, 3000);
    }
}

function togglePlayPause() {
    if (videoPlayer.paused) {
        videoPlayer.play();
        isPlaying = true;
    } else {
        videoPlayer.pause();
        isPlaying = false;
    }
    updatePlayPauseButton();
    showControls();
}

function stopVideo() {
    videoPlayer.pause();
    videoPlayer.currentTime = 0;
    isPlaying = false;
    updatePlayPauseButton();
    showControls();
}

function toggleMute() {
    videoPlayer.muted = !videoPlayer.muted;
    updateVolumeButton();
    showControls();
}

function toggleLoop() {
    isLooping = !isLooping;
    videoPlayer.loop = isLooping;
    updateLoopButton();
    showControls();
}

function toggleFullscreen() {
    const container = document.querySelector('.video-container');
    
    if (!isFullscreen) {
        if (container.requestFullscreen) {
            container.requestFullscreen();
        } else if (container.webkitRequestFullscreen) {
            container.webkitRequestFullscreen();
        } else if (container.mozRequestFullScreen) {
            container.mozRequestFullScreen();
        } else if (container.msRequestFullscreen) {
            container.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
    }
    showControls();
}

function changeSpeed(speed) {
    currentSpeed = parseFloat(speed);
    videoPlayer.playbackRate = currentSpeed;
    updateSpeedButton();
    
    // Atualizar menu de velocidade
    const speedOptions = document.querySelectorAll('.speed-option');
    speedOptions.forEach(option => {
        option.classList.remove('active');
        if (option.textContent === currentSpeed + 'x') {
            option.classList.add('active');
        }
    });
    
    showControls();
}

function toggleSpeedMenu() {
    const speedMenu = document.querySelector('.speed-menu');
    if (speedMenu) {
        speedMenu.classList.toggle('show');
    }
    showControls();
}

function createSpeedMenu() {
    const speedMenu = document.createElement('div');
    speedMenu.className = 'speed-menu';
    
    const speeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
    
    speeds.forEach(speed => {
        const option = document.createElement('button');
        option.className = 'speed-option';
        if (speed === 1) option.classList.add('active');
        option.textContent = speed + 'x';
        option.onclick = () => {
            changeSpeed(speed);
            toggleSpeedMenu();
        };
        speedMenu.appendChild(option);
    });
    
    speedBtn.appendChild(speedMenu);
}

async function togglePictureInPicture() {
    try {
        if (document.pictureInPictureElement) {
            await document.exitPictureInPicture();
        } else {
            await videoPlayer.requestPictureInPicture();
        }
    } catch (error) {
        logger.error('Error toggling PiP:', error);
    }
    showControls();
}

function seekTo(percent) {
    if (videoPlayer.duration) {
        videoPlayer.currentTime = (percent / 100) * videoPlayer.duration;
        updateProgress();
    }
}

// Funções de Legendas
function updateSubtitles() {
    if (!window.subtitleManager || !window.subtitleManager.isEnabled) {
        subtitleText.textContent = '';
        subtitleText.style.display = 'none';
        return;
    }
    
    const subtitle = window.subtitleManager.getSubtitleForTime(videoPlayer.currentTime);
    if (subtitle) {
        subtitleText.innerHTML = subtitle.text;
        subtitleText.style.display = 'block';
    } else {
        subtitleText.style.display = 'none';
    }
}

function toggleSubtitleMenu() {
    subtitleMenu.classList.toggle('show');
    showControls();
}

function hideSubtitleMenu() {
    subtitleMenu.classList.remove('show');
}

function updateSubtitleList() {
    if (availableSubtitleFiles.length) {
        subtitleList.innerHTML = availableSubtitleFiles.map((sub, index) => {
            const label = sub.label || sub.language || `Legenda ${index + 1}`;
            const activeClass = index === activeSubtitleIndex ? 'active' : '';
            return `<div class="subtitle-item ${activeClass}" data-source-index="${index}">
                <div class="subtitle-item-text">${label}</div>
            </div>`;
        }).join('');

        subtitleList.querySelectorAll('.subtitle-item').forEach(item => {
            item.addEventListener('click', async () => {
                const index = parseInt(item.dataset.sourceIndex);
                await loadSubtitleFromApi(index);
            });
        });

        return;
    }

    if (!window.subtitleManager || !window.subtitleManager.hasSubtitles()) {
        subtitleList.innerHTML = '<div class="subtitle-item">Nenhuma legenda carregada</div>';
        return;
    }
    
    const subtitles = window.subtitleManager.getSubtitleList();
    subtitleList.innerHTML = subtitles.map(sub => 
        `<div class="subtitle-item" data-index="${sub.index}">
            <strong>#${sub.index + 1}</strong> ${sub.start} - ${sub.end}<br>
            ${sub.text}
        </div>`
    ).join('');
    
    // Adicionar evento de clique nos itens
    subtitleList.querySelectorAll('.subtitle-item').forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            const subtitle = window.subtitleManager.currentSubtitles[index];
            if (subtitle) {
                videoPlayer.currentTime = subtitle.start;
                updateProgress();
            }
        });
    });
}

async function loadSubtitleFromApi(index) {
    const source = availableSubtitleFiles[index];
    if (!source || !source.url) {
        return;
    }

    try {
        const response = await fetch(source.url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const srtContent = await response.text();
        window.subtitleManager.currentSubtitles = window.subtitleManager.parseSRT(srtContent);
        window.subtitleManager.currentSubtitleIndex = 0;
        activeSubtitleIndex = index;
        subtitleToggle.checked = true;
        window.subtitleManager.setEnabled(true);
        updateSubtitleList();
        logger.info(`📝 Legenda carregada: ${source.label || source.url}`);
    } catch (error) {
        logger.error('❌ Falha ao carregar legenda da API:', error);
    }
}

async function loadSubtitleFromFile() {
    try {
        if (window.electronAPI && typeof window.electronAPI.showOpenDialog === 'function') {
            const result = await window.electronAPI.showOpenDialog({
                title: 'Carregar Arquivo de Legendas',
                filters: [
                    { name: 'Arquivos SRT', extensions: ['srt'] },
                    { name: 'Todos os Arquivos', extensions: ['*'] }
                ],
                properties: ['openFile']
            });
            
            if (result && !result.canceled && result.filePaths.length > 0) {
                // Carregar conteúdo do arquivo
                const response = await fetch(`file://${result.filePaths[0]}`);
                const srtContent = await response.text();
                window.subtitleManager.currentSubtitles = window.subtitleManager.parseSRT(srtContent);
                updateSubtitleList();
                logger.info('✅ Legenda carregada com sucesso');
            }
        } else {
            // Fallback para input file
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.srt';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    const text = await file.text();
                    window.subtitleManager.currentSubtitles = window.subtitleManager.parseSRT(text);
                    updateSubtitleList();
                    logger.info('✅ Legenda carregada com sucesso');
                }
            };
            input.click();
        }
    } catch (error) {
        logger.error('❌ Erro ao carregar legenda:', error);
    }
}

async function loadSubtitleFromURL() {
    try {
        const url = prompt('Digite a URL da legenda SRT:');
        if (!url) return;
        
        const response = await fetch(url);
        const srtContent = await response.text();
        window.subtitleManager.currentSubtitles = window.subtitleManager.parseSRT(srtContent);
        updateSubtitleList();
        logger.info('✅ Legenda baixada com sucesso');
    } catch (error) {
        logger.error('❌ Erro ao baixar legenda:', error);
    }
}

function toggleSubtitles() {
    if (!window.subtitleManager || !window.subtitleManager.hasSubtitles()) {
        subtitleToggle.checked = false;
        return;
    }
    
    window.subtitleManager.setEnabled(subtitleToggle.checked);
    if (!subtitleToggle.checked) {
        subtitleText.style.display = 'none';
    }
    logger.info(`📝 Legendas ${subtitleToggle.checked ? 'habilitadas' : 'desabilitadas'}`);
}

function setupVideoEventListeners() {
    if (!videoPlayer) return;

    videoPlayer.addEventListener("loadedmetadata", function () {
        window.videoDuration = videoPlayer.duration;
        logger.info('📏 Duração do vídeo:', window.videoDuration);

        if (durationEl) {
            durationEl.textContent = formatTime(window.videoDuration);
        }
        
        // Esconder loading overlay
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
        
        // Reportar que o vídeo foi carregado
        reportVideoEvent("video_loaded", {
            video_duration: window.videoDuration
        });
    });

    videoPlayer.addEventListener("timeupdate", function () {
        updateProgress();
        updateBuffered();
        updateSubtitles(); // Atualizar legendas
        
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
                logger.info('✅ Vídeo concluído!');
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
        isPlaying = false;
        updatePlayPauseButton();
        
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
        isPlaying = true;
        updatePlayPauseButton();

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
        window.playbackStartTime = null;
        isPlaying = false;
        updatePlayPauseButton();

        if (window.playbackStartTime) {
            const playbackTime = Date.now() - window.playbackStartTime;
            reportVideoEvent("playback_paused", {
                current_position: videoPlayer.currentTime,
                video_duration: window.videoDuration,
                playback_duration_ms: playbackTime
            });
        }
    });

    videoPlayer.addEventListener("error", function (e) {
        logger.error('❌ Erro no vídeo:', e);
        if (loadingOverlay) {
            loadingOverlay.classList.add('hidden');
        }
        reportVideoEvent("playback_error", {
            error_code: videoPlayer.error ? videoPlayer.error.code : 0,
            error_message: videoPlayer.error ? videoPlayer.error.message : 'Erro desconhecido'
        });
    });

    videoPlayer.addEventListener("volumechange", updateVolumeButton);
    videoPlayer.addEventListener("ratechange", () => updateSpeedButton());
}

function setupControlEvents() {
    // Play/Pause
    playPauseBtn.addEventListener("click", togglePlayPause);
    
    // Stop
    stopBtn.addEventListener("click", stopVideo);
    
    // Volume
    volumeBtn.addEventListener("click", toggleMute);
    volumeSlider.addEventListener("input", (e) => {
        videoPlayer.volume = e.target.value / 100;
        videoPlayer.muted = false;
        updateVolumeButton();
    });
    
    // Loop
    loopBtn.addEventListener("click", toggleLoop);
    
    // Speed
    speedBtn.addEventListener("click", toggleSpeedMenu);
    createSpeedMenu();
    
    // Picture-in-Picture
    pipBtn.addEventListener("click", togglePictureInPicture);
    
    // Fullscreen
    fullscreenBtn.addEventListener("click", toggleFullscreen);
    
    // Progress bar
    progressBar.addEventListener("click", (e) => {
        const rect = progressBar.getBoundingClientRect();
        const percent = ((e.clientX - rect.left) / rect.width) * 100;
        seekTo(percent);
    });
    
    // Progress handle drag
    progressHandle.addEventListener("mousedown", () => {
        isDragging = true;
    });
    
    document.addEventListener("mousemove", (e) => {
        if (isDragging) {
            const rect = progressBar.getBoundingClientRect();
            const percent = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            seekTo(percent);
        }
    });
    
    document.addEventListener("mouseup", () => {
        isDragging = false;
    });
    
    // Video click to play/pause
    videoPlayer.addEventListener("click", togglePlayPause);
    
    // Show controls on mouse move
    document.addEventListener("mousemove", showControls);
    
    // Fullscreen change events
    document.addEventListener("fullscreenchange", () => {
        isFullscreen = !!document.fullscreenElement;
        updateFullscreenButton();
    });
    
    document.addEventListener("webkitfullscreenchange", () => {
        isFullscreen = !!document.webkitFullscreenElement;
        updateFullscreenButton();
    });
    
    document.addEventListener("mozfullscreenchange", () => {
        isFullscreen = !!document.mozFullScreenElement;
        updateFullscreenButton();
    });
    
    document.addEventListener("MSFullscreenChange", () => {
        isFullscreen = !!document.msFullscreenElement;
        updateFullscreenButton();
    });
    
    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
        if (!speedBtn.contains(e.target)) {
            const speedMenu = document.querySelector('.speed-menu');
            if (speedMenu) {
                speedMenu.classList.remove('show');
            }
        }
        
        // Fechar menu de legendas ao clicar fora
        if (!subtitleMenu.contains(e.target) && !subtitleBtn.contains(e.target)) {
            hideSubtitleMenu();
        }
    });
    
    // Eventos de legendas
    subtitleBtn.addEventListener("click", toggleSubtitleMenu);
    closeSubtitleMenu.addEventListener("click", hideSubtitleMenu);
    loadSubtitleFile.addEventListener("click", loadSubtitleFromFile);
    loadSubtitleURL.addEventListener("click", loadSubtitleFromURL);
    subtitleToggle.addEventListener("change", toggleSubtitles);
}

function initializeVideo() {
    if (!videoPlayer) return;

    if (videoUrl && videoId) {
        try {
            videoPlayer.src = videoUrl;
            videoPlayer.loop = false; // Desabilitado por padrão
            videoPlayer.autoplay = true;
            videoPlayer.muted = false;
            videoPlayer.playsInline = true;

            // Setup dos listeners de eventos
            setupVideoEventListeners();
            setupControlEvents();

            // Inicializar estado dos controles
            updatePlayPauseButton();
            updateVolumeButton();
            updateFullscreenButton();
            updateLoopButton();
            updateSpeedButton();

            // Reportar abertura do popup
            reportVideoEvent("popup_opened", {
                video_duration: 0,
                trigger_type: triggerType
            });

            const playPromise = videoPlayer.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        logger.info('▶️ Autoplay iniciado com sucesso');
                        isPlaying = true;
                        updatePlayPauseButton();
                        reportVideoEvent("autoplay_started");
                        showControls();
                    })
                    .catch(async (error) => {
                        logger.info('⚠️ Autoplay bloqueado, tentando com mute:', error.message);
                        try {
                            videoPlayer.muted = true;
                            await videoPlayer.play();
                            logger.info('▶️ Autoplay iniciado com mute');
                            isPlaying = true;
                            updatePlayPauseButton();
                            reportVideoEvent("autoplay_started_muted");
                        } catch (retryError) {
                            logger.info('❌ Autoplay falhou:', retryError.message);
                            isPlaying = false;
                            updatePlayPauseButton();
                            reportVideoEvent("autoplay_blocked", {
                                error: retryError.message
                            });
                        } finally {
                            showControls();
                        }
                    });
            }
            
            /*
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        logger.info('▶️ Autoplay iniciado com sucesso');
                        isPlaying = true;
                        updatePlayPauseButton();
                        reportVideoEvent("autoplay_started");
                        showControls();
                    })
                    .catch((error) => {
                        logger.info('⚠️ Autoplay bloqueado:', error.message);
                        isPlaying = false;
                        updatePlayPauseButton();
                        reportVideoEvent("autoplay_blocked", {
                            error: error.message
                        });
                        showControls();
                    });
            }
            */
        } catch (error) {
            logger.error('❌ Erro ao carregar vídeo principal:', error);
            if (loadingOverlay) {
                loadingOverlay.classList.add('hidden');
            }
            // Fallback para vídeo de exemplo
            videoPlayer.src = "https://www.youtube.com/watch?v=CsWRNAJytcY";
            videoPlayer.loop = false; // Desabilitado por padrão
            videoPlayer.autoplay = false; // Desabilitar autoplay
            setupVideoEventListeners();
            setupControlEvents();
            // Removido videoPlayer.play() para não iniciar automaticamente
        }
    } else {
        // Fallback se não houver dados na URL
        logger.warn('⚠️ Sem dados de vídeo na URL, usando fallback');
        videoPlayer.src = "https://www.youtube.com/watch?v=CsWRNAJytcY";
        videoPlayer.loop = false; // Desabilitado por padrão
        videoPlayer.autoplay = false; // Desabilitar autoplay
        setupVideoEventListeners();
        setupControlEvents();
        // Removido videoPlayer.play() para não iniciar automaticamente
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
                if (window.electronAPI && typeof window.electronAPI.minimizeWindow === "function") {
                    window.electronAPI.minimizeWindow();
                } else if (window.close) {
                    window.close();
                }
            } catch (error) {
                logger.error("❌ Erro ao minimizar janela:", error);
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
            togglePlayPause();
            break;
        case "m":
        case "M":
            e.preventDefault();
            toggleMute();
            break;
        case "f":
        case "F":
            e.preventDefault();
            toggleFullscreen();
            break;
        case "ArrowLeft":
            e.preventDefault();
            videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 5);
            break;
        case "ArrowRight":
            e.preventDefault();
            videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 5);
            break;
        case "ArrowUp":
            e.preventDefault();
            videoPlayer.volume = Math.min(1, videoPlayer.volume + 0.1);
            volumeSlider.value = videoPlayer.volume * 100;
            updateVolumeButton();
            break;
        case "ArrowDown":
            e.preventDefault();
            videoPlayer.volume = Math.max(0, videoPlayer.volume - 0.1);
            volumeSlider.value = videoPlayer.volume * 100;
            updateVolumeButton();
            break;
    }
});

// Inicialização quando a página carrega
window.addEventListener("DOMContentLoaded", function () {
    logger.info('🚀 DOM carregado, inicializando vídeo...');
    
    // Inicializar gerenciador de legendas (classe simples para renderer)
    window.subtitleManager = {
        currentSubtitles: [],
        currentSubtitleIndex: 0,
        isEnabled: false,
        
        parseSRT: function(srtContent) {
            const lines = srtContent.split('\n');
            const subtitles = [];
            let currentSubtitle = null;
            
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                
                if (line === '') {
                    if (currentSubtitle) {
                        subtitles.push(currentSubtitle);
                        currentSubtitle = null;
                    }
                    continue;
                }
                
                if (/^\d+$/.test(line)) {
                    if (currentSubtitle) {
                        subtitles.push(currentSubtitle);
                    }
                    currentSubtitle = {
                        index: parseInt(line),
                        start: null,
                        end: null,
                        text: []
                    };
                    continue;
                }
                
                if (line.includes('-->')) {
                    if (currentSubtitle) {
                        const [start, end] = line.split('-->').map(t => t.trim());
                        currentSubtitle.start = this.parseTime(start);
                        currentSubtitle.end = this.parseTime(end);
                    }
                    continue;
                }
                
                if (currentSubtitle && (currentSubtitle.start !== null)) {
                    currentSubtitle.text.push(line);
                }
            }
            
            if (currentSubtitle) {
                subtitles.push(currentSubtitle);
            }
            
            return subtitles;
        },
        
        parseTime: function(timeStr) {
            const [time, milliseconds] = timeStr.split(',');
            const [hours, minutes, seconds] = time.split(':').map(Number);
            return hours * 3600 + minutes * 60 + seconds + (parseInt(milliseconds) / 1000);
        },
        
        getSubtitleForTime: function(currentTime) {
            if (!this.currentSubtitles.length) return null;
            
            for (let i = 0; i < this.currentSubtitles.length; i++) {
                const subtitle = this.currentSubtitles[i];
                if (currentTime >= subtitle.start && currentTime <= subtitle.end) {
                    if (i !== this.currentSubtitleIndex) {
                        this.currentSubtitleIndex = i;
                    }
                    return {
                        text: subtitle.text.join('<br>'),
                        index: i
                    };
                }
            }
            
            return null;
        },
        
        setEnabled: function(enabled) {
            this.isEnabled = enabled;
            logger.info(`📝 Legendas ${enabled ? 'habilitadas' : 'desabilitadas'}`);
        },
        
        hasSubtitles: function() {
            return this.currentSubtitles.length > 0;
        },
        
        getSubtitleList: function() {
            return this.currentSubtitles.map((sub, index) => ({
                index: index,
                start: this.formatTime(sub.start),
                end: this.formatTime(sub.end),
                text: sub.text.slice(0, 50) + (sub.text.length > 50 ? '...' : '')
            }));
        },
        
        formatTime: function(seconds) {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            const ms = Math.floor((seconds % 1) * 1000);
            
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
        }
    };
    
    initializeVideo();

    // Reportar que a janela foi carregada
    reportVideoEvent("window_loaded");

    // Mostrar controles inicialmente
    showControls();
    
    // Inicializar legendas (API primeiro)
    if (availableSubtitleFiles.length) {
        loadSubtitleFromApi(0);
    } else {
        updateSubtitleList();
    }
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

// Listener para pedido de fechamento vindo do main
if (window.electronAPI && typeof window.electronAPI.onWindowCloseRequest === "function") {
    window.electronAPI.onWindowCloseRequest(() => {
        if (typeof window.reportWindowClose === "function") {
            window.reportWindowClose();
        }
    });
}
