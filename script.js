document.addEventListener('DOMContentLoaded', () => {
    const settingsModal = document.getElementById('settings-modal');
    const closeButton = document.querySelector('.close-button');
    const saveSettingsButton = document.getElementById('save-settings');
    const aiServiceSelect = document.getElementById('ai-service');
    const ollamaSettings = document.getElementById('ollama-settings');
    const geminiSettings = document.getElementById('gemini-settings');
    const openaiSettings = document.getElementById('openai-settings');
    const videoForm = document.getElementById('video-form');
    const progressContainer = document.getElementById('progress-container');
    const progressBarInner = document.getElementById('progress-bar-inner');
    const progressStatus = document.getElementById('progress-status');
    const scriptOutput = document.getElementById('script-output');
    const scriptText = document.getElementById('script-text');
    const videoOutput = document.getElementById('video-output');
    const videoSegments = document.getElementById('video-segments');
    const voiceSelect = document.getElementById('voice');

    // Load voices
    fetch('voice.txt')
        .then(response => response.json())
        .then(data => {
            data.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voice;
                option.textContent = voice.name;
                voiceSelect.appendChild(option);
            });
        });

    // Settings Modal
    function openSettingsModal() {
        settingsModal.style.display = 'block';
    }

    function closeSettingsModal() {
        settingsModal.style.display = 'none';
    }

    closeButton.addEventListener('click', closeSettingsModal);
    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            closeSettingsModal();
        }
    });

    aiServiceSelect.addEventListener('change', () => {
        ollamaSettings.style.display = 'none';
        geminiSettings.style.display = 'none';
        openaiSettings.style.display = 'none';
        document.getElementById(`${aiServiceSelect.value}-settings`).style.display = 'block';
    });

    saveSettingsButton.addEventListener('click', () => {
        const settings = {
            aiService: aiServiceSelect.value,
            ollamaBaseUrl: document.getElementById('ollama-base-url').value,
            ollamaModel: document.getElementById('ollama-model').value,
            geminiApiKey: document.getElementById('gemini-api-key').value,
            openaiApiKey: document.getElementById('openai-api-key').value,
            pexelsApiKey: document.getElementById('pexels-api-key').value,
        };
        localStorage.setItem('apiSettings', JSON.stringify(settings));
        closeSettingsModal();
    });

    // Load voices
    fetch('voice.txt')
        .then(response => {
            if (!response.ok) {
                throw new Error("Failed to load voice.txt");
            }
            return response.json();
        })
        .then(data => {
            data.forEach(voice => {
                const option = document.createElement('option');
                option.value = voice.voice;
                option.textContent = voice.name;
                voiceSelect.appendChild(option);
            });
        })
        .catch(error => {
            console.error('Error loading voices:', error);
            alert('Failed to load voice options. Please make sure voice.txt is present and correctly formatted.');
        });

    // Load settings from local storage
    function loadSettings() {
        const settings = JSON.parse(localStorage.getItem('apiSettings'));
        if (settings && settings.pexelsApiKey && (settings.aiService === 'ollama' || (settings.geminiApiKey && settings.aiService === 'gemini') || (settings.openaiApiKey && settings.aiService === 'openai'))) {
            aiServiceSelect.value = settings.aiService;
            document.getElementById('ollama-base-url').value = settings.ollamaBaseUrl;
            document.getElementById('ollama-model').value = settings.ollamaModel;
            document.getElementById('gemini-api-key').value = settings.geminiApiKey;
            document.getElementById('openai-api-key').value = settings.openaiApiKey;
            document.getElementById('pexels-api-key').value = settings.pexelsApiKey;
            aiServiceSelect.dispatchEvent(new Event('change'));
            return true;
        }
        return false;
    }

    function checkAndLoadSettings() {
        if (!loadSettings()) {
            openSettingsModal();
        }
    }

    checkAndLoadSettings();

    saveSettingsButton.addEventListener('click', () => {
        const settings = {
            aiService: aiServiceSelect.value,
            ollamaBaseUrl: document.getElementById('ollama-base-url').value,
            ollamaModel: document.getElementById('ollama-model').value,
            geminiApiKey: document.getElementById('gemini-api-key').value,
            openaiApiKey: document.getElementById('openai-api-key').value,
            pexelsApiKey: document.getElementById('pexels-api-key').value,
        };
        localStorage.setItem('apiSettings', JSON.stringify(settings));
        closeSettingsModal();
    });


    videoForm.addEventListener('submit', (event) => {
        event.preventDefault();
        if (loadSettings()) {
            progressContainer.style.display = 'block';
            generateVideo();
        } else {
            openSettingsModal();
        }
    });

    function updateProgress(percentage, status) {
        progressBarInner.style.width = `${percentage}%`;
        progressStatus.textContent = status;
    }

    async function generateVideo() {
        const topic = document.getElementById('topic').value;
        const length = document.getElementById('length').value;
        const aspectRatio = document.getElementById('aspect-ratio').value;
        const transition = document.getElementById('transition').value;
        const voice = document.getElementById('voice').value;
        const settings = JSON.parse(localStorage.getItem('apiSettings'));

        if (!settings || !settings.pexelsApiKey || (settings.aiService === 'gemini' && !settings.geminiApiKey) || (settings.aiService === 'openai' && !settings.openaiApiKey)) {
            alert('Please configure your API keys in the settings.');
            openSettingsModal();
            return;
        }

        updateProgress(10, 'Generating script...');

        const settings = JSON.parse(localStorage.getItem('apiSettings'));

        const response = await fetch('http://localhost:3000/api/generate-script', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                topic,
                length,
                ...settings
            }),
        });

        const data = await response.json();
        const script = data.script;

        scriptText.textContent = script;
        scriptOutput.style.display = 'block';
        updateProgress(30, 'Generating audio...');
        const segments = script.split('Segment ').slice(1).map(segment => {
            const parts = segment.split('[english prompt:');
            return {
                script: parts[0].replace(/\d: /,'').trim(),
                prompt: parts[1].replace(']','').trim()
            }
        });

        const audioUrls = [];
        for (const segment of segments) {
            const response = await fetch(`https://tts-5cmbedesv-peterkuo0108s-projects.vercel.app/api/tts?t=${encodeURIComponent(segment.script)}&v=${voiceSelect.value}`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            audioUrls.push(url);
        }

        updateProgress(50, 'Finding videos...');
        const prompts = segments.map(segment => segment.prompt);
        const videoResponse = await fetch('http://localhost:3000/api/find-videos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompts,
                pexelsApiKey: settings.pexelsApiKey,
            }),
        });
        const videoData = await videoResponse.json();
        const videoUrls = videoData.videoUrls;

        updateProgress(70, 'Pairing audio and video...');
        videoSegments.innerHTML = '';
        for (let i = 0; i < segments.length; i++) {
            const segmentDiv = document.createElement('div');
            segmentDiv.className = 'video-segment';
            segmentDiv.innerHTML = `Segment ${i + 1}: <video src="${videoUrls[i]}" controls></video>`;
            videoSegments.appendChild(segmentDiv);
        }
        videoOutput.style.display = 'block';
        updateProgress(90, 'Compositing video...');
        const createVideoResponse = await fetch('http://localhost:3000/api/create-video', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                videoUrls,
                audioUrls,
                segments,
                transition: document.getElementById('transition').value,
            }),
        });

        const createVideoData = await createVideoResponse.json();
        const finalVideoUrl = createVideoData.videoUrl;
        const subtitleUrl = createVideoData.subtitleUrl;

        videoSegments.innerHTML += `<div class="video-segment">Final Video: <video src="${finalVideoUrl}" controls></video><a href="${subtitleUrl}" download>Download Subtitles</a></div>`;

        updateProgress(100, 'Video generation complete!');
    }
});
