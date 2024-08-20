let canvas = null;
let bgCanvas = null;
let width = null;
let height = null;
let audioContext = null;
let analyser = null;
let freqBuffer = null;
let gainNode = null;
let oscillatorNode = null;

let speed = 5;
let paused = false;
let lowerFrequency = 45;
let upperFrequency = 11_000;
let volume = 0.5;
let tickVariant = "preset";
let colorMap = "grayscale";
let interpolation = "nearest";
let scalaVariant = "log";

let mouse_position = [0.0, 0.0];


function init() {
    canvas = document.getElementById('spectogram');
    bgCanvas = document.createElement('canvas');

    window.addEventListener('mousedown', () => createAudioGraph());
    window.addEventListener('touchstart', () => createAudioGraph());

    canvas.addEventListener('mousemove', function(event) {
        mouse_position = [event.clientX, event.clientY];
        if (oscillatorNode) {
            const percentage = 1.0 - (1.0 * mouse_position[1] / height);
            const freq = scale(percentage);
            oscillatorNode.frequency.value = freq;
        }
    });
    canvas.addEventListener('mousedown', function(event) {
        if (gainNode && event.button === 0) {
            gainNode.gain.setTargetAtTime(volume, audioContext.currentTime, 0.005);
            event.preventDefault();
        }
    });
    window.addEventListener('mouseup', function(event) {
        if (gainNode && event.button === 0) {
            gainNode.gain.setTargetAtTime(0, audioContext.currentTime, 0.005);
            event.preventDefault();
        }
    });

    document.getElementById('speed').addEventListener('input', function() {
        speed = this.value;
    });
    window.addEventListener('keydown', function(event) {
        if (event.code === "Space") {
            event.preventDefault();
            paused = !paused;
        }
        if (event.code === "KeyD") {
            event.preventDefault();
            for (let i = 0; i < freqBuffer.length; i++) {
                const freq = indexToFreq(i);
                const decibel = valueToDecibel(freqBuffer[i]);
                console.log(`${freq.toFixed(1).padStart(5)} Hz: ${decibel.toFixed(2)}`);
            }
        }
    });

    const lowerFrequencySlider = document.getElementById('lower-frequency');
    const upperFrequencySlider = document.getElementById('upper-frequency');
    lowerFrequencySlider.addEventListener('input', function() {
        this.value = Math.min(parseFloat(upperFrequencySlider.value) - 0.01, this.value);
        const value = Math.round(logScale(this.value, 20, 20000));
        document.getElementById('lower-frequency-value').textContent = `${value} Hz`;
        lowerFrequency = value;
    });
    upperFrequencySlider.addEventListener('input', function() {
        this.value = Math.max(parseFloat(lowerFrequencySlider.value) + 0.01, this.value);
        const value = Math.round(logScale(this.value, 20, 20000));
        document.getElementById('upper-frequency-value').textContent = `${value} Hz`;
        upperFrequency = value;
    });

    document.getElementById('scala').addEventListener('change', function() {
        scalaVariant = this.value;
    });

    document.getElementById('tick-variant').addEventListener('change', function() {
        tickVariant = this.value;
    });

    document.getElementById('colormap').addEventListener('change', function() {
        colorMap = this.value;
    });

    document.getElementById('interpolation').addEventListener('change', function() {
        interpolation = this.value;
    });

    document.getElementById('fft-size').addEventListener('change', function() {
        analyser.fftSize = parseInt(this.value);
        freqBuffer = new Uint8Array(analyser.frequencyBinCount);
    });

    document.getElementById('smoothing-factor').addEventListener('input', function() {
        document.getElementById('smoothing-factor-value').textContent = `${parseFloat(this.value).toFixed(2)}`;
        analyser.smoothingTimeConstant = this.value;
    });
}

async function createAudioGraph() {
    if (audioContext) {
        return;
    }
    audioContext = new AudioContext();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const input = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.smoothingTimeConstant = 0;
    analyser.fftSize = 4096;
    input.connect(analyser);

    freqBuffer = new Uint8Array(analyser.frequencyBinCount);
    console.log("Frequency Bin Count: " + analyser.frequencyBinCount);
    console.log("Minimum Decibels: " + analyser.minDecibels);
    console.log("Maximum Decibels: " + analyser.maxDecibels);

    gainNode = audioContext.createGain();
    gainNode.connect(audioContext.destination);
    gainNode.gain.value = 0.0;
    oscillatorNode = audioContext.createOscillator();
    oscillatorNode.connect(gainNode);
    oscillatorNode.start();

    render();
}

function render() {
    width = window.innerWidth;
    height = window.innerHeight;
    if (canvas.width != width || canvas.height != height) {
        canvas.width = width;
        canvas.height = height;
        bgCanvas.width = width;
        bgCanvas.height = height;
        const ctx = bgCanvas.getContext("2d");
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, width, height);
    }

    if (!paused) {
        renderSpectrogram();
    }
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bgCanvas, 0, 0);

    if (tickVariant === "preset") {
        renderPresetTicks();
    } else if (tickVariant === "notes") {
        renderNoteTicks();
    }
    renderMaximums();
    renderFundamental();
    renderMouse();

    requestAnimationFrame(render);
}

function renderSpectrogram() {
    analyser.getByteFrequencyData(freqBuffer);

    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.drawImage(bgCanvas, -speed, 0);

    // Iterate over the frequencies.
    for (let i = 0; i < height; i++) {
        const freq = scale(1.0 - (1.0 * i / height));
        const low_freq = scale(1.0 - ((i + 0.5) / height));
        const high_freq = scale(1.0 - ((i - 0.5) / height));
        let value;
        if (interpolation === 'nearest') {
            value = freqBuffer[Math.round(freqToIndex(freq))];
        } else if (interpolation === 'linear') {
            value = lerpArray(freqBuffer, freqToIndex(freq));
        } else if (interpolation === 'maximum') {
            value = lerpArray2(freqBuffer, freqToIndex(low_freq), freqToIndex(high_freq));
        } else if (interpolation === 'averaging') {
            value = lerpArray3(freqBuffer, freqToIndex(low_freq), freqToIndex(high_freq));
        }

        const decibel = valueToDecibel(value);
        const [r, g, b] = decibelToColor(decibel);
        bgCtx.fillStyle = `rgb(${r},${g},${b})`;

        bgCtx.fillRect(width - speed, i, speed, 1);
    }
}

function renderPresetTicks() {
    const ctx = canvas.getContext('2d');
    ctx.font = '18px Inconsolata';
    const [r, g, b] = accentColor();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    for (freq of [20, 30, 50, 100, 200, 261.6, 300, 440, 500, 1000, 2000, 3000, 5000, 10000]) {
        const percentage = inverseScale(freq);
        const y = Math.round((1 - percentage) * height);
        ctx.textAlign = 'right';
        ctx.fillText(freq.toFixed(0), width - 60, y + 5);
        ctx.textAlign = 'left';
        ctx.fillText("Hz", width - 50, y + 5);
        // Draw a tick mark.
        ctx.fillRect(width - 20, y - 1, 20, 2);
    }
}

function renderNoteTicks() {
    const ctx = canvas.getContext('2d');
    ctx.font = '12px Inconsolata';
    const [r, g, b] = accentColor();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    for (let i = 1; i < 8; i++) {
        for (let j = 0; j < 12; j++) {
            const freq = Math.pow(2, i - 4 + j / 12) * 440.0;
            const percentage = inverseScale(freq);
            const y = Math.round((1 - percentage) * height);
            ctx.textAlign = 'right';
            ctx.fillText(`${NOTE_NAMES[j]}${i}`, width - 25, y + 5);
            ctx.fillRect(width - 20, y - 1, 20, 2);
        }
    }
}

function renderMaximums() {
    const ctx = canvas.getContext('2d');
    ctx.font = '18px Inconsolata';
    const [r, g, b] = accentColor();
    ctx.fillStyle = `rgb(${r},${g},${b})`;

    let indices = findMaxIndices(freqBuffer);
    let success = [];

    outer: for (let i = 0; i < indices.length && success.length < 3; i++) {
        const [index, decibel] = refinePeak(freqBuffer, indices[i]);
        const freq = indexToFreq(index);
        const percentage = inverseScale(freq);
        for (other of success) {
            if (Math.abs(other - percentage) < 0.05) {
                continue outer;
            }
        }
        success.push(percentage);
        const y = Math.round((1.0 - percentage) * height);

        ctx.textAlign = 'right';
        ctx.fillText(`${freq.toFixed(1)} Hz (${decibel.toFixed(0)} dB)`, width - 125, y + 5);
        ctx.fillRect(width - 120, y - 1, 20, 2);
    }
}

function renderFundamental() {
    const ctx = canvas.getContext('2d');
    ctx.font = '18px Inconsolata';
    const [r, g, b] = accentColor();
    ctx.fillStyle = `rgb(${r},${g},${b})`;

    const freq = findFundamentalFrequency(8);
    const percentage = inverseScale(freq);
    const y = Math.round((1.0 - percentage) * height);
    ctx.textAlign = 'right';
    ctx.fillText(`${freq.toFixed(1)} Hz`, width - 285, y + 5);
    ctx.fillRect(width - 280, y - 1, 20, 2);
}

function renderMouse() {
    const ctx = canvas.getContext('2d');
    ctx.font = '20px Inconsolata';
    const [r, g, b] = accentColor();
    ctx.fillStyle = `rgb(${r},${g},${b})`;

    const percentage = 1.0 - (1.0 * mouse_position[1] / height);
    const freq = scale(percentage);
    ctx.textAlign = 'left';
    ctx.fillText(`${freq.toFixed(1)} Hz`, mouse_position[0] + 10, mouse_position[1] - 10);

    ctx.fillStyle = `rgba(${r},${g},${b},0.5)`;
    ctx.fillRect(0, mouse_position[1] - 1, width, 2);
}

function lerpArray(array, index) {
    const lowerIndex = Math.floor(index);
    const upperIndex = Math.ceil(index);
    const fraction = index - lowerIndex;
    return array[lowerIndex] * (1 - fraction) + array[upperIndex] * fraction;
}

function lerpArray2(array, low_index, high_index) {
    low_index = Math.round(low_index);
    high_index = Math.round(high_index);
    let max = 0;
    for (let i = low_index; i <= high_index; i++) {
        max = Math.max(array[i], max);
    }
    return max;
}

function lerpArray3(array, a, b) {
    // Probably needs a +0.5 or -0.5 not sure
    a = Math.max(0.0001, Math.min(a, array.length - 1));
    b = Math.max(0.0001, Math.min(b, array.length - 1));
    const low_index = Math.ceil(a);
    const high_index = Math.floor(b);
    const low_frac = low_index - a;
    const high_frac = b - high_index;
    let avg = 0.0;
    avg += array[low_index - 1] * low_frac;
    for (let i = low_index; i < high_index; i++) {
        avg += array[i];
    }
    avg += array[high_index] * high_frac;
    if (low_index > high_index) {
        return avg / (low_frac + high_frac);
    }
    return avg / (low_frac + high_frac + high_index - low_index);
}

function refinePeak(array, index) {
    const a = valueToDecibel(array[Math.max(0, index - 1)]);
    const b = valueToDecibel(array[index]);
    const c = valueToDecibel(array[Math.min(array.length - 1, index + 1)]);
    const p = 0.5 * (a - c) / (a - 2.0 * b + c);
    return [index + p, b - 0.25 * (a - c) * p];
}

function findFundamentalFrequency(partials) {
    const buf = new Float32Array(analyser.frequencyBinCount);

    const lowerCutoff = Math.floor(freqToIndex(50.0) * partials);
    const upperCutoff = Math.ceil(freqToIndex(600.0) * partials);
    for (let i = lowerCutoff; i < upperCutoff; i++) {
        let sum = 0.0;
        let product = 1.0;
        for (let j = 1; j <= partials; j++) {
            const value = freqBuffer[Math.floor(j * i / partials)];
            product *= 0.1 + 0.9 * value / 255.0;
            const decibel = valueToDecibel(value);
            sum += decibel / partials;
        }
        buf[i] = product;
    }

    const index = findMaxIndices(buf)[0];
    const freq = indexToFreq(index * 1.0 / partials);
    return freq;
}

function decibelToColor(decibel) {
    const lower = analyser.minDecibels;
    const upper = analyser.maxDecibels;
    const gamma = 1.2;
    const percentage = Math.max(0, Math.min(1, (decibel - lower) / (upper - lower)));
    const value = Math.pow(percentage, gamma);
    if (colorMap === 'grayscale') {
        const v = (1.0 - value) * 255;
        return [v, v, v];
    } else if (colorMap === "magma") {
        const index = Math.round(value * 255);
        return MAGMA_COLORMAP[index];
    } else if (colorMap === "inferno") {
        const index = Math.round(value * 255);
        return INFERNO_COLORMAP[index];
    }
}

function valueToDecibel(value) {
    const decibelScale = (analyser.maxDecibels - analyser.minDecibels) / 255.0;
    const decibelOffset = analyser.minDecibels;
    return value * decibelScale + decibelOffset;
}

function accentColor() {
    if (colorMap === 'grayscale') {
        return [0, 0, 0];
    } else if (colorMap === "magma") {
        return [255, 255, 255];
    } else if (colorMap === "inferno") {
        return [255, 255, 255];
    }
}

function scale(x) {
    if (scalaVariant === "log") {
        return logScale(x, lowerFrequency, upperFrequency);
    } else if (scalaVariant === "linear") {
        return lowerFrequency + x * (upperFrequency - lowerFrequency);
    } else if (scalaVariant === "mel") {
        const lower = 1127 * Math.log(1 + lowerFrequency / 700);
        const upper = 1127 * Math.log(1 + upperFrequency / 700);
        const mel = lower + x * (upper - lower);
        return 700 * Math.exp(mel / 1127 - 1);
    }
}

function inverseScale(y) {
    if (scalaVariant === "log") {
        return inverseLogScale(y, lowerFrequency, upperFrequency);
    } else if (scalaVariant === "linear") {
        return (y - lowerFrequency) / (upperFrequency - lowerFrequency);
    } else if (scalaVariant === "mel") {
        const lower = 1127 * Math.log(1 + lowerFrequency / 700);
        const upper = 1127 * Math.log(1 + upperFrequency / 700);
        const freq = 1127 * Math.log(1 + y / 700);
        return (freq - lower) / (upper - lower);
    }
}

function logScale(x, a, b) {
    x = Math.max(0, Math.min(1, x));
    const logRange = Math.log2(b) - Math.log2(a);
    return Math.pow(2, x * logRange + Math.log2(a));
}

function inverseLogScale(y, a, b) {
    y = Math.max(a, Math.min(b, y));
    const logRange = Math.log2(b) - Math.log2(a);
    return (Math.log2(y) - Math.log2(a)) / logRange;
}

function indexToFreq(index) {
    const nyquist = audioContext.sampleRate / 2.0;
    return nyquist / analyser.frequencyBinCount * index;
}

function freqToIndex(frequency) {
    const nyquist = audioContext.sampleRate / 2.0;
    return frequency / nyquist * analyser.frequencyBinCount;
}

function findMaxIndices(array) {
    const indices = new Array(array.length);
    for (let i = 0; i < array.length; i++) {
        indices[i] = i;
    }

    indices.sort((a, b) => array[b] - array[a]);
    return indices;
}

const NOTE_NAMES = ["A", "A#", "B", "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#"];

const INFERNO_COLORMAP = [
    [0, 0, 4],
    [1, 0, 5],
    [1, 1, 6],
    [1, 1, 8],
    [2, 1, 10],
    [2, 2, 12],
    [2, 2, 14],
    [3, 2, 16],
    [4, 3, 18],
    [4, 3, 20],
    [5, 4, 23],
    [6, 4, 25],
    [7, 5, 27],
    [8, 5, 29],
    [9, 6, 31],
    [10, 7, 34],
    [11, 7, 36],
    [12, 8, 38],
    [13, 8, 41],
    [14, 9, 43],
    [16, 9, 45],
    [17, 10, 48],
    [18, 10, 50],
    [20, 11, 52],
    [21, 11, 55],
    [22, 11, 57],
    [24, 12, 60],
    [25, 12, 62],
    [27, 12, 65],
    [28, 12, 67],
    [30, 12, 69],
    [31, 12, 72],
    [33, 12, 74],
    [35, 12, 76],
    [36, 12, 79],
    [38, 12, 81],
    [40, 11, 83],
    [41, 11, 85],
    [43, 11, 87],
    [45, 11, 89],
    [47, 10, 91],
    [49, 10, 92],
    [50, 10, 94],
    [52, 10, 95],
    [54, 9, 97],
    [56, 9, 98],
    [57, 9, 99],
    [59, 9, 100],
    [61, 9, 101],
    [62, 9, 102],
    [64, 10, 103],
    [66, 10, 104],
    [68, 10, 104],
    [69, 10, 105],
    [71, 11, 106],
    [73, 11, 106],
    [74, 12, 107],
    [76, 12, 107],
    [77, 13, 108],
    [79, 13, 108],
    [81, 14, 108],
    [82, 14, 109],
    [84, 15, 109],
    [85, 15, 109],
    [87, 16, 110],
    [89, 16, 110],
    [90, 17, 110],
    [92, 18, 110],
    [93, 18, 110],
    [95, 19, 110],
    [97, 19, 110],
    [98, 20, 110],
    [100, 21, 110],
    [101, 21, 110],
    [103, 22, 110],
    [105, 22, 110],
    [106, 23, 110],
    [108, 24, 110],
    [109, 24, 110],
    [111, 25, 110],
    [113, 25, 110],
    [114, 26, 110],
    [116, 26, 110],
    [117, 27, 110],
    [119, 28, 109],
    [120, 28, 109],
    [122, 29, 109],
    [124, 29, 109],
    [125, 30, 109],
    [127, 30, 108],
    [128, 31, 108],
    [130, 32, 108],
    [132, 32, 107],
    [133, 33, 107],
    [135, 33, 107],
    [136, 34, 106],
    [138, 34, 106],
    [140, 35, 105],
    [141, 35, 105],
    [143, 36, 105],
    [144, 37, 104],
    [146, 37, 104],
    [147, 38, 103],
    [149, 38, 103],
    [151, 39, 102],
    [152, 39, 102],
    [154, 40, 101],
    [155, 41, 100],
    [157, 41, 100],
    [159, 42, 99],
    [160, 42, 99],
    [162, 43, 98],
    [163, 44, 97],
    [165, 44, 96],
    [166, 45, 96],
    [168, 46, 95],
    [169, 46, 94],
    [171, 47, 94],
    [173, 48, 93],
    [174, 48, 92],
    [176, 49, 91],
    [177, 50, 90],
    [179, 50, 90],
    [180, 51, 89],
    [182, 52, 88],
    [183, 53, 87],
    [185, 53, 86],
    [186, 54, 85],
    [188, 55, 84],
    [189, 56, 83],
    [191, 57, 82],
    [192, 58, 81],
    [193, 58, 80],
    [195, 59, 79],
    [196, 60, 78],
    [198, 61, 77],
    [199, 62, 76],
    [200, 63, 75],
    [202, 64, 74],
    [203, 65, 73],
    [204, 66, 72],
    [206, 67, 71],
    [207, 68, 70],
    [208, 69, 69],
    [210, 70, 68],
    [211, 71, 67],
    [212, 72, 66],
    [213, 74, 65],
    [215, 75, 63],
    [216, 76, 62],
    [217, 77, 61],
    [218, 78, 60],
    [219, 80, 59],
    [221, 81, 58],
    [222, 82, 56],
    [223, 83, 55],
    [224, 85, 54],
    [225, 86, 53],
    [226, 87, 52],
    [227, 89, 51],
    [228, 90, 49],
    [229, 92, 48],
    [230, 93, 47],
    [231, 94, 46],
    [232, 96, 45],
    [233, 97, 43],
    [234, 99, 42],
    [235, 100, 41],
    [235, 102, 40],
    [236, 103, 38],
    [237, 105, 37],
    [238, 106, 36],
    [239, 108, 35],
    [239, 110, 33],
    [240, 111, 32],
    [241, 113, 31],
    [241, 115, 29],
    [242, 116, 28],
    [243, 118, 27],
    [243, 120, 25],
    [244, 121, 24],
    [245, 123, 23],
    [245, 125, 21],
    [246, 126, 20],
    [246, 128, 19],
    [247, 130, 18],
    [247, 132, 16],
    [248, 133, 15],
    [248, 135, 14],
    [248, 137, 12],
    [249, 139, 11],
    [249, 140, 10],
    [249, 142, 9],
    [250, 144, 8],
    [250, 146, 7],
    [250, 148, 7],
    [251, 150, 6],
    [251, 151, 6],
    [251, 153, 6],
    [251, 155, 6],
    [251, 157, 7],
    [252, 159, 7],
    [252, 161, 8],
    [252, 163, 9],
    [252, 165, 10],
    [252, 166, 12],
    [252, 168, 13],
    [252, 170, 15],
    [252, 172, 17],
    [252, 174, 18],
    [252, 176, 20],
    [252, 178, 22],
    [252, 180, 24],
    [251, 182, 26],
    [251, 184, 29],
    [251, 186, 31],
    [251, 188, 33],
    [251, 190, 35],
    [250, 192, 38],
    [250, 194, 40],
    [250, 196, 42],
    [250, 198, 45],
    [249, 199, 47],
    [249, 201, 50],
    [249, 203, 53],
    [248, 205, 55],
    [248, 207, 58],
    [247, 209, 61],
    [247, 211, 64],
    [246, 213, 67],
    [246, 215, 70],
    [245, 217, 73],
    [245, 219, 76],
    [244, 221, 79],
    [244, 223, 83],
    [244, 225, 86],
    [243, 227, 90],
    [243, 229, 93],
    [242, 230, 97],
    [242, 232, 101],
    [242, 234, 105],
    [241, 236, 109],
    [241, 237, 113],
    [241, 239, 117],
    [241, 241, 121],
    [242, 242, 125],
    [242, 244, 130],
    [243, 245, 134],
    [243, 246, 138],
    [244, 248, 142],
    [245, 249, 146],
    [246, 250, 150],
    [248, 251, 154],
    [249, 252, 157],
    [250, 253, 161],
    [252, 255, 164],
];

const MAGMA_COLORMAP = [
    [0, 0, 4],
    [1, 0, 5],
    [1, 1, 6],
    [1, 1, 8],
    [2, 1, 10],
    [2, 2, 12],
    [2, 2, 14],
    [3, 3, 16],
    [4, 3, 18],
    [4, 4, 20],
    [5, 4, 22],
    [6, 5, 24],
    [6, 5, 26],
    [7, 6, 28],
    [8, 7, 30],
    [9, 7, 32],
    [10, 8, 34],
    [11, 9, 36],
    [12, 9, 38],
    [13, 10, 41],
    [14, 11, 43],
    [16, 11, 45],
    [17, 12, 47],
    [18, 13, 50],
    [19, 13, 52],
    [20, 14, 54],
    [21, 14, 57],
    [23, 15, 59],
    [24, 15, 61],
    [25, 16, 64],
    [26, 16, 66],
    [28, 16, 68],
    [29, 17, 71],
    [30, 17, 73],
    [32, 17, 76],
    [33, 17, 78],
    [35, 18, 81],
    [36, 18, 83],
    [38, 18, 86],
    [39, 18, 88],
    [41, 17, 90],
    [42, 17, 93],
    [44, 17, 95],
    [46, 17, 97],
    [47, 17, 99],
    [49, 17, 101],
    [51, 16, 103],
    [52, 16, 105],
    [54, 16, 107],
    [56, 16, 109],
    [58, 15, 111],
    [59, 15, 112],
    [61, 15, 113],
    [63, 15, 115],
    [65, 15, 116],
    [66, 15, 117],
    [68, 15, 118],
    [70, 16, 119],
    [71, 16, 120],
    [73, 16, 121],
    [75, 17, 122],
    [76, 17, 122],
    [78, 17, 123],
    [79, 18, 124],
    [81, 18, 124],
    [83, 19, 125],
    [84, 19, 125],
    [86, 20, 126],
    [87, 21, 126],
    [89, 21, 126],
    [91, 22, 127],
    [92, 22, 127],
    [94, 23, 127],
    [95, 24, 128],
    [97, 24, 128],
    [98, 25, 128],
    [100, 26, 128],
    [101, 26, 129],
    [103, 27, 129],
    [105, 28, 129],
    [106, 28, 129],
    [108, 29, 129],
    [109, 30, 129],
    [111, 30, 130],
    [112, 31, 130],
    [114, 31, 130],
    [116, 32, 130],
    [117, 33, 130],
    [119, 33, 130],
    [120, 34, 130],
    [122, 34, 130],
    [123, 35, 130],
    [125, 36, 130],
    [127, 36, 130],
    [128, 37, 130],
    [130, 37, 130],
    [131, 38, 130],
    [133, 38, 130],
    [134, 39, 130],
    [136, 40, 130],
    [138, 40, 130],
    [139, 41, 130],
    [141, 41, 129],
    [142, 42, 129],
    [144, 42, 129],
    [146, 43, 129],
    [147, 43, 129],
    [149, 44, 129],
    [151, 44, 129],
    [152, 45, 128],
    [154, 46, 128],
    [155, 46, 128],
    [157, 47, 128],
    [159, 47, 127],
    [160, 48, 127],
    [162, 48, 127],
    [164, 49, 127],
    [165, 49, 126],
    [167, 50, 126],
    [169, 50, 126],
    [170, 51, 125],
    [172, 51, 125],
    [174, 52, 124],
    [175, 52, 124],
    [177, 53, 124],
    [178, 53, 123],
    [180, 54, 123],
    [182, 54, 122],
    [183, 55, 122],
    [185, 56, 121],
    [187, 56, 121],
    [188, 57, 120],
    [190, 57, 120],
    [192, 58, 119],
    [193, 59, 118],
    [195, 59, 118],
    [196, 60, 117],
    [198, 60, 117],
    [200, 61, 116],
    [201, 62, 115],
    [203, 63, 115],
    [204, 63, 114],
    [206, 64, 113],
    [208, 65, 112],
    [209, 66, 112],
    [211, 66, 111],
    [212, 67, 110],
    [214, 68, 109],
    [215, 69, 109],
    [217, 70, 108],
    [218, 71, 107],
    [220, 72, 106],
    [221, 73, 106],
    [222, 74, 105],
    [224, 75, 104],
    [225, 76, 103],
    [226, 77, 102],
    [228, 78, 102],
    [229, 79, 101],
    [230, 81, 100],
    [231, 82, 99],
    [233, 83, 99],
    [234, 84, 98],
    [235, 86, 97],
    [236, 87, 97],
    [237, 89, 96],
    [238, 90, 95],
    [239, 92, 95],
    [240, 93, 94],
    [241, 95, 94],
    [242, 97, 93],
    [242, 98, 93],
    [243, 100, 93],
    [244, 102, 93],
    [245, 104, 92],
    [245, 105, 92],
    [246, 107, 92],
    [247, 109, 92],
    [247, 111, 92],
    [248, 113, 92],
    [248, 114, 92],
    [249, 116, 92],
    [249, 118, 93],
    [250, 120, 93],
    [250, 122, 93],
    [250, 124, 94],
    [251, 126, 94],
    [251, 128, 95],
    [251, 129, 95],
    [252, 131, 96],
    [252, 133, 96],
    [252, 135, 97],
    [253, 137, 98],
    [253, 139, 99],
    [253, 141, 99],
    [253, 143, 100],
    [253, 145, 101],
    [254, 147, 102],
    [254, 149, 103],
    [254, 150, 104],
    [254, 152, 105],
    [254, 154, 106],
    [254, 156, 107],
    [255, 158, 108],
    [255, 160, 109],
    [255, 162, 111],
    [255, 164, 112],
    [255, 165, 113],
    [255, 167, 114],
    [255, 169, 115],
    [255, 171, 117],
    [255, 173, 118],
    [255, 175, 119],
    [255, 177, 121],
    [255, 179, 122],
    [255, 180, 124],
    [255, 182, 125],
    [255, 184, 126],
    [255, 186, 128],
    [255, 188, 129],
    [255, 190, 131],
    [255, 191, 132],
    [255, 193, 134],
    [255, 195, 135],
    [255, 197, 137],
    [255, 199, 139],
    [255, 201, 140],
    [255, 203, 142],
    [255, 204, 143],
    [255, 206, 145],
    [255, 208, 147],
    [255, 210, 148],
    [255, 212, 150],
    [255, 214, 152],
    [255, 215, 153],
    [255, 217, 155],
    [254, 219, 157],
    [254, 221, 159],
    [254, 223, 160],
    [254, 225, 162],
    [254, 226, 164],
    [254, 228, 166],
    [254, 230, 167],
    [254, 232, 169],
    [254, 234, 171],
    [254, 236, 173],
    [253, 237, 175],
    [253, 239, 177],
    [253, 241, 179],
    [253, 243, 180],
    [253, 245, 182],
    [253, 246, 184],
    [253, 248, 186],
    [253, 250, 188],
    [253, 252, 190],
    [253, 254, 192],
];
init();
