export const AudioSys = {
    ctx: null,
    buffers: {}, // This will hold your loaded sound files
    soundNames: [], // To hold the names of the loaded sounds
    nowPlaying: null, // to track the current sound
    voices: [],
    master: null,      // all sound routes through here so mute is one knob
    musicBus: null,
    muted: false,
    musicOn: false,
    _lastGun: 0,

    init: function() {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 1;
        this.master.connect(this.ctx.destination);

        // Trigger the loading of sound files immediately
        this.preloadSounds();
        this.loadVoices();
        this.startMusic();
        this.scheduleBird();
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
        gain.connect(this.master || this.ctx.destination);

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
        gain.connect(this.master || this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + dur);
    },

    // --- synth SFX (no assets) ---

    // gunshot: noise crack + low thump. rate-limited so a hail of shots doesn't stack into mush.
    gunshot: function(vol = 0.2) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        if (t - this._lastGun < 0.05) return;
        this._lastGun = t;
        const dest = this.master || this.ctx.destination;
        const len = Math.floor(this.ctx.sampleRate * 0.12);
        const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
        const noise = this.ctx.createBufferSource(); noise.buffer = buf;
        const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.7;
        const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        noise.connect(bp); bp.connect(g); g.connect(dest); noise.start(t);
        const osc = this.ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.setValueAtTime(170, t); osc.frequency.exponentialRampToValueAtTime(55, t + 0.1);
        const g2 = this.ctx.createGain(); g2.gain.setValueAtTime(vol * 1.1, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(g2); g2.connect(dest); osc.start(t); osc.stop(t + 0.11);
    },

    // jump: quick upward whoosh
    jumpSfx: function() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime, dest = this.master || this.ctx.destination;
        const osc = this.ctx.createOscillator(); osc.type = 'triangle';
        osc.frequency.setValueAtTime(280, t); osc.frequency.exponentialRampToValueAtTime(680, t + 0.14);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(0.13, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + 0.17);
    },

    // land: soft low thump when paws hit the ground after a jump/fall
    landSfx: function(vol = 0.12) {
        if (!this.ctx) return;
        const t = this.ctx.currentTime, dest = this.master || this.ctx.destination;
        const osc = this.ctx.createOscillator(); osc.type = 'sine';
        osc.frequency.setValueAtTime(160, t); osc.frequency.exponentialRampToValueAtTime(60, t + 0.1);
        const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + 0.13);
    },

    // low-HP heartbeat (lub-dub)
    heartbeat: function() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime, dest = this.master || this.ctx.destination;
        const thump = (at, v) => {
            const osc = this.ctx.createOscillator(); osc.type = 'sine';
            osc.frequency.setValueAtTime(90, at); osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
            const g = this.ctx.createGain(); g.gain.setValueAtTime(v, at); g.gain.exponentialRampToValueAtTime(0.001, at + 0.14);
            osc.connect(g); g.connect(dest); osc.start(at); osc.stop(at + 0.15);
        };
        thump(t, 0.32); thump(t + 0.19, 0.22);
    },

    // gentle generative pad: 3 detuned triangles retuned to a soft chord loop, low + filtered
    startMusic: function() {
        if (!this.ctx || this.musicOn) return;
        this.musicOn = true;
        const dest = this.master || this.ctx.destination;
        this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.05;
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
        this.musicBus.connect(lp); lp.connect(dest);
        this._padOscs = [0, 0, 0].map(() => {
            const o = this.ctx.createOscillator(); o.type = 'triangle';
            const g = this.ctx.createGain(); g.gain.value = 0.33;
            o.connect(g); g.connect(this.musicBus); o.start();
            return o;
        });
        const chords = [[130.8,164.8,196.0],[110.0,130.8,164.8],[87.3,110.0,130.8],[98.0,123.5,146.8]];
        let ci = 0;
        const step = () => {
            if (!this.musicOn) return;
            const c = chords[ci % chords.length]; ci++;
            const t = this.ctx.currentTime;
            this._padOscs.forEach((o, i) => o.frequency.setTargetAtTime(c[i], t, 0.6));
        };
        step();
        this._musicTimer = setInterval(step, 3800);
    },

    // sparse neighborhood birds
    scheduleBird: function() {
        if (!this.ctx) return;
        const chirp = () => {
            if (this.ctx && !this.muted) {
                const t = this.ctx.currentTime, dest = this.master || this.ctx.destination;
                const n = 2 + Math.floor(Math.random() * 3);
                for (let i = 0; i < n; i++) {
                    const at = t + i * 0.09;
                    const o = this.ctx.createOscillator(); o.type = 'sine';
                    const f = 2200 + Math.random() * 1400;
                    o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 1.3, at + 0.05);
                    const g = this.ctx.createGain();
                    g.gain.setValueAtTime(0.0, at); g.gain.linearRampToValueAtTime(0.04, at + 0.01); g.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
                    o.connect(g); g.connect(dest); o.start(at); o.stop(at + 0.08);
                }
            }
            this._birdTimer = setTimeout(chirp, 5000 + Math.random() * 9000);
        };
        this._birdTimer = setTimeout(chirp, 3000 + Math.random() * 5000);
    },

    setMuted: function(m) {
        this.muted = m;
        if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.05);
        if (m && 'speechSynthesis' in window) speechSynthesis.cancel();
    },
    toggleMute: function() { this.setMuted(!this.muted); return this.muted; }
};