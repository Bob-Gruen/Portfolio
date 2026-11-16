class Simulation {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = this.canvas.getContext('2d');

        // Matter.js
        this.Engine = Matter.Engine;
        this.Render = Matter.Render;
        this.World = Matter.World;
        this.Bodies = Matter.Bodies;
        this.engine = this.Engine.create();
        this.render = this.Render.create({
            canvas: this.canvas,
            engine: this.engine,
            options: {
                width: this.canvas.width,
                height: this.canvas.height,
                wireframes: false,
                background: 'transparent'
            }
        });

        // Config
        this.NUM_CREATURES = 100;
        this.NUM_FOOD_ITEMS = 450;
        this.FOOD_SPAWN_INTERVAL = 120;
        this.GENERATION_TIMER = 30;
        this.SIM_SPEED = 1;
        this.NETWORK_CONFIG = {
            inputSize: 28, // 7 rays * 3 channels + 2 food scent + 4 self + 1 bias = 28
            hiddenLayers: [14, 8],
            outputSize: 4, // Thrust, Turn Left, Turn Right, Wait
            activation: 'leaky-relu',
            learningRate: 0.01,
            errorThresh: 0.001
        };
        this.SIGHT_DISTANCE = 320;

        // State
        this.creatures = [];
        this.food_items = [];
        this.food_items_poisoned = [];
        this.lake = null;
        this.foodManager = null;
        this.spatialGrid = new SpatialGrid(this.canvas.width, this.canvas.height, this.SIGHT_DISTANCE);
        this.lastFoodSpawnTime = Date.now();
        this.isRunning = true;
        this.drawRays = false;
        this.drawInfoBox = false;
        this.drawUI = true;

        // Timers & Stats
        this.totalSimTime = 0;
        this.generationTimer = 0;
        this.generationCount = 0;
        this.simulationStartTime = 0;
        this.lastUpdateTime = 0;
        this.deltaTime = 0;
        this._vizFrameCounter = 0;

        // Scoring
        this.bestScoreEver = 0;
        this.bestScoreRound = 0;
        this.bestScores = [];
        this.avgScorePerGeneration = [];
        this.averageScore = 0;
        this.averageScoreAllTime = 0;

        // Evolution
        this.bestCreatureEver = null;
        this.bestFitnessEver = -Infinity;
        this.savedCreature = [];
        this.creatureBeingVisualized = null;
        this.creatureVisualizationIndex = 0;

        // Charting
        this.chart_avg = null;

        // Storyland Background & Atmosphere
        this.bgCanvas = document.getElementById('bg-canvas');
        if (this.bgCanvas) {
            this.bgCanvas.width = this.canvas.width;
            this.bgCanvas.height = this.canvas.height;
            this.bgCtx = this.bgCanvas.getContext('2d');
        } else {
            this.bgCtx = null;
        }
        this.groundCanvas = null;
        this.fireflies = [];
        this._statsEl = document.getElementById('bg_console');
    }

    init() {
        this.engine.world.gravity.y = 0;
        this.Render.run(this.render);
        this._createGroundTexture();
        this._initFireflies();
        this.resetWorld();

        this.initChart();
        this._setupEventHandlers();

        // Start requestAnimationFrame loop for smooth, display-synced performance
        this.lastUpdateTime = performance.now();
        const loop = () => {
            this._simulationLoop();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    _initFireflies() {
        this.fireflies = [];
        for (let i = 0; i < 35; i++) {
            this.fireflies.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                size: 1.5 + Math.random() * 2,
                phase: Math.random() * Math.PI * 2,
                color: Math.random() < 0.7 ? '255, 241, 118' : '165, 214, 167'
            });
        }
    }

    _setupEventHandlers() {
        Matter.Events.on(this.engine, 'collisionStart', (event) => this._handleCollisions(event));
        Matter.Events.on(this.render, 'beforeRender', () => this.beforeRender());
        Matter.Events.on(this.render, 'afterRender', () => this.afterRender());

        document.addEventListener('keydown', (event) => {
            if (event.key === 'p' || event.key === 'P') {
                if (event.shiftKey) {
                    if (this.creatures.length > 0) {
                        this.creatureVisualizationIndex--;
                        if (this.creatureVisualizationIndex < 0) {
                            this.creatureVisualizationIndex = this.creatures.length - 1;
                        }
                        this.creatureBeingVisualized = this.creatures[this.creatureVisualizationIndex];
                    }
                } else {
                    this.isRunning = !this.isRunning;
                    if (this.isRunning) {
                        this.lastUpdateTime = performance.now();
                    }
                }
            }

            if (event.key === 'e' || event.key === 'E') this.drawRays = !this.drawRays;
            if (event.key === 'i' || event.key === 'I') this.drawInfoBox = !this.drawInfoBox;
            if (event.key === 's' || event.key === 'S') this.saveBestCreature();
            if (event.key === 'l' || event.key === 'L') this.loadBestCreature();
            if (event.key === 'h' || event.key === 'H') {
                this.drawUI = !this.drawUI;
                const infoPanels = document.querySelectorAll('.info-panels');
                if (infoPanels.length > 0) {
                    infoPanels.forEach(panel => panel.classList.toggle('hidden'));
                }
            }
            if (event.key === 'n' || event.key === 'N') {
                if (this.creatures.length > 0) {
                    this.creatureVisualizationIndex++;
                    if (this.creatureVisualizationIndex >= this.creatures.length) {
                        this.creatureVisualizationIndex = 0;
                    }
                    this.creatureBeingVisualized = this.creatures[this.creatureVisualizationIndex];
                }
            }
        });
    }

    _handleCollisions(event) {
        const pairs = event.pairs;

        for (let i = 0; i < pairs.length; i++) {
            const { bodyA, bodyB } = pairs[i];
            let creatureObj = null;
            let otherBody = null;

            if (bodyA.label === 'creature_body') {
                creatureObj = this.creatures.find(c => c.body === bodyA);
                otherBody = bodyB;
            } else if (bodyB.label === 'creature_body') {
                creatureObj = this.creatures.find(c => c.body === bodyB);
                otherBody = bodyA;
            }

            if (!creatureObj || creatureObj.energy <= 0) continue;

            if (otherBody.label === 'food') {
                const foodIndex = this.food_items.findIndex(f => f.body === otherBody);
                if (foodIndex !== -1) {
                    const foodItem = this.food_items[foodIndex];
                    this.World.remove(this.engine.world, foodItem.body);
                    this.food_items.splice(foodIndex, 1);
                    creatureObj.incrementFoodCount(1);
                    creatureObj.incrementEnergy(foodItem.energyValue);
                }
            } else if (otherBody.label === 'poison') {
                const foodIndex = this.food_items_poisoned.findIndex(f => f.body === otherBody);
                if (foodIndex !== -1) {
                    const foodItem = this.food_items_poisoned[foodIndex];
                    this.World.remove(this.engine.world, foodItem.body);
                    this.food_items_poisoned.splice(foodIndex, 1);
                    creatureObj.incrementPoisonCount(1);
                    creatureObj.decrementFoodCount(1);
                    creatureObj.incrementEnergy(foodItem.energyValue);
                }
            } else if (otherBody.label === 'shallow_water') {
                creatureObj.isInWater = true;
                creatureObj.isInDeepWater = false;
                if (creatureObj.thirst < 75) {
                    creatureObj.drink(20);
                }
            } else if (otherBody.label === 'deep_water') {
                creatureObj.isInWater = true;
                creatureObj.isInDeepWater = true;
            }
        }
    }

    saveBestCreature() {
        if (this.creatures.length === 0) {
            console.log('No creatures to save.');
            return;
        }
        const bestBrain = this.creatures.reduce((a, b) =>
            this.calculateFitness(a) > this.calculateFitness(b) ? a : b
        );
        const brainJSON = JSON.stringify(bestBrain.net.toJSON());
        localStorage.setItem('bestBrain', brainJSON);
        console.log('Best creature saved.');
    }

    loadBestCreature() {
        const saved = localStorage.getItem('bestBrain');
        if (!saved) {
            console.log('No saved creatures found to load.');
            return;
        }

        const savedBrain = JSON.parse(saved);
        if (savedBrain.sizes && savedBrain.sizes[0] !== this.NETWORK_CONFIG.inputSize) {
            console.warn('Saved brain input size does not match current network config; ignoring incompatible brain.');
            return;
        }

        this.creatures.forEach(creature => {
            this.World.remove(this.engine.world, creature.body);
        });
        this.creatures = [];

        for (let i = 0; i < this.NUM_CREATURES; i++) {
            const x = 40 + Math.random() * (this.canvas.width - 80);
            const y = 40 + Math.random() * (this.canvas.height - 80);
            this.creatures.push(new Creature(x, y, savedBrain, Matter, this.engine, this.canvas, this.SIGHT_DISTANCE, this.NETWORK_CONFIG));
        }
        this.creatureVisualizationIndex = 0;
        this.creatureBeingVisualized = this.creatures[0] || null;
        console.log('Creatures loaded!');
    }

    initChart() {
        try {
            this.chart_avg = Highcharts.chart('chart-container', {
                chart: {
                    type: 'area',
                    backgroundColor: 'transparent'
                },
                title: {
                    text: 'Average Score By Generation',
                    style: {
                        color: '#FFF8E1',
                        fontWeight: 'normal',
                        fontFamily: 'Georgia, serif',
                        fontSize: '14px'
                    }
                },
                xAxis: {
                    type: 'linear',
                    labels: { style: { color: '#E8F5E9' } },
                    min: 1,
                    lineColor: 'rgba(255, 224, 130, 0.5)',
                    tickColor: 'rgba(255, 224, 130, 0.5)'
                },
                yAxis: {
                    min: 0,
                    title: {
                        text: 'Average Score',
                        style: { color: '#E8F5E9' }
                    },
                    labels: { style: { color: '#E8F5E9' } },
                    gridLineColor: 'rgba(255, 255, 255, 0.1)',
                    lineColor: 'rgba(255, 224, 130, 0.5)',
                    tickColor: 'rgba(255, 224, 130, 0.5)'
                },
                plotOptions: {
                    area: {
                        fillColor: {
                            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                            stops: [
                                [0, 'rgba(129, 199, 132, 0.65)'],
                                [1, 'rgba(129, 199, 132, 0.05)']
                            ]
                        },
                        marker: {
                            radius: 2,
                            fillColor: '#FFF8E1',
                            lineWidth: 1,
                            lineColor: '#AED581'
                        },
                        lineWidth: 2,
                        lineColor: '#AED581',
                        states: { hover: { lineWidth: 2 } },
                        threshold: null
                    }
                },
                legend: { enabled: false },
                tooltip: { pointFormat: 'Avg Score: <b>{point.y:.2f}</b>' },
                exporting: { enabled: false },
                series: [{
                    name: 'Generation',
                    color: '#81C784',
                    borderWidth: 0,
                    groupPadding: 0,
                    pointStart: 1,
                    data: this.avgScorePerGeneration,
                    dataLabels: { enabled: false }
                }, {
                    name: 'Trend Line',
                    type: 'line',
                    color: 'rgba(255, 213, 79, 0.9)',
                    lineWidth: 2,
                    marker: { enabled: false },
                    enableMouseTracking: true
                }]
            });
        } catch (error) {
            console.error('Error initializing chart:', error);
        }
    }

    updateChart() {
        if (!this.chart_avg) return;

        try {
            const dataArray = this.avgScorePerGeneration;
            if (this.chart_avg.series[0]) {
                this.chart_avg.series[0].setData(dataArray, false);

                if (dataArray.length >= 2) {
                    const { slope, intercept } = this.calculateRegressionLine(dataArray);
                    const regressionData = dataArray.map((_, i) => [i + 1, slope * (i + 1) + intercept]);
                    if (this.chart_avg.series[1]) {
                        this.chart_avg.series[1].setData(regressionData, false);
                    }
                }
                this.chart_avg.redraw();
            }
        } catch (error) {
            console.error('Error updating chart:', error);
        }
    }

    calculateRegressionLine(data) {
        let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
        const n = data.length;

        for (let i = 0; i < n; i++) {
            sumX += i + 1;
            sumY += data[i];
            sumXY += (i + 1) * data[i];
            sumX2 += (i + 1) * (i + 1);
        }

        const denom = (n * sumX2 - sumX * sumX);
        const slope = denom !== 0 ? (n * sumXY - sumX * sumY) / denom : 0;
        const intercept = (sumY - slope * sumX) / n;

        return { slope, intercept };
    }

    _updateNetworkVisualization() {
        if (!this.drawUI) return;
        const canvas = document.getElementById('network-canvas');
        if (!canvas) return;

        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }

        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (this.creatures.length === 0) return;

        const creatureToVisualize = this.creatureBeingVisualized;
        if (!creatureToVisualize || !creatureToVisualize.net) return;

        const nearbyObjects = this.spatialGrid.getNearby(
            creatureToVisualize.body.position.x,
            creatureToVisualize.body.position.y,
            this.SIGHT_DISTANCE
        );
        const inputs = creatureToVisualize.getNetworkInputs(nearbyObjects);
        creatureToVisualize.net.run(inputs);
        const activations = creatureToVisualize.net.outputs;

        this._drawNetworkSimple(ctx, creatureToVisualize, creatureToVisualize.net, inputs, activations);
    }

    _drawNetworkSimple(ctx, bestCreature, net, inputs, activations) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const layerMargin = 20;
        const verticalMargin = 8;

        const netJSON = net.toJSON();
        const layers = [net.options.inputSize, ...(net.options.hiddenLayers || []), net.options.outputSize];
        const layerSpacing = (width - layerMargin * 2) / (layers.length - 1);

        const maxNodesInLayer = Math.max(...layers);
        const availableHeight = height - verticalMargin * 2;

        const nodeDiameterAndMargin = availableHeight / maxNodesInLayer;
        const radius = Math.max(1.5, Math.floor(nodeDiameterAndMargin / 3));
        const nodeMargin = Math.max(2, nodeDiameterAndMargin - (radius * 2));

        const layerPositions = layers.map((size, i) => {
            const currentLayerBlockHeight = size * (radius * 2) + Math.max(0, size - 1) * nodeMargin;
            const startY = (height - currentLayerBlockHeight) / 2;
            const x = layerMargin + i * layerSpacing;
            return Array.from({ length: size }, (_, j) => ({
                x,
                y: startY + j * (radius * 2 + nodeMargin) + radius
            }));
        });

        // Draw connections
        for (let i = 0; i < layerPositions.length - 1; i++) {
            for (let j = 0; j < layerPositions[i].length; j++) {
                const sourceActivation = (i === 0)
                    ? inputs[j]
                    : (bestCreature.net.outputs[i - 1] ? bestCreature.net.outputs[i - 1][j] : 0);

                for (let k = 0; k < (layerPositions[i + 1] || []).length; k++) {
                    if (!netJSON.layers[i + 1].weights || !netJSON.layers[i + 1].weights[k]) continue;

                    const weight = netJSON.layers[i + 1].weights[k][j];
                    const signalStrength = Math.tanh(Math.abs(sourceActivation * weight));
                    if (signalStrength < 0.05) continue; // Skip near-zero lines for speed & clarity

                    const fromNode = layerPositions[i][j];
                    const toNode = layerPositions[i + 1][k];

                    const alpha = signalStrength * 0.85;
                    ctx.strokeStyle = weight > 0 ? `rgba(129, 212, 250, ${alpha})` : `rgba(255, 171, 145, ${alpha})`;
                    ctx.lineWidth = Math.min(Math.abs(weight) * 1.8, 2);

                    ctx.beginPath();
                    ctx.moveTo(fromNode.x, fromNode.y);
                    ctx.lineTo(toNode.x, toNode.y);
                    ctx.stroke();
                }
            }
        }

        const outputLayerIndex = layers.length - 1;
        const winningNodeIndex = bestCreature.getNetworkOutput(inputs);

        layerPositions.forEach((layer, i) => {
            (layer || []).forEach((node, j) => {
                let activation;
                if (i === 0) {
                    activation = inputs[j] || 0;
                } else {
                    const layerActivations = bestCreature.net.outputs[i];
                    activation = (layerActivations && layerActivations[j] !== undefined) ? layerActivations[j] : 0;
                }

                let nodeRadius = radius;
                const isWinningOutput = (i === outputLayerIndex && j === winningNodeIndex);

                if (isWinningOutput) {
                    ctx.fillStyle = '#FFD54F';
                    ctx.strokeStyle = '#FFF8E1';
                    ctx.lineWidth = 2.5;
                    nodeRadius = radius * 1.8;
                } else if (i > 0 && i < outputLayerIndex && activation > 0.75) {
                    ctx.fillStyle = `rgba(255, 235, 59, ${Math.min(1, activation)})`;
                    ctx.strokeStyle = '#FFA726';
                    ctx.lineWidth = 1.5;
                } else {
                    const clamped = Math.max(0, Math.min(1, activation));
                    const r = Math.round(255 * (1 - clamped));
                    const g = Math.round(255 * clamped);
                    ctx.fillStyle = `rgb(${r}, ${g}, 60)`;

                    if (i === 0 && activation > 0.75) {
                        ctx.strokeStyle = '#80DEEA';
                        ctx.lineWidth = 1.5;
                    } else {
                        ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
                        ctx.lineWidth = 0.8;
                    }
                }

                ctx.beginPath();
                ctx.arc(node.x, node.y, nodeRadius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.stroke();
            });
        });
    }

    _createGroundTexture() {
        this.render.options.background = 'transparent';

        const w = this.canvas.width;
        const h = this.canvas.height;
        const offscreen = document.createElement('canvas');
        offscreen.width = w;
        offscreen.height = h;
        const gctx = offscreen.getContext('2d');

        // 1. Enchanted Storybook Meadow base gradient
        const bgGrad = gctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.1, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
        bgGrad.addColorStop(0, '#5a9449');
        bgGrad.addColorStop(0.55, '#467a3b');
        bgGrad.addColorStop(1, '#264927');
        gctx.fillStyle = bgGrad;
        gctx.fillRect(0, 0, w, h);

        // 2. Soft sunlit glade patches & mossy shadows
        for (let i = 0; i < 28; i++) {
            const px = Math.random() * w;
            const py = Math.random() * h;
            const pr = 70 + Math.random() * 140;
            const patchGrad = gctx.createRadialGradient(px, py, 5, px, py, pr);
            if (i % 2 === 0) {
                patchGrad.addColorStop(0, 'rgba(165, 214, 110, 0.14)');
                patchGrad.addColorStop(1, 'rgba(165, 214, 110, 0)');
            } else {
                patchGrad.addColorStop(0, 'rgba(27, 67, 50, 0.18)');
                patchGrad.addColorStop(1, 'rgba(27, 67, 50, 0)');
            }
            gctx.fillStyle = patchGrad;
            gctx.beginPath();
            gctx.arc(px, py, pr, 0, Math.PI * 2);
            gctx.fill();
        }

        // 3. Subtle grass tufts
        gctx.strokeStyle = 'rgba(197, 225, 165, 0.18)';
        gctx.lineWidth = 1.2;
        for (let i = 0; i < 450; i++) {
            const gx = Math.random() * w;
            const gy = Math.random() * h;
            gctx.beginPath();
            gctx.moveTo(gx, gy);
            gctx.lineTo(gx - 2, gy - 5);
            gctx.moveTo(gx, gy);
            gctx.lineTo(gx + 2.5, gy - 4.5);
            gctx.stroke();
        }

        // 4. Tiny storybook wildflowers
        const flowerColors = ['#FFF9C4', '#FFCCBC', '#E1BEE7', '#B3E5FC', '#F8BBD0'];
        for (let i = 0; i < 160; i++) {
            const fx = Math.random() * w;
            const fy = Math.random() * h;
            const color = flowerColors[i % flowerColors.length];
            gctx.fillStyle = color;
            gctx.globalAlpha = 0.45 + Math.random() * 0.35;
            gctx.beginPath();
            gctx.arc(fx, fy, 1.5 + Math.random() * 1.5, 0, Math.PI * 2);
            gctx.fill();
        }
        gctx.globalAlpha = 1;

        // 5. Soft enchanted forest border vignette
        const vig = gctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.38, w * 0.5, h * 0.5, Math.max(w, h) * 0.72);
        vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
        vig.addColorStop(1, 'rgba(12, 28, 16, 0.45)');
        gctx.fillStyle = vig;
        gctx.fillRect(0, 0, w, h);

        this.groundCanvas = offscreen;
    }

    spawnFood(num_food) {
        const clusters = Math.max(1, Math.floor(num_food / 10));
        for (let i = 0; i < clusters; i++) {
            const newItems = this.foodManager.spawnFoodCluster();
            this.food_items.push(...newItems.food);
            this.food_items_poisoned.push(...newItems.poison);
        }
    }

    calculateFitness(creature) {
        let fitness = 0;

        const survivalScore = creature.timeOfDeath
            ? (creature.timeOfDeath - this.simulationStartTime) / 1000
            : this.GENERATION_TIMER;
        fitness += survivalScore * 50;

        // Strong reward for eating food, clear penalty for eating poison
        const foodScore = creature.foodCount > 0 ? Math.pow(creature.foodCount, 2) * 15 : 0;
        const poisonPenalty = creature.poisonCount * 60;
        fitness += foodScore - poisonPenalty;

        // Exploration bonus
        fitness += creature.explorationScore * 6;

        // Energy tie-breaker for survivors
        if (!creature.timeOfDeath) {
            fitness += creature.energy;
        }

        // Penalty for passivity
        if (creature.totalActions > 0 && (creature.actionsTaken[3] / creature.totalActions) > 0.85) {
            fitness *= 0.65;
        }

        return Math.max(0, fitness);
    }

    tournamentSelection(creatures, tournamentSize = 6) {
        const selected = [];
        for (let i = 0; i < 2; i++) {
            let best = creatures[Math.floor(Math.random() * creatures.length)];
            let bestFit = this.calculateFitness(best);
            for (let j = 1; j < tournamentSize; j++) {
                const candidate = creatures[Math.floor(Math.random() * creatures.length)];
                const fit = this.calculateFitness(candidate);
                if (fit > bestFit) {
                    best = candidate;
                    bestFit = fit;
                }
            }
            selected.push(best);
        }
        return selected;
    }

    crossover(brain1, brain2, crossoverRate = 0.5) {
        const brain1JSON = brain1.toJSON();
        const brain2JSON = brain2.toJSON();
        const childJSON = JSON.parse(JSON.stringify(brain1JSON));

        // Neuron-level (row-wise) crossover preserves learned feature detectors
        for (let i = 0; i < childJSON.layers.length; i++) {
            const layer = childJSON.layers[i];
            if (layer.weights) {
                for (let j = 0; j < layer.weights.length; j++) {
                    if (Math.random() < crossoverRate) {
                        layer.weights[j] = [...brain2JSON.layers[i].weights[j]];
                        layer.biases[j] = brain2JSON.layers[i].biases[j];
                    }
                }
            }
        }

        const newBrain = new brain.NeuralNetwork(this.NETWORK_CONFIG);
        newBrain.fromJSON(childJSON);
        return newBrain;
    }

    mutate(net, mutationRate = 0.1, mutationAmount = 0.1) {
        const netJSON = net.toJSON();

        const randomGaussian = () => {
            let u = 0, v = 0;
            while (u === 0) u = Math.random();
            while (v === 0) v = Math.random();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        };

        for (let i = 0; i < netJSON.layers.length; i++) {
            const layer = netJSON.layers[i];
            if (layer.weights) {
                for (let j = 0; j < layer.weights.length; j++) {
                    if (Array.isArray(layer.weights[j])) {
                        for (let k = 0; k < layer.weights[j].length; k++) {
                            if (Math.random() < mutationRate) {
                                layer.weights[j][k] += randomGaussian() * mutationAmount;
                            }
                        }
                    }
                    if (layer.biases && Math.random() < mutationRate) {
                        layer.biases[j] += randomGaussian() * mutationAmount;
                    }
                }
            }
        }
        net.fromJSON(netJSON);
        return net;
    }

    evolvePopulation() {
        if (this.averageScore !== 0) {
            this.avgScorePerGeneration.push(this.averageScore);
        }

        const sum = this.avgScorePerGeneration.reduce((a, b) => a + b, 0);
        this.averageScoreAllTime = (sum !== 0 && this.avgScorePerGeneration.length !== 0)
            ? Number((sum / this.avgScorePerGeneration.length).toFixed(2))
            : 0;

        this.updateChart();

        const newCreatures = [];
        const spawnX = () => 40 + Math.random() * (this.canvas.width - 80);
        const spawnY = () => 40 + Math.random() * (this.canvas.height - 80);

        if (this.creatures.length > 1) {
            // Sort by fitness descending
            this.creatures.sort((a, b) => this.calculateFitness(b) - this.calculateFitness(a));
            const bestCreature = this.creatures[0];
            const bestFitness = this.calculateFitness(bestCreature);

            if (bestFitness > this.bestFitnessEver) {
                this.bestCreatureEver = bestCreature;
                this.bestFitnessEver = bestFitness;

                for (let i = 0; i < 2; i++) {
                    newCreatures.push(new Creature(
                        spawnX(), spawnY(),
                        this.bestCreatureEver.net.toJSON(),
                        Matter, this.engine, this.canvas, this.SIGHT_DISTANCE, this.NETWORK_CONFIG,
                        this.bestCreatureEver.hue
                    ));
                }
            }

            // Keep top 15% unmutated elites (preserves diversity while keeping top performers)
            const eliteCount = Math.min(Math.max(2, Math.floor(this.NUM_CREATURES * 0.15)), this.NUM_CREATURES - 1);
            for (let i = 0; i < eliteCount && newCreatures.length < this.NUM_CREATURES; i++) {
                newCreatures.push(new Creature(
                    spawnX(), spawnY(),
                    this.creatures[i].net.toJSON(),
                    Matter, this.engine, this.canvas, this.SIGHT_DISTANCE, this.NETWORK_CONFIG,
                    this.creatures[i].hue
                ));
            }

            const mutationRate = Math.max(0.05, 0.22 * Math.pow(0.985, this.generationCount));
            const mutationAmount = Math.max(0.06, 0.25 * Math.pow(0.985, this.generationCount));

            while (newCreatures.length < this.NUM_CREATURES) {
                const [parent1, parent2] = this.tournamentSelection(this.creatures);
                let childBrain;
                let childHue = parent1.hue;

                if (Math.random() < 0.04) {
                    // Occasional fresh random explorer
                    newCreatures.push(new Creature(
                        spawnX(), spawnY(), null,
                        Matter, this.engine, this.canvas, this.SIGHT_DISTANCE, this.NETWORK_CONFIG
                    ));
                    continue;
                } else {
                    childBrain = this.crossover(parent1.net, parent2.net, 0.5);
                    if (Math.random() < 0.2 && this.bestCreatureEver) {
                        childBrain = this.crossover(childBrain, this.bestCreatureEver.net, 0.3);
                    }
                    childHue = (parent1.hue + (Math.random() - 0.5) * 24 + 360) % 360;
                }

                this.mutate(childBrain, mutationRate, mutationAmount);
                newCreatures.push(new Creature(
                    spawnX(), spawnY(),
                    childBrain.toJSON(),
                    Matter, this.engine, this.canvas, this.SIGHT_DISTANCE, this.NETWORK_CONFIG,
                    childHue
                ));
            }
        } else {
            for (let i = 0; i < this.NUM_CREATURES; i++) {
                newCreatures.push(new Creature(
                    spawnX(), spawnY(), null,
                    Matter, this.engine, this.canvas, this.SIGHT_DISTANCE, this.NETWORK_CONFIG
                ));
            }
        }

        for (const creature of this.creatures) {
            this.World.remove(this.engine.world, creature.body);
        }
        this.creatures = newCreatures;
    }

    resetWorld(fullReset = false) {
        this.isRunning = false;
        this.generationCount++;

        if (fullReset) {
            for (const creature of this.creatures) {
                this.World.remove(this.engine.world, creature.body);
            }
            this.creatures = [];
            this.bestCreatureEver = null;
            this.bestFitnessEver = -Infinity;
            this.generationCount = 1;
            this.avgScorePerGeneration = [];
            this.averageScore = 0;
            this.averageScoreAllTime = 0;
            this.bestScoreEver = 0;
            this.updateChart();
        }

        this.evolvePopulation();

        if (this.creatures.length > 0) {
            this.creatureVisualizationIndex = 0;
            this.creatureBeingVisualized = this.creatures[0];
        } else {
            this.creatureBeingVisualized = null;
        }
        this.generationTimer = this.GENERATION_TIMER;
        this.simulationStartTime = Date.now();

        for (const food of this.food_items) {
            this.World.remove(this.engine.world, food.body);
        }
        this.food_items = [];

        for (const food of this.food_items_poisoned) {
            this.World.remove(this.engine.world, food.body);
        }
        this.food_items_poisoned = [];

        if (this.lake) {
            this.lake.shallowWater.forEach(w => this.World.remove(this.engine.world, w));
            this.lake.deepWater.forEach(w => this.World.remove(this.engine.world, w));
        }

        this.foodManager = new FoodManager(this.canvas, Matter, this.engine, (items) => {
            this.food_items.push(...items.food);
            this.food_items_poisoned.push(...items.poison);
        }, this.FOOD_SPAWN_INTERVAL);
        this.spawnFood(this.NUM_FOOD_ITEMS);

        this.lake = new Lake(this.canvas, Matter, this.engine);
        this.lake.create();

        this.lastFoodSpawnTime = Date.now();
        this.bestScoreRound = 0;
        this.lastUpdateTime = performance.now();
        this.isRunning = true;
    }

    formatTime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        return [
            hours.toString().padStart(2, '0'),
            minutes.toString().padStart(2, '0'),
            secs.toString().padStart(2, '0')
        ].join(':');
    }

    beforeRender() {
        if (this.bgCtx && this.groundCanvas) {
            this.bgCtx.drawImage(this.groundCanvas, 0, 0);
            if (this.lake) {
                this.lake.draw(this.bgCtx, performance.now() * 0.001);
            }
        }
    }

    afterRender() {
        const timeSeconds = performance.now() * 0.001;

        // Draw creatures (Storyland woodland sprites)
        for (let i = 0; i < this.creatures.length; i++) {
            const c = this.creatures[i];
            if (c.energy > 0 || c.deathAlpha > 0) {
                c.draw(this.ctx, timeSeconds, c === this.creatureBeingVisualized);
            }
        }

        // Draw ambient Storyland fireflies
        for (let i = 0; i < this.fireflies.length; i++) {
            const f = this.fireflies[i];
            f.x += f.vx;
            f.y += f.vy;
            if (f.x < 0) f.x = this.canvas.width;
            if (f.x > this.canvas.width) f.x = 0;
            if (f.y < 0) f.y = this.canvas.height;
            if (f.y > this.canvas.height) f.y = 0;

            const pulse = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(timeSeconds * 2.5 + f.phase));
            this.ctx.fillStyle = `rgba(${f.color}, ${pulse})`;
            this.ctx.beginPath();
            this.ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Update creature highlights
        const sortedCreatures = this.creatures.slice().sort((a, b) => b.foodCount - a.foodCount);
        for (let i = 0; i < this.creatures.length; i++) {
            this.creatures[i].highlight = false;
            this.creatures[i].highlight2 = false;
        }
        if (sortedCreatures.length > 0) sortedCreatures[0].highlight = true;
        if (sortedCreatures.length > 1) sortedCreatures[1].highlight = true;
        if (sortedCreatures.length > 2) sortedCreatures[2].highlight2 = true;
        if (sortedCreatures.length > 3) sortedCreatures[3].highlight2 = true;

        this.bestScoreRound = sortedCreatures.length > 0 ? sortedCreatures[0].foodCount : 0;
        if (this.bestScoreRound > this.bestScoreEver) {
            this.bestScoreEver = this.bestScoreRound;
        }

        // Draw info boxes if enabled (only for living or still-fading creatures)
        if (this.drawInfoBox) {
            for (let i = 0; i < this.creatures.length; i++) {
                const c = this.creatures[i];
                if (c.energy > 0 || c.deathAlpha > 0) {
                    c.drawInfoBox(this.ctx, true);
                }
            }
        }

        // Draw creature rays if enabled
        if (this.drawRays) {
            for (let i = 0; i < this.creatures.length; i++) {
                const creature = this.creatures[i];
                if (creature.energy > 0 && creature.rayResults && creature.rayResults.length > 0) {
                    const startPos = creature.body.position;
                    const baseAngle = creature.body.angle;
                    const fov = creature.RAY_FOV;
                    const rayCount = creature.RAY_COUNT;
                    const angleStep = fov / (rayCount - 1);
                    const startAngle = baseAngle - (fov * 0.5);

                    for (let r = 0; r < rayCount; r++) {
                        const result = creature.rayResults[r];
                        const angle = startAngle + (r * angleStep);
                        const dist = result.distance * this.SIGHT_DISTANCE;
                        const endX = startPos.x + Math.cos(angle) * dist;
                        const endY = startPos.y + Math.sin(angle) * dist;

                        this.ctx.beginPath();
                        this.ctx.moveTo(startPos.x, startPos.y);
                        this.ctx.lineTo(endX, endY);

                        let color = 'rgba(255, 255, 255, 0.16)';
                        if (result.distance < 1) {
                            switch (result.type) {
                                case 'food': color = '#FFD54F'; break;
                                case 'poison': color = '#E040FB'; break;
                                case 'wall': color = '#ECEFF1'; break;
                                case 'shallow_water':
                                case 'deep_water': color = '#4DD0E1'; break;
                                case 'creature_body': color = '#81D4FA'; break;
                                default: color = '#FFF59D';
                            }
                        }
                        this.ctx.strokeStyle = color;
                        this.ctx.lineWidth = 1.5;
                        this.ctx.stroke();

                        if (result.distance < 1) {
                            this.ctx.fillStyle = color;
                            this.ctx.beginPath();
                            this.ctx.arc(endX, endY, 2.8, 0, 2 * Math.PI);
                            this.ctx.fill();
                        }
                    }
                }
            }
        }

        // Stats overlay (rendered as crisp HTML inside #bg_console above the blur layer)
        if (this.drawUI && this._statsEl && this._vizFrameCounter % 5 === 0) {
            let totalFoodEaten = 0;
            for (let i = 0; i < this.creatures.length; i++) {
                totalFoodEaten += this.creatures[i].foodCount;
            }
            const mins = Math.floor(Math.round(this.generationTimer) / 60);
            const secs = Math.round(this.generationTimer % 60);
            this._statsEl.innerHTML =
                `<div>Generation: <b>${this.generationCount}</b></div>` +
                `<div>Time Left: <b>${mins}m ${secs}s</b></div>` +
                `<div>Total Sim Time: <b>${this.formatTime(this.totalSimTime)}</b></div>` +
                `<div>Best Score (all time): <b>${this.bestScoreEver}</b></div>` +
                `<div>Best Score (round): <b>${this.bestScoreRound}</b></div>` +
                `<div>Avg Score (all time): <b>${this.averageScoreAllTime.toFixed(2)}</b></div>` +
                `<div>Avg Score (round): <b>${this.averageScore.toFixed(2)}</b></div>` +
                `<div>Total Food Eaten: <b>${totalFoodEaten}</b></div>` +
                `<div>Sunberries Available: <b>${this.food_items.length}</b></div>`;
        }
    }

    _stepSimulation(stepDtMs) {
        this.deltaTime = stepDtMs;
        this.totalSimTime += stepDtMs / 1000;
        this.generationTimer -= stepDtMs / 1000;

        this.foodManager.updateByDelta(stepDtMs, this.food_items.length, this.NUM_FOOD_ITEMS);

        let totFoodEatenThisRound = 0;

        for (let t = 0; t < this.creatures.length; t++) {
            const curr_creature = this.creatures[t];
            curr_creature.updateMetabolism(stepDtMs);
            totFoodEatenThisRound += curr_creature.foodCount;

            if (curr_creature.energy > 0) {
                const nearbyObjects = this.spatialGrid.getNearby(
                    curr_creature.body.position.x,
                    curr_creature.body.position.y,
                    this.SIGHT_DISTANCE
                );

                const inputs = curr_creature.getNetworkInputs(nearbyObjects);
                const outputs = curr_creature.getNetworkOutputs(inputs);

                const thrust = outputs[0];
                const turnLeft = outputs[1];
                const turnRight = outputs[2];
                const wait = outputs[3];

                const maxForce = 0.0045;
                const move_energy_loss = 0.004;

                // Determine dominant action for passivity tracking
                let domAction = 0;
                let maxVal = outputs[0];
                for (let a = 1; a < 4; a++) {
                    if (outputs[a] > maxVal) {
                        maxVal = outputs[a];
                        domAction = a;
                    }
                }
                curr_creature.totalActions++;
                curr_creature.actionsTaken[domAction]++;

                if (domAction === 3 && wait > 0.65) {
                    curr_creature.isThrusting = false;
                } else {
                    // Smooth simultaneous steering + thrust
                    const turnRate = (turnRight - turnLeft) * 0.2;
                    Matter.Body.setAngularVelocity(curr_creature.body, turnRate);
                    curr_creature.energy -= Math.abs(turnRate) * 0.015;

                    if (thrust > 0.35) {
                        curr_creature.isThrusting = true;
                        const angle = curr_creature.body.angle;
                        const forceMag = maxForce * thrust;
                        Matter.Body.applyForce(curr_creature.body, curr_creature.body.position, {
                            x: Math.cos(angle) * forceMag,
                            y: Math.sin(angle) * forceMag
                        });
                        curr_creature.energy -= move_energy_loss * thrust;
                    } else {
                        curr_creature.isThrusting = false;
                    }
                }

                const maxVelocity = 3.2;
                const velocity = curr_creature.body.velocity;
                const speed = Math.hypot(velocity.x, velocity.y);
                if (speed > maxVelocity) {
                    const scale = maxVelocity / speed;
                    Matter.Body.setVelocity(curr_creature.body, {
                        x: velocity.x * scale,
                        y: velocity.y * scale
                    });
                }

                if (curr_creature.energy <= 0 && !curr_creature._bodyRemoved) {
                    curr_creature._bodyRemoved = true;
                    this.World.remove(this.engine.world, curr_creature.body);
                }
            } else {
                if (!curr_creature._bodyRemoved) {
                    curr_creature._bodyRemoved = true;
                    this.World.remove(this.engine.world, curr_creature.body);
                }
                curr_creature.isThrusting = false;
                Matter.Body.setVelocity(curr_creature.body, { x: 0, y: 0 });
                Matter.Body.setAngularVelocity(curr_creature.body, 0);
            }

            // Soft Wall Implementation
            const boundaryPadding = 45;
            const maxBoundaryForce = 0.004;
            const pos = curr_creature.body.position;
            let bx = 0, by = 0;

            if (pos.x < boundaryPadding) bx = (1 - pos.x / boundaryPadding) * maxBoundaryForce;
            else if (pos.x > this.canvas.width - boundaryPadding) bx = -(1 - (this.canvas.width - pos.x) / boundaryPadding) * maxBoundaryForce;

            if (pos.y < boundaryPadding) by = (1 - pos.y / boundaryPadding) * maxBoundaryForce;
            else if (pos.y > this.canvas.height - boundaryPadding) by = -(1 - (this.canvas.height - pos.y) / boundaryPadding) * maxBoundaryForce;

            if (bx !== 0 || by !== 0) {
                Matter.Body.applyForce(curr_creature.body, pos, { x: bx, y: by });
            }

            curr_creature.updateExplorationScore();

            // Water drag
            if (curr_creature.isInWater) {
                const dragCoefficient = curr_creature.isInDeepWater ? 0.04 : 0.015;
                const vel = curr_creature.body.velocity;
                const spd = Math.hypot(vel.x, vel.y);
                if (spd > 0) {
                    const dragScale = -dragCoefficient * spd;
                    Matter.Body.applyForce(curr_creature.body, pos, {
                        x: vel.x * dragScale,
                        y: vel.y * dragScale
                    });
                }
            }
        }

        // Spatial Grid Update
        this.spatialGrid.clear();
        for (let i = 0; i < this.creatures.length; i++) {
            if (this.creatures[i].energy > 0) {
                this.spatialGrid.insert(this.creatures[i].body);
            }
        }
        for (let i = 0; i < this.food_items.length; i++) {
            this.spatialGrid.insert(this.food_items[i].body);
        }
        for (let i = 0; i < this.food_items_poisoned.length; i++) {
            this.spatialGrid.insert(this.food_items_poisoned[i].body);
        }
        if (this.lake) {
            this.lake.shallowWater.forEach(w => this.spatialGrid.insert(w));
            this.lake.deepWater.forEach(w => this.spatialGrid.insert(w));
        }

        // Handle drowning
        for (let i = 0; i < this.creatures.length; i++) {
            const creature = this.creatures[i];
            if (creature.isInWater) {
                creature.handleDrowning();
            } else {
                creature.timeInWater = 0;
            }
        }

        this.Engine.update(this.engine, 1000 / 60);

        for (let i = 0; i < this.creatures.length; i++) {
            this.creatures[i].isInWater = false;
        }

        this.averageScore = (totFoodEatenThisRound !== 0 && this.NUM_CREATURES !== 0)
            ? totFoodEatenThisRound / this.NUM_CREATURES
            : 0;
    }

    _simulationLoop() {
        if (!this.isRunning) return;

        const now = performance.now();
        // Clamp dt so switching tabs doesn't cause a huge jump
        const rawDt = Math.min(50, Math.max(1, now - this.lastUpdateTime));
        this.lastUpdateTime = now;

        const steps = Math.max(1, Math.min(5, Math.round(this.SIM_SPEED)));
        for (let s = 0; s < steps; s++) {
            this._stepSimulation(rawDt);
            if (this.generationTimer <= 0) {
                this.resetWorld();
                break;
            }
        }

        // Throttle network visualization to every 5th frame (~12 FPS)
        this._vizFrameCounter++;
        if (this._vizFrameCounter % 5 === 0) {
            this._updateNetworkVisualization();
        }
    }
}
