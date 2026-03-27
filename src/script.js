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
const volumeBtn = document.getElementById("volumeBtn");
const volumeSlider = document.getElementById("volumeSlider");
const loopBtn = document.getElementById("loopBtn");
const speedBtn = document.getElementById("speedBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");
const subtitleBtn = document.getElementById("subtitleBtn");

// Barra de progresso
const progressBarContainer = document.getElementById("progressBarContainer");
const progressBar = document.getElementById("progressBar");
const progressFilled = document.getElementById("progressFilled");
const progressHandle = document.getElementById("progressHandle");
const bufferedBar = document.getElementById("bufferedBar");
const progressTooltip = document.getElementById("progressTooltip");
const progressSlider = document.getElementById("progressSlider");

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
let tooltipHideTimeout = null;
let isUserSeeking = false;

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
        if (progressSlider) {
            progressSlider.value = percent;
        }
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
        option.onclick = (event) => {
            event.stopPropagation();
            changeSpeed(speed);
            toggleSpeedMenu();
        };
        speedMenu.appendChild(option);
    });
    
    speedBtn.appendChild(speedMenu);
}

function seekTo(percent) {
    if (videoPlayer.duration) {
        const safePercent = Math.max(0, Math.min(100, percent));
        videoPlayer.currentTime = (safePercent / 100) * videoPlayer.duration;
        updateProgress();
    }
}

function getProgressMetrics(clientX = null, percent = null) {
    const rect = progressBar.getBoundingClientRect();
    if (!rect.width) {
        return { percent: 0, offsetX: 0, rect };
    }

    let resolvedPercent = percent;
    let offsetX = 0;

    if (typeof clientX === "number") {
        offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
        resolvedPercent = Math.max(0, Math.min(100, (offsetX / rect.width) * 100));
    } else {
        resolvedPercent = Math.max(0, Math.min(100, Number(percent || 0)));
        offsetX = (resolvedPercent / 100) * rect.width;
    }

    return { percent: resolvedPercent, offsetX, rect };
}

function seekFromPercent(percent) {
    seekTo(percent);
    if (progressSlider) {
        progressSlider.value = Math.max(0, Math.min(100, percent));
    }
}

function handleProgressSeekStart(percent) {
    isDragging = true;
    isUserSeeking = true;
    seekFromPercent(percent);
    showControls();
}

function handleProgressSeekMove(percent) {
    if (!isDragging) return;
    seekFromPercent(percent);
}

function handleProgressSeekEnd(percent = null) {
    if (!isDragging) {
        return;
    }

    if (percent !== null) {
        seekFromPercent(percent);
    }

    isDragging = false;
}

function setProgressTooltip(clientX = null, percent = null) {
    if (!progressBarContainer || !progressTooltip) return;

    const metrics = getProgressMetrics(clientX, percent);
    const seconds = videoPlayer.duration ? (metrics.percent / 100) * videoPlayer.duration : 0;

    progressTooltip.textContent = formatTime(seconds);
    progressTooltip.style.left = `${metrics.offsetX}px`;
}

function clearProgressTooltipHideTimeout() {
    if (tooltipHideTimeout) {
        clearTimeout(tooltipHideTimeout);
        tooltipHideTimeout = null;
    }
}

function showProgressTooltip(clientX) {
    if (!progressTooltip) return;
    clearProgressTooltipHideTimeout();
    setProgressTooltip(clientX);
    progressTooltip.classList.add('show');
}

function hideProgressTooltip(immediate = false) {
    if (!progressTooltip || isDragging) return;

    clearProgressTooltipHideTimeout();

    if (immediate) {
        progressTooltip.classList.remove('show');
        return;
    }

    tooltipHideTimeout = setTimeout(() => {
        progressTooltip.classList.remove('show');
        tooltipHideTimeout = null;
    }, 120);
}

function stopEventPropagation(event) {
    if (!event) return;
    event.preventDefault();
    event.stopPropagation();
}

// Funções de Legendas
function updateSubtitleScale() {
    if (!subtitleContainer || !subtitleText) return;

    const container = document.querySelector('.video-container') || videoPlayer;
    const rect = container.getBoundingClientRect();
    const width = Math.max(rect.width || window.innerWidth, 320);
    const height = Math.max(rect.height || window.innerHeight, 180);
    const baseSize = Math.max(14, Math.min(28, Math.round(Math.min(width * 0.022, height * 0.038))));
    const offsetBottom = Math.max(20, Math.round(height * 0.055));

    subtitleContainer.style.setProperty('--subtitle-font-size', `${baseSize}px`);
    subtitleContainer.style.setProperty('--subtitle-line-height', `${Math.max(1.15, Math.min(1.3, 1.08 + (baseSize / 120)))}`);
    subtitleContainer.style.setProperty('--subtitle-padding-y', `${Math.max(6, Math.round(baseSize * 0.24))}px`);
    subtitleContainer.style.setProperty('--subtitle-padding-x', `${Math.max(10, Math.round(baseSize * 0.55))}px`);
    subtitleContainer.style.setProperty('--subtitle-offset-bottom', `${offsetBottom}px`);
    subtitleContainer.style.setProperty('--subtitle-max-width', `${Math.max(82, Math.min(94, 94 - (baseSize / 10)))}%`);
}

function updateSubtitles() {
    if (!window.subtitleManager || !window.subtitleManager.isEnabled) {
        subtitleText.textContent = '';
        subtitleText.classList.remove('is-visible');
        subtitleText.style.display = 'none';
        return;
    }
    
    const subtitle = window.subtitleManager.getSubtitleForTime(videoPlayer.currentTime);
    if (subtitle) {
        updateSubtitleScale();
        subtitleText.innerHTML = subtitle.text;
        subtitleText.style.display = '';
        subtitleText.classList.add('is-visible');
    } else {
        subtitleText.classList.remove('is-visible');
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
        updateSubtitleScale();

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

    videoPlayer.addEventListener("seeking", () => {
        if (!isUserSeeking) {
            return;
        }

        logger.info('⏩ Seek iniciado pelo utilizador', {
            position: Math.floor((videoPlayer.currentTime || 0) * 100) / 100,
        });
    });

    videoPlayer.addEventListener("seeked", () => {
        if (!isUserSeeking) {
            return;
        }

        const payload = {
            current_position: Math.floor((videoPlayer.currentTime || 0) * 100) / 100,
            video_duration: Math.floor((window.videoDuration || 0) * 100) / 100,
        };

        reportVideoEvent("playback_seeked", payload);

        if (!videoPlayer.paused) {
            reportVideoEvent("playback_resumed", {
                ...payload,
                resume_reason: "seek_completed",
            });
        }

        isUserSeeking = false;
    });
}

function setupControlEvents() {
    const controlElements = [
        playPauseBtn,
        volumeBtn,
        volumeSlider,
        loopBtn,
        speedBtn,
        fullscreenBtn,
        subtitleBtn,
        closeSubtitleMenu,
        loadSubtitleFile,
        loadSubtitleURL,
        subtitleToggle,
        closeButton,
        subtitleMenu,
        progressBarContainer,
        progressBar,
        progressHandle,
        progressSlider,
    ].filter(Boolean);

    controlElements.forEach((element) => {
        ["click", "mousedown", "mouseup", "touchstart", "touchend"].forEach((eventName) => {
            element.addEventListener(eventName, (event) => {
                event.stopPropagation();
            });
        });
    });

    // Play/Pause
    playPauseBtn.addEventListener("click", (event) => {
        stopEventPropagation(event);
        togglePlayPause();
    });
    
    // Volume
    volumeBtn.addEventListener("click", (event) => {
        stopEventPropagation(event);
        toggleMute();
    });
    volumeSlider.addEventListener("input", (e) => {
        e.stopPropagation();
        videoPlayer.volume = e.target.value / 100;
        videoPlayer.muted = false;
        updateVolumeButton();
    });
    
    // Loop
    loopBtn.addEventListener("click", (event) => {
        stopEventPropagation(event);
        toggleLoop();
    });
    
    // Speed
    speedBtn.addEventListener("click", (event) => {
        stopEventPropagation(event);
        toggleSpeedMenu();
    });
    createSpeedMenu();
    
    // Fullscreen
    fullscreenBtn.addEventListener("click", (event) => {
        stopEventPropagation(event);
        toggleFullscreen();
    });
    
    // Progress bar: slider nativo para clique e arrasto mais estáveis
    progressBarContainer.addEventListener("pointermove", (event) => {
        showProgressTooltip(event.clientX);
    });
    progressBarContainer.addEventListener("pointerleave", () => {
        if (!isDragging) {
            hideProgressTooltip();
        }
    });

    progressSlider.addEventListener("pointerdown", (event) => {
        event.stopPropagation();
        const percent = Number(progressSlider.value || 0);
        handleProgressSeekStart(percent);
        setProgressTooltip(null, percent);
        showProgressTooltip(event.clientX);
    });

    progressSlider.addEventListener("input", (event) => {
        event.stopPropagation();
        const percent = Number(progressSlider.value || 0);
        if (!isDragging) {
            handleProgressSeekStart(percent);
        } else {
            handleProgressSeekMove(percent);
        }
        setProgressTooltip(null, percent);
        progressTooltip.classList.add('show');
    });

    progressSlider.addEventListener("change", (event) => {
        event.stopPropagation();
        const percent = Number(progressSlider.value || 0);
        handleProgressSeekEnd(percent);
        hideProgressTooltip();
    });

    progressSlider.addEventListener("pointerup", (event) => {
        event.stopPropagation();
        const percent = Number(progressSlider.value || 0);
        handleProgressSeekEnd(percent);
        hideProgressTooltip();
    });

    progressSlider.addEventListener("pointercancel", () => {
        handleProgressSeekEnd(Number(progressSlider.value || 0));
        isUserSeeking = false;
        hideProgressTooltip(true);
    });
    
    // O clique directo no vídeo não deve reiniciar nem alterar o estado por engano.
    videoPlayer.addEventListener("click", (event) => {
        event.stopPropagation();
        showControls();
    });
    
    // Show controls on mouse move
    document.addEventListener("mousemove", showControls);
    
    // Fullscreen change events
    document.addEventListener("fullscreenchange", () => {
        isFullscreen = !!document.fullscreenElement;
        updateFullscreenButton();
        updateSubtitleScale();
    });
    
    document.addEventListener("webkitfullscreenchange", () => {
        isFullscreen = !!document.webkitFullscreenElement;
        updateFullscreenButton();
        updateSubtitleScale();
    });
    
    document.addEventListener("mozfullscreenchange", () => {
        isFullscreen = !!document.mozFullScreenElement;
        updateFullscreenButton();
        updateSubtitleScale();
    });
    
    document.addEventListener("MSFullscreenChange", () => {
        isFullscreen = !!document.msFullscreenElement;
        updateFullscreenButton();
        updateSubtitleScale();
    });

    window.addEventListener("resize", updateSubtitleScale);
    
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
    subtitleBtn.addEventListener("click", (event) => {
        stopEventPropagation(event);
        toggleSubtitleMenu();
    });
    closeSubtitleMenu.addEventListener("click", (event) => {
        stopEventPropagation(event);
        hideSubtitleMenu();
    });
    loadSubtitleFile.addEventListener("click", (event) => {
        stopEventPropagation(event);
        loadSubtitleFromFile();
    });
    loadSubtitleURL.addEventListener("click", (event) => {
        stopEventPropagation(event);
        loadSubtitleFromURL();
    });
    subtitleToggle.addEventListener("change", (event) => {
        event.stopPropagation();
        toggleSubtitles();
    });
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
    updateSubtitleScale();

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
