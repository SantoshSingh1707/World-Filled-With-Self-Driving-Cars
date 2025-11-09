/**
 * UI Controller for Self-Driving Car Simulator
 * Handles all user interface interactions and display updates
 */

// Global UI state
let isPaused = false;
let simulationSpeed = 1;
let startTime = Date.now();
let fitnessHistory = [];
const MAX_HISTORY = 50;

// Initialize UI after DOM loads
document.addEventListener('DOMContentLoaded', function () {
    initializeUI();
});

/**
 * Initialize UI components
 */
function initializeUI() {
    // Initialize fitness chart
    const chartCanvas = document.getElementById('fitnessChart');
    if (chartCanvas) {
        chartCanvas.width = chartCanvas.offsetWidth;
        chartCanvas.height = chartCanvas.offsetHeight;
    }

    // Load saved generation info
    updateSavedGenDisplay();

    // Initialize settings form
    loadSettingsToForm();

    // Update info displays
    updateInfoDisplay();
}

/**
 * Export the rolling aggregate of all generations' brains
 */
function exportAggregateBrains() {
    try {
        const dataStr = localStorage.getItem('aggregateBrains');
        if (!dataStr) {
            alert('No aggregate data found to export.');
            return;
        }
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `brains_aggregate.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        updateStatus('Aggregate Exported');
    } catch (error) {
        console.error('Aggregate export error:', error);
        alert('Error exporting aggregate: ' + error.message);
    }
}

/**
 * Toggle pause/play state
 */
function togglePause() {
    isPaused = !isPaused;
    const pauseBtn = document.getElementById('pauseBtn');
    const pauseIcon = document.getElementById('pauseIcon');
    const pauseText = document.getElementById('pauseText');

    if (isPaused) {
        pauseIcon.textContent = '▶️';
        pauseText.textContent = 'Play';
        pauseBtn.classList.remove('btn-primary');
        pauseBtn.classList.add('btn-success');
        updateStatus('Paused');
        if (document && document.body) {
            document.body.classList.add('paused');
        }
    } else {
        pauseIcon.textContent = '⏸️';
        pauseText.textContent = 'Pause';
        pauseBtn.classList.remove('btn-success');
        pauseBtn.classList.add('btn-primary');
        updateStatus('Running');
        if (document && document.body) {
            document.body.classList.remove('paused');
        }
    }
}

/**
 * Set simulation speed
 */
function setSpeed(speed) {
    simulationSpeed = parseFloat(speed);
    const speedValue = document.getElementById('speedValue');
    const speedSlider = document.getElementById('speedSlider');

    if (speedValue) speedValue.textContent = speed + 'x';
    if (speedSlider) speedSlider.value = speed;

    updateStatus(`Speed: ${speed}x`);
}

/**
 * Reset current generation
 */
function resetGeneration() {
    if (confirm('Reset the current generation? All progress will be lost.')) {
        // This will be called from main.js if the function exists globally
        if (typeof evolveGeneration === 'function') {
            evolveGeneration();
            updateStatus('Generation Reset');
        }
    }
}

/**
 * Toggle settings modal
 */
function toggleSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.toggle('active');
        if (modal.classList.contains('active')) {
            loadSettingsToForm();
        }
    }
}

/**
 * Load current config values into settings form
 */
function loadSettingsToForm() {
    if (typeof CONFIG === 'undefined') return;

    const elements = {
        'settingPopSize': CONFIG.POPULATION_SIZE,
        'settingTrafficCount': CONFIG.TRAFFIC_COUNT,
        'settingMutRate': CONFIG.MUTATION_RATE,
        'settingElitism': CONFIG.ELITISM_COUNT,
        'settingGenDuration': CONFIG.GENERATION_DURATION / 1000,
        'settingMaxSpeed': CONFIG.MAX_SPEED,
        'settingTrafficSpeed': CONFIG.TRAFFIC_MAX_SPEED,
        'settingRayCount': CONFIG.SENSOR_RAY_COUNT
    };

    for (const [id, value] of Object.entries(elements)) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }
}

/**
 * Apply settings from form
 */
function applySettings() {
    if (typeof CONFIG === 'undefined') return;

    try {
        CONFIG.POPULATION_SIZE = parseInt(document.getElementById('settingPopSize').value);
        CONFIG.TRAFFIC_COUNT = Math.max(0, parseInt(document.getElementById('settingTrafficCount').value));
        CONFIG.MUTATION_RATE = parseFloat(document.getElementById('settingMutRate').value);
        CONFIG.ELITISM_COUNT = parseInt(document.getElementById('settingElitism').value);
        CONFIG.GENERATION_DURATION = parseFloat(document.getElementById('settingGenDuration').value) * 1000;
        CONFIG.MAX_SPEED = parseFloat(document.getElementById('settingMaxSpeed').value);
        CONFIG.TRAFFIC_MAX_SPEED = parseFloat(document.getElementById('settingTrafficSpeed').value);

        const newRayCount = parseInt(document.getElementById('settingRayCount').value);
        if (newRayCount !== CONFIG.SENSOR_RAY_COUNT) {
            CONFIG.SENSOR_RAY_COUNT = newRayCount;
            alert('Sensor ray count changed. Please reset the simulation for changes to take effect.');
        } else {
            CONFIG.SENSOR_RAY_COUNT = newRayCount;
        }

        CONFIG.NEURAL_NETWORK.INPUT_NEURONS = CONFIG.SENSOR_RAY_COUNT;

        updateInfoDisplay();
        updateStatus('Settings Applied');
        toggleSettings();

        // Optionally restart generation with new settings
        if (confirm('Restart generation with new settings?')) {
            if (typeof evolveGeneration === 'function') {
                evolveGeneration();
            }
        }
    } catch (error) {
        console.error('Error applying settings:', error);
        alert('Error applying settings: ' + error.message);
    }
}

/**
 * Reset settings to default
 */
function resetSettings() {
    if (confirm('Reset all settings to default values?')) {
        // Reset CONFIG to defaults (these should match config.js defaults)
        if (typeof CONFIG !== 'undefined') {
            CONFIG.POPULATION_SIZE = 125;
            CONFIG.MUTATION_RATE = 0.1;
            CONFIG.ELITISM_COUNT = 5;
            CONFIG.GENERATION_DURATION = 30000;
            CONFIG.MAX_SPEED = 3;
            CONFIG.SENSOR_RAY_COUNT = 5;
            CONFIG.NEURAL_NETWORK.INPUT_NEURONS = 5;
        }
        loadSettingsToForm();
        updateStatus('Settings Reset');
    }
}

/**
 * Export best brain to JSON file
 */
function exportBrain() {
    try {
        const bestBrain = localStorage.getItem('bestBrain');
        if (!bestBrain) {
            alert('No brain saved to export.');
            return;
        }

        const exportData = {
            brain: JSON.parse(bestBrain),
            generation: localStorage.getItem('generation') || 'unknown',
            fitness: localStorage.getItem('bestFitness') || 'unknown',
            config: typeof CONFIG !== 'undefined' ? {
                populationSize: CONFIG.POPULATION_SIZE,
                mutationRate: CONFIG.MUTATION_RATE,
                sensorRays: CONFIG.SENSOR_RAY_COUNT,
                networkArchitecture: CONFIG.NEURAL_NETWORK
            } : null,
            exportDate: new Date().toISOString()
        };

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `brain_gen${exportData.generation}_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        updateStatus('Brain Exported');
    } catch (error) {
        console.error('Export error:', error);
        alert('Error exporting brain: ' + error.message);
    }
}

/**
 * Import brain from JSON file
 */
function importBrain() {
    const input = document.getElementById('importFile');
    if (input) {
        input.click();
    }
}

async function selectBestBrainFile() {
    try {
        if (!window.showSaveFilePicker) {
            alert('File picker not supported in this browser. Use Chrome or Edge.');
            return;
        }
        const handle = await window.showSaveFilePicker({
            suggestedName: 'best_brain.json',
            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
        });
        if (typeof window.setBestBrainFileHandle === 'function') {
            await window.setBestBrainFileHandle(handle);
        }
        updateStatus('Best brain file selected');
    } catch (e) {
        console.warn('File select cancelled or failed', e);
    }
}

async function loadBestBrainFromFile() {
    try {
        if (!window.showOpenFilePicker) {
            alert('File picker not supported in this browser. Use Chrome or Edge.');
            return;
        }
        const [handle] = await window.showOpenFilePicker({
            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
        });
        const file = await handle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || !data.brain) {
            alert('Invalid best brain file');
            return;
        }
        localStorage.setItem('bestBrain', JSON.stringify(data.brain));
        if (data.generation) localStorage.setItem('generation', String(data.generation));
        if (data.fitness) localStorage.setItem('bestFitness', String(data.fitness));
        updateSavedGenDisplay();
        if (confirm('Best brain loaded. Restart simulation to apply?')) {
            location.reload();
        }
    } catch (e) {
        console.warn('Load best brain cancelled or failed', e);
    }
}

/**
 * Handle file import
 */
function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = JSON.parse(e.target.result);

            if (!data.brain) {
                throw new Error('Invalid brain file format');
            }

            localStorage.setItem('bestBrain', JSON.stringify(data.brain));
            if (data.generation) localStorage.setItem('generation', data.generation);
            if (data.fitness) localStorage.setItem('bestFitness', data.fitness);

            if (confirm('Brain imported successfully! Restart simulation to use it?')) {
                location.reload();
            }

            updateStatus('Brain Imported');
            updateSavedGenDisplay();
        } catch (error) {
            console.error('Import error:', error);
            alert('Error importing brain: ' + error.message);
        }
    };
    reader.readAsText(file);

    // Reset input
    event.target.value = '';
}

/**
 * Update status text
 */
function updateStatus(text) {
    const statusText = document.getElementById('statusText');
    if (statusText) {
        statusText.textContent = text;
    }
}

/**
 * Update all statistics displays
 */
function updateStatistics(gen, bestFitness, avgFitness, activeCars, timeLeft, totalTime) {
    // Generation
    const genDisplay = document.getElementById('genDisplay');
    if (genDisplay) genDisplay.textContent = gen;

    // Fitness
    const bestFitnessDisplay = document.getElementById('bestFitnessDisplay');
    if (bestFitnessDisplay) bestFitnessDisplay.textContent = bestFitness.toFixed(2);

    const avgFitnessDisplay = document.getElementById('avgFitnessDisplay');
    if (avgFitnessDisplay) avgFitnessDisplay.textContent = avgFitness.toFixed(2);

    // Active cars
    const activeCarsDisplay = document.getElementById('activeCarsDisplay');
    if (activeCarsDisplay) activeCarsDisplay.textContent = activeCars;

    // Time-left feature removed; do not show a countdown
    const timeLeftDisplay = document.getElementById('timeLeftDisplay');
    if (timeLeftDisplay) timeLeftDisplay.textContent = '∞';

    const totalTimeDisplay = document.getElementById('totalTimeDisplay');
    if (totalTimeDisplay) totalTimeDisplay.textContent = (totalTime / 60).toFixed(1) + 'm';

    // Progress bar hidden/disabled since there is no time limit
    const progressFill = document.getElementById('generationProgress');
    const progressText = document.getElementById('progressText');
    if (progressFill) progressFill.style.width = '0%';
    if (progressText) progressText.textContent = '';

    // Update fitness history chart
    updateFitnessChart(bestFitness);
}

/**
 * Update fitness history chart
 */
function updateFitnessChart(fitness) {
    fitnessHistory.push(fitness);
    if (fitnessHistory.length > MAX_HISTORY) {
        fitnessHistory.shift();
    }

    const canvas = document.getElementById('fitnessChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#0f0f1e';
    ctx.fillRect(0, 0, width, height);

    if (fitnessHistory.length < 2) return;

    // Find min/max for scaling
    const min = Math.min(...fitnessHistory);
    const max = Math.max(...fitnessHistory);
    const range = max - min || 1;

    // Draw grid
    ctx.strokeStyle = '#2a3a5e';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }

    // Draw line
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let i = 0; i < fitnessHistory.length; i++) {
        const x = (width / (fitnessHistory.length - 1)) * i;
        const y = height - ((fitnessHistory[i] - min) / range) * height;

        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();

    // Draw points
    ctx.fillStyle = '#00f2fe';
    for (let i = 0; i < fitnessHistory.length; i++) {
        const x = (width / (fitnessHistory.length - 1)) * i;
        const y = height - ((fitnessHistory[i] - min) / range) * height;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    }
}

/**
 * Update info display panel
 */
function updateInfoDisplay() {
    if (typeof CONFIG === 'undefined') return;

    const popSizeDisplay = document.getElementById('popSizeDisplay');
    if (popSizeDisplay) popSizeDisplay.textContent = CONFIG.POPULATION_SIZE;

    const mutRateDisplay = document.getElementById('mutRateDisplay');
    if (mutRateDisplay) mutRateDisplay.textContent = (CONFIG.MUTATION_RATE * 100).toFixed(0) + '%';

    const sensorRaysDisplay = document.getElementById('sensorRaysDisplay');
    if (sensorRaysDisplay) sensorRaysDisplay.textContent = CONFIG.SENSOR_RAY_COUNT;

    const networkSizeDisplay = document.getElementById('networkSizeDisplay');
    if (networkSizeDisplay) {
        networkSizeDisplay.textContent = `${CONFIG.NEURAL_NETWORK.INPUT_NEURONS}-${CONFIG.NEURAL_NETWORK.HIDDEN_NEURONS}-${CONFIG.NEURAL_NETWORK.OUTPUT_NEURONS}`;
    }
}

/**
 * Update saved generation display
 */
function updateSavedGenDisplay() {
    const savedGenDisplay = document.getElementById('savedGenDisplay');
    if (savedGenDisplay) {
        const savedGen = localStorage.getItem('generation');
        savedGenDisplay.textContent = savedGen || '-';
    }
}

// Export functions for use in main.js
window.togglePause = togglePause;
window.setSpeed = setSpeed;
window.resetGeneration = resetGeneration;
window.toggleSettings = toggleSettings;
window.applySettings = applySettings;
window.resetSettings = resetSettings;
window.exportBrain = exportBrain;
window.importBrain = importBrain;
window.exportAggregateBrains = exportAggregateBrains;
window.selectBestBrainFile = selectBestBrainFile;
window.loadBestBrainFromFile = loadBestBrainFromFile;
window.handleFileImport = handleFileImport;
window.updateStatistics = updateStatistics;
window.updateStatus = updateStatus;
window.updateInfoDisplay = updateInfoDisplay;
window.updateSavedGenDisplay = updateSavedGenDisplay;

// Check if paused (for main.js)
window.isPaused = function () {
    return isPaused;
};

// Get simulation speed (for main.js)
window.getSimulationSpeed = function () {
    return simulationSpeed;
};

