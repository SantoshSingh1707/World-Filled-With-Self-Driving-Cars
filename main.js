/**
 * Main simulation file for self-driving car evolution
 * Implements genetic algorithm for neural network evolution
 */

// Initialize canvas elements - wait for layout to be ready
function initializeCanvases() {
    const carCanvas = document.getElementById("carCanvas");
    const networkCanvas = document.getElementById("networkCanvas");
    const miniMapCanvas = document.getElementById("miniMapCanvas");

    if (!carCanvas || !networkCanvas || !miniMapCanvas) {
        console.error("Canvas elements not found");
        return;
    }

    // Car canvas - use container size
    const canvasContainer = document.getElementById("canvasContainer");
    if (canvasContainer) {
        carCanvas.width = canvasContainer.offsetWidth;
        carCanvas.height = canvasContainer.offsetHeight;
    } else {
        carCanvas.width = window.innerWidth - 600; // Fallback
        carCanvas.height = window.innerHeight;
    }

    // Network canvas
    networkCanvas.width = typeof CONFIG !== 'undefined' ? CONFIG.NETWORK_CANVAS_WIDTH : 260;
    networkCanvas.height = 300;

    // Mini map canvas
    miniMapCanvas.width = typeof CONFIG !== 'undefined' ? CONFIG.MINIMAP_SIZE : 260;
    miniMapCanvas.height = typeof CONFIG !== 'undefined' ? CONFIG.MINIMAP_SIZE : 260;
}
// Initialize on load
let carCanvas, networkCanvas, miniMapCanvas, carCtx, networkCtx;
let worldReadyRetries = 0;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
        initializeCanvases();
        setTimeout(startSimulation, 100); // Wait for layout
    });
} else {
    initializeCanvases();
    setTimeout(startSimulation, 100);
}

function startSimulation() {
    carCanvas = document.getElementById("carCanvas");
    networkCanvas = document.getElementById("networkCanvas");
    miniMapCanvas = document.getElementById("miniMapCanvas");

    if (!carCanvas || !networkCanvas || !miniMapCanvas) {
        console.error("Cannot start: Canvas elements not found");
        return;
    }

    carCtx = carCanvas.getContext("2d");
    networkCtx = networkCanvas.getContext("2d");

    // Wait for world to be ready
    try {
        if (typeof world === 'undefined' || !world || !world.roadBorders) {
            if (worldReadyRetries < 25) {
                worldReadyRetries++;
                if (typeof updateStatus === 'function') {
                    updateStatus('Loading world...');
                }
                return setTimeout(startSimulation, 200);
            } else {
                console.error('World failed to load after retries');
                if (typeof updateStatus === 'function') {
                    updateStatus('World failed to load');
                }
                return;
            }
        }
    } catch (e) {
        if (worldReadyRetries < 25) {
            worldReadyRetries++;
            return setTimeout(startSimulation, 200);
        } else {
            console.error('World not loaded:', e);
            return;
        }
    }

    const viewport = new Viewport(carCanvas, world.zoom, world.offset);
    const miniMap = new MiniMap(miniMapCanvas, world.graph, typeof CONFIG !== 'undefined' ? CONFIG.MINIMAP_SIZE : 260);

    // Add traffic lights automatically at intersections/crossings if none present
    (function addAutoTrafficLights() {
        try {
            if (typeof CONFIG !== 'undefined' && !CONFIG.ENABLE_LIGHTS) return;
            if (!world || !Array.isArray(world.markings) || !world.graph || !Array.isArray(world.graph.points) || !Array.isArray(world.graph.segments)) return;
            const existing = world.markings.filter(m => typeof Light !== 'undefined' && m instanceof Light).length;
            if (existing > 0) return;
            const pts = world.graph.points;
            const segs = world.graph.segments;
            const lights = [];
            for (const p of pts) {
                // compute degree (# of segments meeting at p)
                let degree = 0;
                const touching = [];
                for (const s of segs) {
                    if (typeof s.includes === 'function' && s.includes(p)) {
                        degree++;
                        touching.push(s);
                    }
                }
                // Intersections/crossings typically have degree >= 3
                if (degree >= 3 && touching.length) {
                    const dir = typeof touching[0].directionVector === 'function' ? touching[0].directionVector() : new Point(0, -1);
                    const w = Math.max(24, (world.roadWidth || 60) / 2);
                    lights.push(new Light(new Point(p.x, p.y), dir, w, 18));
                }
            }
            if (lights.length) {
                world.markings.push(...lights);
                console.log(`Added ${lights.length} auto traffic lights`);
            }
        } catch (e) {
            console.warn('Auto traffic lights failed:', e);
        }
    })();

    // Genetic algorithm configuration
    const POPULATION_SIZE = typeof CONFIG !== 'undefined' ? CONFIG.POPULATION_SIZE : 125;
    const MUTATION_RATE = typeof CONFIG !== 'undefined' ? CONFIG.MUTATION_RATE : 0.1;
    const ELITISM_COUNT = typeof CONFIG !== 'undefined' ? CONFIG.ELITISM_COUNT : 5;
    const GENERATION_DURATION = typeof CONFIG !== 'undefined' ? CONFIG.GENERATION_DURATION : 30000; // 30 seconds
    const MIN_FITNESS_FOR_SAVE = typeof CONFIG !== 'undefined' ? CONFIG.MIN_FITNESS_FOR_SAVE : 1000;
    const ENABLE_TRAFFIC = typeof CONFIG !== 'undefined' ? CONFIG.ENABLE_TRAFFIC : true;
    const TRAFFIC_COUNT = typeof CONFIG !== 'undefined' ? CONFIG.TRAFFIC_COUNT : 20;
    const TRAFFIC_MAX_SPEED = typeof CONFIG !== 'undefined' ? CONFIG.TRAFFIC_MAX_SPEED : 2.0;

    // Evolution state
    let generation = 0;
    let generationStartTime = Date.now();
    let cars = [];
    let bestCar = null;
    let allCarsDamaged = false;
    let crashHandledThisGen = false;
    let totalTime = 0;
    let manualControlActive = false;
    let manualCar = null;
    let globalBestFitness = parseFloat(localStorage.getItem('globalBestFitness') || '0') || 0;
    let simulationStartTime = Date.now();

    // Declare traffic before any function uses it
    let traffic = [];
    let trafficMeta = []; // { laneIndex, targetPoint: Point }

    // Initialize population
    initializeGeneration();
    const roadBorders = world.roadBorders.map((s) => [s.p1, s.p2]);

    // Load saved brain if available
    try {
        const savedBrain = localStorage.getItem("bestBrain");
        if (savedBrain) {
            const parsedBrain = JSON.parse(savedBrain);
            // Apply to all cars with mutations; use deep copies to avoid shared refs
            for (let i = 0; i < cars.length; i++) {
                cars[i].brain = NeuralNetwork.copy(parsedBrain);
                if (i >= ELITISM_COUNT) {
                    NeuralNetwork.mutate(cars[i].brain, MUTATION_RATE);
                }
            }
            console.log(`Loaded saved brain from generation ${localStorage.getItem("generation") || "unknown"}`);
            if (typeof updateSavedGenDisplay === 'function') {
                updateSavedGenDisplay();
            }
        }
    } catch (error) {
        console.warn("Error loading saved brain:", error);
    }

    // UI Functions
    function save() {
        if (!bestCar || !bestCar.brain) {
            console.warn("No best car brain to save");
            if (typeof updateStatus === 'function') {
                updateStatus("No brain to save");
            }
            return;
        }

        try {
            if (bestCar.fitness >= MIN_FITNESS_FOR_SAVE) {
                localStorage.setItem("bestBrain", JSON.stringify(bestCar.brain));
                localStorage.setItem("generation", generation.toString());
                localStorage.setItem("bestFitness", bestCar.fitness.toString());
                console.log(`Saved brain from generation ${generation} with fitness ${bestCar.fitness.toFixed(2)}`);
                if (typeof updateStatus === 'function') {
                    updateStatus("Brain Saved");
                }
                if (typeof updateSavedGenDisplay === 'function') {
                    updateSavedGenDisplay();
                }
            } else {
                const msg = `Fitness ${bestCar.fitness.toFixed(2)} below threshold ${MIN_FITNESS_FOR_SAVE}`;
                console.log(msg);
                if (typeof updateStatus === 'function') {
                    updateStatus(msg);
                }
            }
        } catch (error) {
            console.error("Error saving brain:", error);
            if (typeof updateStatus === 'function') {
                updateStatus("Save Error");
            }
        }
    }

    function discard() {
        try {
            localStorage.removeItem("bestBrain");
            localStorage.removeItem("generation");
            localStorage.removeItem("bestFitness");
            console.log("Discarded saved brain");
            if (typeof updateStatus === 'function') {
                updateStatus("Brain Discarded");
            }
            if (typeof updateSavedGenDisplay === 'function') {
                updateSavedGenDisplay();
            }
        } catch (error) {
            console.error("Error discarding brain:", error);
        }
    }

    // Make functions globally accessible
    window.save = save;
    window.discard = discard;

    /**
     * Generate cars at the starting position
     */
    function generateCars(count) {
        const lanes = Array.isArray(world.laneGuides) ? world.laneGuides : [];
        const newCars = [];
        const carWidth = typeof CONFIG !== 'undefined' ? CONFIG.CAR_WIDTH : 30;
        const carHeight = typeof CONFIG !== 'undefined' ? CONFIG.CAR_HEIGHT : 50;
        for (let i = 0; i < count; i++) {
            let x = 100, y = 100, ang = -Math.PI/2;
            if (lanes.length) {
                const seg = lanes[Math.floor(Math.random() * lanes.length)];
                const t = 0.1 + Math.random() * 0.8;
                x = seg.p1.x + (seg.p2.x - seg.p1.x) * t;
                y = seg.p1.y + (seg.p2.y - seg.p1.y) * t;
                const dir = seg.directionVector();
                ang = -angle(dir) + Math.PI/2;
            }
            const c = new Car(x, y, carWidth, carHeight, "AI", ang);
            newCars.push(c);
        }
        return newCars;
    }

    /**
     * Generate AI-driven traffic cars (non-evolving)
     */
    // Helper: spawn a single traffic car near refPoint
    function spawnTrafficCarNear(refPoint) {
        const lanes = Array.isArray(world.laneGuides) ? world.laneGuides : [];
        const carWidth = typeof CONFIG !== 'undefined' ? CONFIG.CAR_WIDTH : 30;
        const carHeight = typeof CONFIG !== 'undefined' ? CONFIG.CAR_HEIGHT : 50;
        let savedBrain = null;
        try {
            const sb = localStorage.getItem("bestBrain");
            if (sb) savedBrain = JSON.parse(sb);
        } catch (_) { }
        // Prefer lanes nearest to the reference point
        const rankedLanes = lanes.length ? [...lanes].sort((a, b) => {
            const am = new Point((a.p1.x + a.p2.x) / 2, (a.p1.y + a.p2.y) / 2);
            const bm = new Point((b.p1.x + b.p2.x) / 2, (b.p1.y + b.p2.y) / 2);
            return distance(am, refPoint) - distance(bm, refPoint);
        }) : [];
        const pickFrom = rankedLanes.length ? rankedLanes.slice(0, Math.min(30, rankedLanes.length)) : [];
        const seg = pickFrom.length ? pickFrom[Math.floor(Math.random() * pickFrom.length)]
            : (lanes.length ? lanes[Math.floor(Math.random() * lanes.length)] : null);
        // Spawn somewhere along the segment, biased near reference
        let startP;
        if (seg) {
            const t = 0.2 + Math.random() * 0.6; // avoid endpoints
            startP = new Point(seg.p1.x + (seg.p2.x - seg.p1.x) * t, seg.p1.y + (seg.p2.y - seg.p1.y) * t);
        } else {
            startP = new Point(refPoint.x + (Math.random() - 0.5) * 100, refPoint.y + (Math.random() - 0.5) * 100);
        }
        const dir = seg ? seg.directionVector() : new Point(0, -1);
        const angleRad = -angle(dir) + Math.PI / 2;
        // Spawn as AI to get sensor, but disable auto-brain control
        const c = new Car(startP.x, startP.y, carWidth, carHeight, "AI", angleRad, TRAFFIC_MAX_SPEED, "red");
        c.useBrain = false;
        if (savedBrain) {
            c.brain = NeuralNetwork.copy(savedBrain);
        }
        const targetPoint = seg ? seg.p2 : add(startP, scale(dir, 200));
        return { car: c, meta: { laneIndex: seg ? lanes.indexOf(seg) : -1, targetPoint } };
    }

    function generateTraffic(count) {
        const items = [];
        trafficMeta = [];
        const refPoint = bestCar
            ? new Point(bestCar.x, bestCar.y)
            : (world.markings.find(m => m instanceof Start)?.center || new Point(200, 200));
        for (let i = 0; i < count; i++) {
            const spawn = spawnTrafficCarNear(refPoint);
            items.push(spawn.car);
            trafficMeta.push(spawn.meta);
        }
        return items;
    }

    /**
     * Initialize a new generation
     */
    function initializeGeneration() {
        cars = generateCars(POPULATION_SIZE);
        generationStartTime = Date.now();
        allCarsDamaged = false;
        crashHandledThisGen = false;

        // Find best car after initialization
        if (cars.length > 0) {
            bestCar = cars[0];
        }

        console.log(`Generation ${generation} started with ${POPULATION_SIZE} cars`);
        // Initialize traffic once per generation start (only if enabled)
        traffic = ENABLE_TRAFFIC ? generateTraffic(TRAFFIC_COUNT) : [];
    }

    /**
     * Select best performing cars for next generation
     * Uses tournament selection
     */
    function selectParents() {
        // Sort cars by fitness (descending)
        const sorted = [...cars].sort((a, b) => b.fitness - a.fitness);

        // Tournament selection: randomly pick 3 cars, choose best one
        const selected = [];
        for (let i = 0; i < POPULATION_SIZE; i++) {
            const tournament = [];
            for (let j = 0; j < 3; j++) {
                tournament.push(sorted[Math.floor(Math.random() * sorted.length)]);
            }
            tournament.sort((a, b) => b.fitness - a.fitness);
            selected.push(tournament[0]);
        }
        return selected;
    }

    /**
     * Evolve to next generation using genetic algorithm
     */
    function evolveGeneration() {
        // Save best brain before evolution
        if (bestCar && bestCar.fitness >= MIN_FITNESS_FOR_SAVE) {
            save();
        }

        // Sort by fitness
        cars.sort((a, b) => b.fitness - a.fitness);

        // Log generation statistics
        const avgFitness = cars.reduce((sum, car) => sum + car.fitness, 0) / cars.length;
        const maxFitness = bestCar ? bestCar.fitness : 0;
        console.log(`Generation ${generation} complete - Best: ${maxFitness.toFixed(2)}, Avg: ${avgFitness.toFixed(2)}`);

        // Append this generation to rolling aggregate in localStorage
        try {
            appendGenerationToAggregate(cars, generation);
        } catch (e) {
            console.warn('Append to aggregate failed:', e);
        }

        // Create next generation
        const nextGeneration = [];

        // Elitism: keep best N cars unchanged
        for (let i = 0; i < ELITISM_COUNT && i < cars.length; i++) {
            const elite = cars[i];
            const newCar = generateCars(1)[0];
            newCar.brain = NeuralNetwork.copy(elite.brain);
            nextGeneration.push(newCar);
        }

        // Fill rest with crossover and mutation
        while (nextGeneration.length < POPULATION_SIZE) {
            // Select two parents
            const parents = selectParents();
            const parent1 = parents[Math.floor(Math.random() * parents.length)];
            const parent2 = parents[Math.floor(Math.random() * parents.length)];

            // Create child through crossover
            const child = generateCars(1)[0];
            child.brain = NeuralNetwork.crossover(parent1.brain, parent2.brain);

            // Mutate child (except if it's from elite parents)
            NeuralNetwork.mutate(child.brain, MUTATION_RATE);

            nextGeneration.push(child);
        }

        cars = nextGeneration;
        generation++;
        generationStartTime = Date.now();
        allCarsDamaged = false;

        console.log(`Generation ${generation} started`);
        if (typeof updateStatus === 'function') {
            updateStatus(`Generation ${generation} Started`);
        }
    }

    // Make evolveGeneration globally accessible
    window.evolveGeneration = evolveGeneration;

    // Toggle best car driving mode between AI and Manual (keyboard)
    window.toggleDriveMode = function() {
        try {
            if (!bestCar) {
                if (typeof updateStatus === 'function') updateStatus('No car to control');
                return;
            }
            if (bestCar.useBrain) {
                // Switch to manual
                bestCar.useBrain = false;
                bestCar.controls = new Controls('KEYS');
                if (typeof updateStatus === 'function') updateStatus('Manual Mode');
                manualControlActive = true;
                manualCar = bestCar;
            } else {
                // Switch back to AI
                bestCar.useBrain = true;
                bestCar.controls = new Controls('AI');
                if (typeof updateStatus === 'function') updateStatus('AI Mode');
                manualControlActive = false;
                manualCar = null;
            }
        } catch (e) {
            console.warn('toggleDriveMode failed:', e);
        }
    }

    function appendGenerationToAggregate(carsToExport, genNumber) {
        const genRecord = {
            generation: genNumber,
            timestamp: new Date().toISOString(),
            cars: carsToExport.map(c => ({ id: c.id, fitness: c.fitness, damaged: !!c.damaged, brain: c.brain }))
        };
        let aggregate = [];
        try {
            const current = localStorage.getItem('aggregateBrains');
            if (current) aggregate = JSON.parse(current);
        } catch (_) { /* ignore parse errors */ }
        aggregate.push(genRecord);
        try {
            localStorage.setItem('aggregateBrains', JSON.stringify(aggregate));
        } catch (e) {
            console.warn('Failed to store aggregate (possibly too large):', e);
        }
    }

    /**
     * Check if generation should end
     */
    function shouldEndGeneration() {
        // Remove time-left feature: run indefinitely until all cars are damaged
        // End if all cars are damaged
        return cars.length > 0 && cars.every(car => car.damaged);
    }

    /**
     * Main animation loop
     */
    function animate(time) {
        // Check if paused
        if (typeof window.isPaused === 'function' && window.isPaused()) {
            requestAnimationFrame(animate);
            return;
        }

        // Get simulation speed
        const speed = typeof window.getSimulationSpeed === 'function' ? window.getSimulationSpeed() : 1;

        // Update based on speed (skip frames if speed < 1)
        if (speed < 1 && Math.random() > speed) {
            requestAnimationFrame(animate);
            return;
        }

        // Update traffic only if enabled
        if (ENABLE_TRAFFIC) {
            const lanes = Array.isArray(world.laneGuides) ? world.laneGuides : [];
            for (let i = 0; i < traffic.length; i++) {
                const car = traffic[i];
                const meta = trafficMeta[i];
                if (!meta) continue;
                if (!meta.targetPoint || distance(new Point(car.x, car.y), meta.targetPoint) < 25 || meta.laneIndex < 0 || !lanes[meta.laneIndex]) {
                    const seg = lanes.length ? lanes[Math.floor(Math.random() * lanes.length)] : null;
                    if (seg) {
                        meta.laneIndex = lanes.indexOf(seg);
                        meta.targetPoint = seg.p2;
                    } else {
                        meta.laneIndex = -1;
                        meta.targetPoint = add(new Point(car.x, car.y), new Point(0, -100));
                    }
                }
                const dirVec = subtract(meta.targetPoint, new Point(car.x, car.y));
                const desired = -angle(dirVec) + Math.PI / 2;
                let delta = desired - car.angle;
                while (delta > Math.PI) delta -= 2 * Math.PI;
                while (delta < -Math.PI) delta += 2 * Math.PI;
                const turnThresh = (typeof CONFIG !== 'undefined' ? CONFIG.TURN_SPEED : 0.03) * 2;

                if (car.sensor) {
                    car.sensor.update(roadBorders, traffic.length > 1 ? traffic.filter((_, j) => j !== i) : []);
                    const offsets = car.sensor.readings.map(s => s == null ? 0 : 1 - s.offset);
                    if (car.brain) {
                        const outputs = NeuralNetwork.feedForward(offsets, car.brain);
                        car.controls.forward = outputs[0] > 0.5;
                        car.controls.left = outputs[1] > 0.5;
                        car.controls.right = outputs[2] > 0.5;
                        car.controls.reverse = outputs[3] > 0.5;
                    }
                    const minReading = car.sensor.readings.reduce((m, r) => {
                        if (!r) return m;
                        return Math.min(m, r.offset);
                    }, 1);
                    const unsafe = (minReading < 0.1) || car.controls.reverse;
                    if (unsafe) {
                        car.controls.reverse = false;
                        car.controls.forward = true;
                        car.controls.left = delta > turnThresh;
                        car.controls.right = delta < -turnThresh;
                    }
                } else {
                    car.controls.forward = true;
                    car.controls.reverse = false;
                    car.controls.left = delta > turnThresh;
                    car.controls.right = delta < -turnThresh;
                }

                const others = traffic.length > 1 ? traffic.filter((_, j) => j !== i) : [];
                car.update(roadBorders, others);
                // Continuous traffic: recycle damaged or far cars only if allowed
                if (typeof CONFIG !== 'undefined' && CONFIG.CONTINUOUS_TRAFFIC) {
                    const refPoint = bestCar ? new Point(bestCar.x, bestCar.y) : new Point(0, 0);
                    const maxDist = 2000;
                    const tooFar = distance(new Point(car.x, car.y), refPoint) > maxDist;
                    if (car.damaged || tooFar) {
                        const spawn = spawnTrafficCarNear(refPoint);
                        traffic[i] = spawn.car;
                        trafficMeta[i] = spawn.meta;
                    }
                }
            }
        }

        // Update all cars (multiple times if speed > 1)
        const updateCount = Math.max(1, Math.floor(speed));
        for (let update = 0; update < updateCount; update++) {
            for (let i = 0; i < cars.length; i++) {
                cars[i].update(roadBorders, ENABLE_TRAFFIC ? traffic : []);
            }
        }

        // Find best car (highest fitness) unless manual mode is active
        if (manualControlActive && manualCar && !manualCar.damaged) {
            bestCar = manualCar;
        } else {
            bestCar = cars.reduce((best, car) =>
                car.fitness > (best?.fitness || 0) ? car : best, null
            );
            if (manualControlActive && (!manualCar || manualCar.damaged)) {
                // Auto-exit manual if the manual car is gone or damaged
                manualControlActive = false;
                manualCar = null;
                if (typeof updateStatus === 'function') updateStatus('AI Mode');
            }
        }

        // Check if generation should end
        if (shouldEndGeneration()) {
            evolveGeneration();
        }

        // Update world with current cars (hide damaged)
        world.cars = cars.filter(c => !c.damaged);
        world.bestCar = bestCar;

        // Camera follows best car
        if (bestCar) {
            viewport.offset.x = -bestCar.x;
            viewport.offset.y = -bestCar.y;
        }

        // If best car crashed, save progress and continue from that point with next car
        if (bestCar && bestCar.damaged && !crashHandledThisGen) {
            try {
                if (typeof save === 'function') save();
                // Find next candidate car
                const next = cars.find(c => !c.damaged && c !== bestCar);
                if (next) {
                    next.x = bestCar.x;
                    next.y = bestCar.y;
                    next.angle = bestCar.angle;
                    next.speed = 0;
                    // Update viewport will switch once bestCar becomes next
                } else {
                    // No cars left, evolve immediately
                    evolveGeneration();
                }
            } catch (e) {
                console.warn('Crash resume failed:', e);
            }
            crashHandledThisGen = true;
        }

        // Draw everything
        viewport.reset();
        const viewPoint = scale(viewport.getOffset(), -1);
        world.draw(carCtx, viewPoint, false);
        miniMap.update(viewPoint);

        // Draw traffic (skip damaged) only if enabled
        if (ENABLE_TRAFFIC) {
            for (let i = 0; i < traffic.length; i++) {
                if (!traffic[i].damaged) {
                    traffic[i].draw(carCtx);
                }
            }
        }

        // If a new global best brain is found, persist it
        if (bestCar && bestCar.fitness > globalBestFitness) {
            globalBestFitness = bestCar.fitness;
            try {
                localStorage.setItem('globalBestFitness', String(globalBestFitness));
                localStorage.setItem('bestBrain', JSON.stringify(bestCar.brain));
                localStorage.setItem('generation', String(generation));
                localStorage.setItem('bestFitness', String(bestCar.fitness));
            } catch (_) { /* ignore quota errors */ }
            if (typeof window.saveBestBrainToFile === 'function') {
                window.saveBestBrainToFile(bestCar.brain, generation, bestCar.fitness).catch(() => { });
            }
        }

        // Draw neural network visualization
        if (bestCar && bestCar.brain) {
            networkCtx.lineDashOffset = -(time || 0) / (typeof CONFIG !== 'undefined' ? CONFIG.NETWORK_ANIMATION_SPEED : 50);
            networkCtx.clearRect(0, 0, networkCanvas.width, networkCanvas.height);
            Visualizer.drawNetwork(networkCtx, bestCar.brain);
        }

        // Update UI statistics
        const activeCars = cars.filter(c => !c.damaged).length;
        const avgFitness = cars.length > 0
            ? cars.reduce((sum, car) => sum + car.fitness, 0) / cars.length
            : 0;
        const timeLeft = Math.max(0, GENERATION_DURATION - (Date.now() - generationStartTime));
        totalTime = (Date.now() - simulationStartTime) / 1000;

        if (typeof updateStatistics === 'function') {
            updateStatistics(
                generation,
                bestCar ? bestCar.fitness : 0,
                avgFitness,
                activeCars,
                timeLeft / 1000,
                totalTime
            );
        }

        requestAnimationFrame(animate);
    }

    // Start animation
    animate();

    // Handle window resize
    window.addEventListener('resize', function () {
        initializeCanvases();
        if (carCanvas && viewport) {
            viewport.canvas = carCanvas;
        }
    });
}

// File System Access integration for saving best brain into a single chosen file (overwrite)
let bestBrainFileHandle = null;

async function setBestBrainFileHandle(handle) {
    bestBrainFileHandle = handle || null;
}

async function saveBestBrainToFile(brain, gen, fitness) {
    if (!bestBrainFileHandle) return; // user hasn't chosen a file yet
    try {
        const writable = await bestBrainFileHandle.createWritable();
        const payload = {
            generation: gen,
            fitness: fitness,
            timestamp: new Date().toISOString(),
            config: (typeof CONFIG !== 'undefined') ? CONFIG : null,
            brain
        };
        await writable.write(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
        await writable.close();
    } catch (e) {
        console.warn('Failed writing best brain file:', e);
    }
}

window.setBestBrainFileHandle = setBestBrainFileHandle;
window.saveBestBrainToFile = saveBestBrainToFile;
