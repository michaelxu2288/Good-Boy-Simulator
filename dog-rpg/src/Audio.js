export const AudioSys = {
    ctx: null,
    buffers: {}, // This will hold your loaded sound files
    soundNames: [], // To hold the names of the loaded sounds
    nowPlaying: null, // to track the current sound
    voices: [],

    init: function() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        
        // Trigger the loading of sound files immediately
        this.preloadSounds();
        this.loadVoices();
    },

    loadVoices: function() {
        // Voices are loaded asynchronously
        const checkVoices = () => {
            this.voices = speechSynthesis.getVoices();
            if (this.voices.length) {
                console.log('Voices loaded:', this.voices);
            } else {
                setTimeout(checkVoices, 100);
            }
        };
        speechSynthesis.onvoiceschanged = checkVoices;
        checkVoices();
    },

    speak: function(text, voice, pitch = 1.0, rate = 1.0) {
        if (!'speechSynthesis' in window) {
            console.warn('Speech Synthesis not supported.');
            return;
        }
        speechSynthesis.cancel(); // Stop any previous speech
        const utterance = new SpeechSynthesisUtterance(text);
        if (voice) utterance.voice = voice;
        utterance.pitch = pitch;
        utterance.rate = rate;
        speechSynthesis.speak(utterance);
    },

    resume: function() {
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    // 1. New function to load the audio files
    preloadSounds: async function() {
        const soundFiles = import.meta.glob('/public/assets/*.mp3');
        
        for (const path in soundFiles) {
            try {
                const url = await soundFiles[path]();
                const response = await fetch(url.default);
                const arrayBuffer = await response.arrayBuffer();
                // Decode the audio data asynchronously
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                
                // Extracting name from path
                const name = path.split('/').pop().replace('.mp3', '');
                
                this.buffers[name] = audioBuffer;
                this.soundNames.push(name);

            } catch (e) {
                console.error(`Failed to load sound: ${path}`, e);
            }
        }
    },

    // 2. Helper to play a loaded sound
    playSound: function(name, pitch = 1.0, vol = 1.0, duration = 3) {
        // If context isn't ready or sound isn't loaded yet, do nothing
        if (!this.ctx || !this.buffers[name]) {
            console.warn(`Sound not found: ${name}`);
            return;
        }

        if (this.nowPlaying) {
            this.nowPlaying.stop();
        }

        const source = this.ctx.createBufferSource();
        this.nowPlaying = source;
        source.buffer = this.buffers[name];
        
        // pitch = 1.0 is normal speed. >1 is faster/higher, <1 is slower/lower
        source.playbackRate.value = pitch; 

        const gain = this.ctx.createGain();
        gain.gain.value = vol;

        source.connect(gain);
        gain.connect(this.ctx.destination);
        
        source.start(0, 0, duration);
    },

    // 3. Updated specialized functions
    bark: function(pitch=1.0) {
        const barkSounds = this.soundNames.filter(name => name.includes('bark'));
        if (barkSounds.length > 0) {
            const randomBark = barkSounds[Math.floor(Math.random() * barkSounds.length)];
            this.playSound(randomBark, pitch, 0.5); 
        }
    },

    sniff: function() {
        const sniffSound = this.soundNames.find(name => name.includes('sniff'));
        if (sniffSound) {
            this.playSound(sniffSound, 1.0, 0.4);
        }
    },

    whine: function() {
        const whineSound = this.soundNames.find(name => name.includes('whine'));
        if (whineSound) {
            this.playSound(whineSound, 1.0, 0.5);
        }
    },

    // You can keep the old synth tones for UI sounds if you want, 
    // or replace them with files too.
    hit: function() { 
        this.playTone(150, 'square', 0.1, 0.2); 
    },
    
    powerup: function() { 
        this.playTone(600, 'sine', 0.3, 0.2); 
    },

    // Kept this helper for the "hit" and "powerup" legacy sounds
    playTone: function(freq, type, dur, vol=0.1) {
        if(!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + dur);
    }
};