const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { OpenAI } = require('openai');
const { createClient } = require('pexels');
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const https = require('https');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/videos', express.static('videos'));

app.post('/api/generate-script', async (req, res) => {
    const { topic, length, aiService, ollamaBaseUrl, ollamaModel, geminiApiKey, openaiApiKey } = req.body;

    const prompt = `Create a script for a ${length}-minute video about "${topic}".
The script should be divided into segments, with each segment being approximately 5 seconds long.
For each segment, provide a script and a suggested Pexels search query in English, in the following format:
Segment X: [Script] [english prompt: Pexels search query]`;

    try {
        let script;
        if (aiService === 'ollama') {
            const response = await fetch(`${ollamaBaseUrl}/api/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: ollamaModel,
                    prompt: prompt,
                    stream: false,
                }),
            });
            const data = await response.json();
            script = data.response;
        } else if (aiService === 'gemini') {
            const genAI = new GoogleGenerativeAI(geminiApiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            script = await response.text();
        } else if (aiService === 'openai') {
            const openai = new OpenAI({ apiKey: openaiApiKey });
            const completion = await openai.chat.completions.create({
                messages: [{ role: 'user', content: prompt }],
                model: 'gpt-3.5-turbo',
            });
            script = completion.choices[0].message.content;
        }

        res.json({ script });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to generate script' });
    }
});

app.post('/api/find-videos', async (req, res) => {
    const { prompts, pexelsApiKey } = req.body;
    const client = createClient(pexelsApiKey);
    const videoUrls = [];

    try {
        for (const prompt of prompts) {
            const response = await client.videos.search({ query: prompt, per_page: 1 });
            if (response.videos.length > 0) {
                videoUrls.push(response.videos[0].video_files[0].link);
            }
        }
        res.json({ videoUrls });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to find videos' });
    }
});

const PORT = process.env.PORT || 3000;

if (!fs.existsSync('videos')) {
    fs.mkdirSync('videos');
}

function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(dest);
        https.get(url, (response) => {
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest);
            reject(err.message);
        });
    });
}

app.post('/api/create-video', async (req, res) => {
    const { videoUrls, audioUrls, segments, transition } = req.body;
    const videoPaths = [];
    const audioPaths = [];
    const segmentPaths = [];
    const timestamp = Date.now();
    const outputFile = `videos/final-${timestamp}.mp4`;
    const subtitleFile = `videos/final-${timestamp}.srt`;


    try {
        for (let i = 0; i < videoUrls.length; i++) {
            const videoPath = `videos/video-${i}.mp4`;
            const audioPath = `videos/audio-${i}.mp3`;
            await downloadFile(videoUrls[i], videoPath);
            const audioBlob = await fetch(audioUrls[i]).then(r => r.blob());
            const audioBuffer = Buffer.from(await audioBlob.arrayBuffer());
            fs.writeFileSync(audioPath, audioBuffer);
            videoPaths.push(videoPath);
            audioPaths.push(audioPath);
        }

        let totalDuration = 0;
        let srtContent = '';
        for (let i = 0; i < videoPaths.length; i++) {
            const segmentPath = `videos/segment-${i}.mp4`;
            const duration = await new Promise((resolve, reject) => {
                ffmpeg.ffprobe(audioPaths[i], (err, metadata) => {
                    if (err) reject(err);
                    resolve(metadata.format.duration);
                });
            });

            await new Promise((resolve, reject) => {
                ffmpeg(videoPaths[i])
                    .input(audioPaths[i])
                    .outputOptions(`-t ${duration}`)
                    .outputOptions('-c:v libx264 -c:a aac -strict experimental')
                    .on('end', resolve)
                    .on('error', reject)
                    .save(segmentPath);
            });
            segmentPaths.push(segmentPath);

            const startTime = new Date(totalDuration * 1000).toISOString().substr(11, 8) + ',000';
            totalDuration += duration;
            const endTime = new Date(totalDuration * 1000).toISOString().substr(11, 8) + ',000';
            srtContent += `${i + 1}\n${startTime} --> ${endTime}\n${segments[i].script}\n\n`;
        }

        fs.writeFileSync(subtitleFile, srtContent);

        const command = ffmpeg();
        segmentPaths.forEach(path => command.input(path));

        if (transition === 'fade') {
            command.complexFilter('xfade=transition=fade:duration=1:offset=4');
        } else if (transition === 'slide') {
            command.complexFilter('xfade=transition=slideleft:duration=1:offset=4');
        }

        await new Promise((resolve, reject) => {
            command
                .on('end', resolve)
                .on('error', reject)
                .mergeToFile(outputFile, 'videos/');
        });


        res.json({
            videoUrl: `http://localhost:${PORT}/${outputFile}`,
            subtitleUrl: `http://localhost:${PORT}/${subtitleFile}`
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create video' });
    } finally {
        [...videoPaths, ...audioPaths, ...segmentPaths].forEach(path => fs.unlinkSync(path));
    }
});


app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
