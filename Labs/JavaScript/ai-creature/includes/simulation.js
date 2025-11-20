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
            canvas: this.canvas, // Main simulation canvas
            engine: this.engine,
            options: {
                width: this.canvas.width,
                height: this.canvas.height,
                wireframes: false, // We want to see the sprites
                background: 'transparent' // Make canvas background transparent
            }
        });

        // Config
        this.NUM_CREATURES = 125;
        this.NUM_FOOD_ITEMS = 4000;
        this.FOOD_SPAWN_INTERVAL = 25;
        this.GENERATION_TIMER = 30; // Increased generation time
        this.NETWORK_CONFIG = {
            inputSize: 29, // 3 sensors * (dist, isFood, isPoison, isCreature, isWater, relAngle, relVelX, relVelY) + own energy/speed/thirst/velX/velY
            hiddenLayers: [28, 20],
            outputSize: 8,
            activation: 'leaky-relu',
            learningRate: 0.01,
            errorThresh: 0.001
        };
        this.SIGHT_DISTANCE = 300;

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

        // Background
        this.stars = [];
        this.groundTexture = null;
    }

    init() {
        this.engine.world.gravity.y = 0;
        this.Render.run(this.render);
        this._createGroundTexture();
        this.resetWorld(); // This will set up and start Generation 1

        this.initChart();
        this._setupEventHandlers();
        
        // Start the main simulation loop
        setInterval(() => this._simulationLoop(), 1000 / 60); // 60 FPS

    }

    _setupEventHandlers() {
        Matter.Events.on(this.engine, 'collisionStart', (event) => this._handleCollisions(event));
        Matter.Events.on(this.render, 'afterRender', () => this.afterRender());

        document.addEventListener('keydown', (event) => {
            if (event.key === 'p' || event.key === 'P') {
                if (event.shiftKey) { // Previous creature with Shift+P
                    if (this.creatures.length > 0) {
                        this.creatureVisualizationIndex--;
                        if (this.creatureVisualizationIndex < 0) {
                            this.creatureVisualizationIndex = this.creatures.length - 1;
                        }
                        this.creatureBeingVisualized = this.creatures[this.creatureVisualizationIndex];
                    }
                } else { // Toggle pause with just P
                    this.isRunning = !this.isRunning;
                }
            }


            if (event.key === 'e' || event.key === 'E') this.drawRays = !this.drawRays;
            if (event.key === 'i' || event.key === 'I') this.drawInfoBox = !this.drawInfoBox;
            if (event.key === 's' || event.key === 'S') this.saveBestCreature();
            if (event.key === 'l' || event.key === 'L') this.loadBestCreature(); 
            if (event.key === 'h' || event.key === 'H') {
                this.drawUI = !this.drawUI; // Toggle the UI drawing state
                // Select all elements with the class 'info-panels'
                const infoPanels = document.querySelectorAll('.info-panels');
                // Loop through each panel and toggle its visibility
                if (infoPanels.length > 0) {
                    infoPanels.forEach(panel => panel.classList.toggle('hidden'));
                }
            }
            if (event.key === 'n' || event.key === 'N') { // Next creature
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
        let pairs = event.pairs;

        for (const pair of pairs) {
            const { bodyA, bodyB } = pair;
            const creatureBody = this.creatures.find(c => c.body === bodyA || c.body === bodyB || c.leftArm === bodyA || c.leftArm === bodyB || c.rightArm === bodyA || c.rightArm === bodyB);
            if (!creatureBody) continue;

            const otherBody = (creatureBody.body === bodyA || creatureBody.leftArm === bodyA || creatureBody.rightArm === bodyA) ? bodyB : bodyA;

            if (otherBody.label === 'food') {
                const foodIndex = this.food_items.findIndex(f => f.body === otherBody);
                if (foodIndex !== -1) {
                    this.World.remove(this.engine.world, this.food_items[foodIndex].body);
                    this.food_items.splice(foodIndex, 1);
                    creatureBody.incrementFoodCount(1);
                    creatureBody.incrementEnergy(10);
                }
            } else if (otherBody.label === 'poison') {
                const foodIndex = this.food_items_poisoned.findIndex(f => f.body === otherBody);
                if (foodIndex !== -1) {
                    this.World.remove(this.engine.world, this.food_items_poisoned[foodIndex].body);
                    this.food_items_poisoned.splice(foodIndex, 1);
                    creatureBody.decrementFoodCount(2);
                    creatureBody.decrementEnergy(10);
                }
            } else if (otherBody.label === 'shallow_water') {
                creatureBody.isInWater = true; // Mark as in water
                creatureBody.isInDeepWater = false;
                if (creatureBody.thirst < 70) {
                    creatureBody.drink(20);
                }
            } else if (otherBody.label === 'deep_water') {
                creatureBody.isInWater = true; // Mark as in water
                creatureBody.isInDeepWater = true; // Specifically in deep water
            }
        }
    }

    saveBestCreature() {
        if (this.creatures.length === 0) {
            console.log('No creatures to save.');
            return;
        }
        let bestBrain = this.creatures.reduce((a, b) => a.fitness > b.fitness ? a : b);
        let brainJSON = JSON.stringify(bestBrain.net);

        localStorage.setItem('bestBrain', brainJSON);
        console.log('best creature saved');
    }

    loadBestCreature() {
        const saved = localStorage.getItem('bestBrain');

        if (saved) {
            const savedBrain = JSON.parse(saved);

            this.creatures.forEach(creature => {
                this.World.remove(this.engine.world, creature.body);
                this.World.remove(this.engine.world, creature.leftArm);
                this.World.remove(this.engine.world, creature.rightArm);
            });
            this.creatures = [];

            for (let i = 0; i < this.NUM_CREATURES; i++) {
                let x = Math.random() * this.canvas.width;
                let y = Math.random() * this.canvas.height;
                this.creatures.push(new Creature(x, y, savedBrain, Matter, this.engine, this.canvas, this.SIGHT_DISTANCE));
            }

            console.log('Creatures loaded!');
        } else {
            console.log('No saved creatures found to load.');
        }
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
                        color: '#ffffff',
                        fontWeight: 'normal'
                    }
                },
                xAxis: {
                    type: 'linear',
                    labels: {
                        style: {
                            color: '#ffffff'
                        }
                    },
                    min: 1,
                    lineColor: '#ffffff',
                    tickColor: '#ffffff'
                },
                yAxis: {
                    min: 0,
                    title: {
                        text: 'Average Score',
                        style: {
                            color: '#ffffff'
                        }
                    },
                    labels: {
                        style: {
                            color: '#ffffff'
                        }
                    },
                    gridLineColor: 'rgba(255, 255, 255, 0.1)',
                    lineColor: '#ffffff',
                    tickColor: '#ffffff'
                },
                plotOptions: {
                    area: {
                        fillColor: {
                            linearGradient: {
                                x1: 0,
                                y1: 0,
                                x2: 0,
                                y2: 1
                            },
                            stops: [
                                [0, Highcharts.getOptions().colors[0]],
                                [1, Highcharts.color(Highcharts.getOptions().colors[0]).setOpacity(0).get('rgba')]
                            ]
                        },
                        marker: {
                            radius: 1,
                            fillColor: 'white',
                            lineWidth: 1,
                            lineColor: 'white'
                        },
                        lineWidth: 1,
                        lineColor: 'white',
                        states: {
                            hover: {
                                lineWidth: 1
                            }
                        },
                        threshold: null
                    }
                },
                legend: {
                    enabled: false
                },
                tooltip: {
                    pointFormat: 'Avg Score: <b>{point.y:.1f}</b>'
                },
                exporting: {
                    enabled: false
                },
                series: [{
                    name: 'Generation',
                    color: 'rgba(51, 102, 204, 0.8)',
                    borderWidth: 0,
                    groupPadding: 0,
                    pointStart: 1,
                    data: this.avgScorePerGeneration,
                    dataLabels: {
                        enabled: false
                    }
                }, {
                    name: 'Trend Line',
                    type: 'line',
                    color: 'rgba(255, 255, 29, 0.8)',
                    lineWidth: 3,
                    marker: {
                        enabled: false
                    },
                    enableMouseTracking: true,
                    regression: true,
                    regressionSettings: {
                        type: 'linear',
                        color: 'rgba(255, 255, 0, 0.8)',
                        name: 'Trend',
                        lineWidth: 3
                    }
                }]
            });
        } catch (error) {
            console.error("Error initializing chart: ", error);
        }
    }

    updateChart() {
        if (!this.chart_avg) return;

        try {
            let dataArray = this.avgScorePerGeneration;
            if (this.chart_avg.series[0]) {
                this.chart_avg.series[0].setData(dataArray);

                const {
                    slope,
                    intercept
                } = this.calculateRegressionLine(dataArray);
                const regressionData = dataArray.map((_, i) => [i + 1, slope * (i + 1) + intercept]);

                if (this.chart_avg.series[1]) {
                    this.chart_avg.series[1].setData(regressionData);
                } else {
                    this.chart_avg.addSeries({
                        name: 'Trend Line',
                        type: 'line',
                        color: 'rgba(255, 215, 0, 0.8)',
                        lineWidth: 3,
                        marker: {
                            enabled: false
                        },
                        data: regressionData
                    });
                }
                this.chart_avg.redraw();
            }
        } catch (error) {
            console.error('Error updating chart:', error);
        }
    }

    calculateRegressionLine(data) {
        let sumX = 0,
            sumY = 0,
            sumXY = 0,
            sumX2 = 0;
        const n = data.length;

        for (let i = 0; i < n; i++) {
            sumX += i + 1;
            sumY += data[i];
            sumXY += (i + 1) * data[i];
            sumX2 += (i + 1) * (i + 1);
        }

        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        const intercept = (sumY - slope * sumX) / n;

        return {
            slope,
            intercept
        };
    }

    _updateNetworkVisualization() {
        const canvas = document.getElementById('network-canvas');
        if (!canvas) return;

        // Match canvas resolution to its display size to prevent stretching
        if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
            canvas.width = canvas.clientWidth;
            canvas.height = canvas.clientHeight;
        }

        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (this.creatures.length === 0) {
            return;
        }

        // The creature to visualize is now selected once per generation in resetWorld()
        const creatureToVisualize = this.creatureBeingVisualized;
        if (!creatureToVisualize || !creatureToVisualize.net) {
            return;
        }

        // Get the latest inputs and activations from the best creature
        const inputs = creatureToVisualize.getNetworkInputs();
        creatureToVisualize.net.run(inputs); // This populates net.outputs with hidden and output layers' activations
        const activations = creatureToVisualize.net.outputs;

        this._drawNetworkSimple(ctx, creatureToVisualize, creatureToVisualize.net, inputs, activations);
    }

    _drawNetworkSimple(ctx, bestCreature, net, inputs, activations) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const layerMargin = 20;
        const verticalMargin = 5; // Reduced top and bottom margin
    
        const netJSON = net.toJSON();
        const layers = [net.options.inputSize, ...(net.options.hiddenLayers || []), net.options.outputSize];
        const layerSpacing = (width - layerMargin * 2) / (layers.length - 1);
    
        const maxNodesInLayer = Math.max(...layers);
        const availableHeight = height - verticalMargin * 2;
    
        // Dynamically size nodes to fit vertically.
        const nodeDiameterAndMargin = availableHeight / maxNodesInLayer;
        const radius = Math.max(1, Math.floor(nodeDiameterAndMargin / 3)); // Ensure radius is at least 1
        const nodeMargin = Math.max(2, nodeDiameterAndMargin - (radius * 2)); // Keep margin proportional

        const layerPositions = layers.map((size, i) => {
            // Calculate the block height for the current layer
            const currentLayerBlockHeight = size * (radius * 2) + Math.max(0, size - 1) * nodeMargin;
            const startY = (height - currentLayerBlockHeight) / 2; // Center this layer vertically
            const x = layerMargin + i * layerSpacing;
            const nodePositions = Array.from({ length: size }, (_, j) => ({ x, y: startY + j * (radius * 2 + nodeMargin) + radius }));
            return nodePositions;
        });
    
        // Draw connections
        for (let i = 0; i < layerPositions.length - 1; i++) {
            for (let j = 0; j < layerPositions[i].length; j++) {
                // Get the activation of the source neuron.
                // For hidden layers, we access the nested 'outputs' array from the net object.
                const sourceActivation = (i === 0) ? inputs[j] : (bestCreature.net.outputs[i] ? bestCreature.net.outputs[i][j] : 0);

                for (let k = 0; k < (layerPositions[i + 1] || []).length; k++) {
                    const weight = netJSON.layers[i + 1].weights[k][j];
                    const signalStrength = Math.tanh(Math.abs(sourceActivation * weight)); // tanh to keep it between 0 and 1
    
                    const fromNode = layerPositions[i][j];
                    const toNode = layerPositions[i + 1][k];
    
                    const alpha = signalStrength * 0.9; // Use signal strength for opacity
                    ctx.strokeStyle = weight > 0 ? `rgba(100, 200, 255, ${alpha})` : `rgba(255, 150, 50, ${alpha})`; // Blue for positive, Orange for negative
                    ctx.lineWidth = Math.min(Math.abs(weight) * 2, 2);

                    ctx.beginPath();
                    ctx.moveTo(fromNode.x, fromNode.y);
                    ctx.lineTo(toNode.x, toNode.y);
                    ctx.stroke();
                }
            }
        }
    
        // Find the winning output node
        const outputLayerIndex = layers.length - 1;
        const winningNodeIndex = bestCreature.getNetworkOutput();

        // Draw nodes with activation colors
        layerPositions.forEach((layer, i) => {
            (layer || []).forEach((node, j) => {
                let activation;
                if (i === 0) { // Input layer uses the raw, normalized inputs
                    activation = inputs[j] || 0;
                } else { // Hidden and output layers use the calculated activations from net.outputs
                    // net.outputs is an array of layer outputs, starting from layer 1 (first hidden)
                    const layerActivations = bestCreature.net.outputs[i];
                    activation = (layerActivations && layerActivations[j] !== undefined) ? layerActivations[j] : 0;
                }
                
                let nodeRadius = radius; // Default radius

                // Highlight the winning output node
                const isWinningOutput = (i === outputLayerIndex && j === winningNodeIndex);

                if (isWinningOutput) {
                    ctx.fillStyle = 'gold'; // Special color for the winner
                    ctx.strokeStyle = 'gold';
                    ctx.lineWidth = 3; // Thicker border for the winner
                    nodeRadius = radius * 2; // Make the winner larger
                } else {
                    // Highlight activated hidden layer nodes
                    if (i > 0 && i < outputLayerIndex && activation > 0.75) {
                        ctx.fillStyle = `rgba(255, 255, 0, ${activation})`;
                        ctx.strokeStyle = 'orange';
                        ctx.lineWidth = 2;
                    } else {
                        // Interpolate color from red (low) to green (high) for other nodes
                        const r = Math.round(255 * (1 - activation));
                        const g = Math.round(255 * activation);
                        ctx.fillStyle = `rgb(${r}, ${g}, 0)`;
    
                        if (i === 0 && activation > 0.75) { // Highlight highly active input nodes
                            ctx.strokeStyle = 'cyan';
                            ctx.lineWidth = 2;
                        } else {
                            ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
                            ctx.lineWidth = 1;
                        }
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
        // Set the renderer background to be transparent.
        // This will allow the CSS background to show through.
        this.render.options.background = 'transparent';
    }

    spawnFood(num_food) {
        for (let i = 0; i < Math.floor(num_food / 10); i++) { // Assuming average cluster size of 10
            const newItems = this.foodManager.spawnFoodCluster();
            this.food_items.push(...newItems.food);
            this.food_items_poisoned.push(...newItems.poison);
        }
    }

    calculateFitness(creature) {
        // New Fitness Strategy: Survival, Eating, and Exploration
        let fitness = 0;
    
        // 1. Survival Time Score: The most important factor.
        // If the creature died, its score is based on how long it survived.
        // If it survived the whole generation, it gets the maximum survival score.
        let survivalScore = creature.timeOfDeath
            ? (creature.timeOfDeath - this.simulationStartTime) / 1000
            : this.GENERATION_TIMER;
        fitness += survivalScore * 50; // Heavily weight survival
    
        // 2. Food Score: Strongly reward eating, heavily penalize poison.
        // Using Math.pow to create a steeper reward/penalty curve.
        const foodScore = creature.foodCount > 0 ? Math.pow(creature.foodCount, 2) * 10 : -Math.pow(Math.abs(creature.foodCount), 2) * 20;
        fitness += foodScore;
    
        // 3. Exploration Bonus: Additive bonus for exploration.
        // This is now a secondary objective to encourage movement without overpowering other scores.
        const explorationBonus = creature.explorationScore * 5; // 5 points per percentage of map explored
        fitness += explorationBonus;
    
        // 4. Energy Bonus (Tie-breaker for survivors)
        if (!creature.timeOfDeath) {
            fitness += creature.energy;
        }
    
        // 5. Penalty for passivity
        if (creature.totalActions > 0 && (creature.actionsTaken[7] / creature.totalActions) > 0.9) {
            fitness *= 0.7; // Penalize creatures that did nothing > 90% of the time
        }

        return Math.max(0, fitness); // Fitness cannot be negative
    }

    calculateExplorationScore(creature) {
        const gridSize = 10;
        const totalCells = Math.ceil(this.canvas.width / gridSize) * Math.ceil(this.canvas.height / gridSize);
        const exploredPercentage = creature.visitedCells.size / totalCells;
        return exploredPercentage * 100;
    }

    tournamentSelection(creatures, tournamentSize = 6) {
        let selected = [];
        for (let i = 0; i < 2; i++) {
            let tournament = [];
            for (let j = 0; j < tournamentSize; j++) {
                tournament.push(creatures[Math.floor(Math.random() * creatures.length)]);
            }
            selected.push(tournament.reduce((best, current) =>
                this.calculateFitness(current) > this.calculateFitness(best) ? current : best
            ));
        }
        return selected;
    }

    crossover(brain1, brain2, crossoverRate = 0.7) {
        // Convert parent networks to JSON for stable manipulation
        const brain1JSON = brain1.toJSON();
        const brain2JSON = brain2.toJSON();
        const childJSON = JSON.parse(JSON.stringify(brain1JSON)); // Deep copy of structure
    
        // Perform uniform crossover on the weights and biases within the JSON
        for (let i = 0; i < childJSON.layers.length; i++) {
            const layer = childJSON.layers[i];
    
            if (layer.weights) {
                for (let j = 0; j < layer.weights.length; j++) {
                    for (let k = 0; k < layer.weights[j].length; k++) {
                        if (Math.random() > 0.5) {
                            layer.weights[j][k] = brain2JSON.layers[i].weights[j][k];
                        }
                    }
                    if (Math.random() > 0.5) {
                        layer.biases[j] = brain2JSON.layers[i].biases[j];
                    }
                }
            }
        }
    
        // Create a new brain and load it from the combined JSON
        const newBrain = new brain.NeuralNetwork(this.NETWORK_CONFIG);
        newBrain.fromJSON(childJSON);
        return newBrain;
    }

    mutate(brain, mutationRate = 0.1, mutationAmount = 0.1) {
        const netJSON = brain.toJSON();

        // Gaussian random function
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
                            if (Math.random() < mutationRate) layer.weights[j][k] += randomGaussian() * mutationAmount;
                        }
                    }
                    if (layer.biases && Math.random() < mutationRate) layer.biases[j] += randomGaussian() * mutationAmount;
                }
            }
        }
        brain.fromJSON(netJSON);
        return brain;
    }

    evolvePopulation() {
        if (this.averageScore != 0) {
            this.avgScorePerGeneration.push(this.averageScore);
        }

        let sum = this.avgScorePerGeneration.reduce((a, b) => a + b, 0);
        this.averageScoreAllTime = (sum != 0 && this.avgScorePerGeneration.length != 0) ?
            Number(((sum / this.avgScorePerGeneration.length).toFixed(2))) : 0;

        this.updateChart();

        const newCreatures = [];

        if (this.creatures.length > 1) {
            const bestCreature = this.creatures.reduce((best, current) =>
                this.calculateFitness(current) > this.calculateFitness(best) ? current : best
            );

            if (this.calculateFitness(bestCreature) > this.bestFitnessEver) {
                this.bestCreatureEver = bestCreature;
                this.bestFitnessEver = this.calculateFitness(bestCreature);

                for (let i = 0; i < 4; i++) {
                    let x = Math.random() * this.canvas.width;
                    let y = Math.random() * this.canvas.height;
                    newCreatures.push(new Creature(x, y, this.bestCreatureEver.net.toJSON(), Matter, this.engine, this.canvas, this.SIGHT_DISTANCE));
                }
            }

            this.creatures.sort((a, b) => this.calculateFitness(b) - this.calculateFitness(a));

            const eliteCount = Math.floor(this.creatures.length * 0.40); // Increased elitism
            for (let i = 0; i < eliteCount; i++) {
                let x = Math.random() * this.canvas.width;
                let y = Math.random() * this.canvas.height;
                newCreatures.push(new Creature(x, y, this.creatures[i].net.toJSON(), Matter, this.engine, this.canvas, this.SIGHT_DISTANCE));
            }

            while (newCreatures.length < this.creatures.length) {
                const [parent1, parent2] = this.tournamentSelection(this.creatures);
                let childBrain;

                if (Math.random() < 0.15) {
                    childBrain = new brain.NeuralNetwork(this.NETWORK_CONFIG);
                    childBrain.initialize();
                } else {
                    childBrain = this.crossover(parent1.net, parent2.net);
                    if (Math.random() < 0.25 && this.bestCreatureEver) {
                        childBrain = this.crossover(childBrain, this.bestCreatureEver.net, 0.3);
                    }
                }

                // Anneal mutation rate and amount over generations
                const mutationRate = Math.max(0.05, 0.2 * Math.pow(0.99, this.generationCount));
                const mutationAmount = Math.max(0.05, 0.2 * Math.pow(0.99, this.generationCount));
                this.mutate(childBrain, mutationRate, mutationAmount);
                let x = Math.random() * this.canvas.width;
                let y = Math.random() * this.canvas.height;
                newCreatures.push(new Creature(x, y, childBrain.toJSON(), Matter, this.engine, this.canvas, this.SIGHT_DISTANCE));
            }
        } else {
            for (let i = 0; i < this.NUM_CREATURES; i++) {
                let x = Math.random() * this.canvas.width;
                let y = Math.random() * this.canvas.height;                
                newCreatures.push(new Creature(x, y, null, Matter, this.engine, this.canvas, this.SIGHT_DISTANCE, this.NETWORK_CONFIG));
            }
        }

        for (let creature of this.creatures) {
            this.World.remove(this.engine.world, creature.body);
            this.World.remove(this.engine.world, creature.leftArm);
            this.World.remove(this.engine.world, creature.rightArm);
            this.World.remove(this.engine.world, creature.leftArmConstraint);
            this.World.remove(this.engine.world, creature.rightArmConstraint);
        }
        this.creatures = newCreatures;
    }

    resetWorld() {
        this.isRunning = false;
        this.generationCount++;

        // Evolve population first, then increment generation for the *next* round
        this.evolvePopulation();

        // Select a creature to visualize for this entire generation.
        // We'll pick the first one, which is part of the elite from the previous generation.
        if (this.creatures.length > 0) {
            this.creatureVisualizationIndex = 0;
            this.creatureBeingVisualized = this.creatures[0];
        } else {
            this.creatureBeingVisualized = null;
        }
        this.generationTimer = this.GENERATION_TIMER;
        this.simulationStartTime = Date.now();

        for (let food of this.food_items) {
            this.World.remove(this.engine.world, food.body);
        }
        this.food_items = [];

        for (let food of this.food_items_poisoned) {
            this.World.remove(this.engine.world, food.body);
        }
        if (this.lake) {
            this.lake.shallowWater.forEach(w => this.World.remove(this.engine.world, w));
            this.lake.deepWater.forEach(w => this.World.remove(this.engine.world, w));
        }

        this.food_items_poisoned = [];

        // Re-initialize the food manager to ensure we're starting fresh.
        this.foodManager = new FoodManager(this.canvas, Matter, this.engine, (items) => {
            this.food_items.push(...items.food);
            this.food_items_poisoned.push(...items.poison);
        });
        this.spawnFood(this.NUM_FOOD_ITEMS);

        // Create a new lake for the generation
        this.lake = new Lake(this.canvas, Matter, this.engine);
        this.lake.create();

        this.lastFoodSpawnTime = Date.now();

        this.bestScoreRound = 0;
        this.lastUpdateTime = performance.now(); // Reset timer AFTER all work is done
        this.isRunning = true;
    }

    getBestAction(prediction) {
        let maxIndex = 0;
        for (let i = 1; i < prediction.length; i++) {
            if (prediction[i] > prediction[maxIndex]) {
                maxIndex = i;
            }
        }
        return maxIndex;
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

    afterRender() {
        // This function is now only for drawing UI elements on top of the canvas.
        // All simulation logic has been moved to _simulationLoop().

        if (this.drawUI) {
            const totalFoodEaten = this.creatures.reduce((sum, creature) => sum + creature.foodCount, 0);

            this.ctx.font = "20px Arial";
            this.ctx.fillStyle = "white";
            this.ctx.textAlign = 'left';

            this.ctx.fillText("Generation: " + this.generationCount, 20, 40);
            this.ctx.fillText("Generation Time Left: " + Math.floor(Math.round(this.generationTimer) / 60) + "m " + Math.round(this.generationTimer % 60) + "s", 20, 80);
            this.ctx.fillText("Total Sim Time: " + this.formatTime(this.totalSimTime), 20, 120);
            this.ctx.fillText("Best Score (all time): " + this.bestScoreEver, 20, 160);
            this.ctx.fillText("Best Score (round): " + this.bestScoreRound, 20, 200);
            this.ctx.fillText(`Avg Score (all time): ${this.averageScoreAllTime.toFixed(2)}`, 20, 240);
            this.ctx.fillText("Avg Score (round): " + this.averageScore.toFixed(2), 20, 280);
            this.ctx.fillText("Total Food Eaten: " + totalFoodEaten, 20, 320);
            this.ctx.fillText("Total Food Available: " + this.food_items.length, 20, 360);
        }

        // Update creature highlights
        const sortedCreatures = this.creatures.slice().sort((a, b) => b.foodCount - a.foodCount);
        this.creatures.forEach(c => {
            c.highlight = false;
            c.highlight2 = false;
        });

        if (sortedCreatures.length > 0) sortedCreatures[0].highlight = true;
        if (sortedCreatures.length > 1) sortedCreatures[1].highlight = true;
        if (sortedCreatures.length > 2) sortedCreatures[2].highlight2 = true;
        if (sortedCreatures.length > 3) sortedCreatures[3].highlight2 = true;

        // Update scores
        this.bestScoreRound = sortedCreatures.length > 0 ? sortedCreatures[0].foodCount : 0;
        if (this.bestScoreRound > this.bestScoreEver) {
            this.bestScoreEver = this.bestScoreRound;
        }

        // Draw info boxes if enabled
        if (this.drawInfoBox) {
            for (const creature of this.creatures) {
                creature.drawInfoBox(this.ctx, true);
            }
        }

        // Draw creature rays if enabled
        if (this.drawRays) {
            for (const creature of this.creatures) {
                if (creature.energy > 1) {
                    this.ctx.beginPath();
                    this.ctx.arc(creature.body.position.x, creature.body.position.y, this.SIGHT_DISTANCE, 0, 2 * Math.PI);
                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
                    this.ctx.stroke();

                    creature.nearestObjects.forEach((nearest, index) => {
                        if (!nearest) return;
                        let color = 'white';
                        if (index === 0) color = nearest.label === 'food' ? 'green' : (nearest.label === 'poison' ? 'red' : 'blue');
                        else if (index === 1) color = 'yellow';
                        else if (index === 2) color = 'orange';

                        this.ctx.beginPath();
                        this.ctx.moveTo(creature.body.position.x, creature.body.position.y);
                        this.ctx.lineTo(nearest.position.x, nearest.position.y);
                        this.ctx.strokeStyle = color;
                        this.ctx.stroke();
                    });
                }
            }
        }

        // Draw a highlight circle around the creature whose brain is being visualized
        if (this.creatureBeingVisualized && this.creatureBeingVisualized.energy > 0) {
            this.ctx.beginPath();
            this.ctx.arc(this.creatureBeingVisualized.body.position.x, this.creatureBeingVisualized.body.position.y, 30, 0, 2 * Math.PI);
            this.ctx.strokeStyle = 'gold';
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([5, 5]); // Dashed line style
            this.ctx.stroke();
            this.ctx.setLineDash([]); // Reset to solid line
        }
    }

    _simulationLoop() {
        if (!this.isRunning) return;

        this.updateTimers();
        this.foodManager.update(Date.now());

        let totFoodEatenThisRound = 0;

        if (this.isRunning) {
            for (let t = 0; t < this.NUM_CREATURES; t++) {
                let curr_creature = this.creatures[t];
                totFoodEatenThisRound += curr_creature.foodCount;

                // This logic should be moved into the Creature class,
                // but is shown here for completeness of the new input system.
                if (curr_creature.energy > 0) {
                    const nearbyObjects = this.spatialGrid.getNearby(curr_creature.body.position.x, curr_creature.body.position.y, this.SIGHT_DISTANCE);
                    
                    const sortedObjects = nearbyObjects
                        .map(obj => {
                            const distance = Matter.Vector.magnitude(Matter.Vector.sub(obj.position, curr_creature.body.position));
                            return { obj, distance };
                        })
                        .filter(item => item.obj.id !== curr_creature.body.id)
                        .sort((a, b) => a.distance - b.distance);

                    curr_creature.nearestObjects = sortedObjects.slice(0, 3).map(item => item.obj);

                    // **CONCEPT FOR creature.js -> getNetworkInputs()**
                    // The following logic should be implemented inside your Creature class.
                    // It constructs the new, richer input array for the neural network.
                    const inputs = curr_creature.getNetworkInputs(nearbyObjects);
                }

                let x_creature_vel = 0;
                let y_creature_vel = 0;
                let x_creature_left_arm_vel = 0;
                let y_creature_right_arm_vel = 0;
                let move_energy_loss = 0;

                if (curr_creature.energy > 1) {
                    x_creature_vel = (Math.floor(Math.random() * 2) + 1) * 0.25;
                    y_creature_vel = (Math.floor(Math.random() * 2) + 1) * 0.25;
                    x_creature_left_arm_vel = (Math.floor(Math.random() * 2) + 1) * 0.001;
                    y_creature_right_arm_vel = (Math.floor(Math.random() * 2) + 1) * 0.001;
                    move_energy_loss = 0.005;
                }

                if (curr_creature.energy > 0) {
                    const forceMultiplier = 0.001;
                    const maxForce = 0.01;
                    let forceX = 0;
                    let forceY = 0;

                    // The number of outputs from the network is now 8
                    const action = curr_creature.getNetworkOutput();

                    for (let i = 0; i < 3; i++) {
                        const nearest = curr_creature.nearestObjects[i];
                        if (nearest) {
                            // ... (input gathering logic is now inside the creature)
                        } else {
                            // ...
                        }
                    }

                    switch (action) {
                        case 0: // Move Up (absolute)
                            forceY = Math.max(-y_creature_vel * forceMultiplier, -maxForce);
                            curr_creature.energy -= move_energy_loss;
                            break;
                        case 1: // Move Down (absolute)
                            forceY = Math.min(y_creature_vel * forceMultiplier, maxForce);
                            curr_creature.energy -= move_energy_loss;
                            break;
                        case 2: // Move Left (absolute)
                            forceX = Math.max(-x_creature_vel * forceMultiplier, -maxForce);
                            curr_creature.energy -= move_energy_loss;
                            break;
                        case 3: // Move Right (absolute)
                            forceX = Math.min(x_creature_vel * forceMultiplier, maxForce);
                            curr_creature.energy -= move_energy_loss;
                            break;
                        case 4: // Rotate Body Left
                            Matter.Body.setAngularVelocity(curr_creature.body, -0.05);
                            curr_creature.energy -= move_energy_loss * 0.5;
                            break;
                        case 5: // Rotate Body Right
                            Matter.Body.setAngularVelocity(curr_creature.body, 0.05);
                            curr_creature.energy -= move_energy_loss * 0.5;
                            break;
                        case 6: // Move Forward (relative to body angle)
                            const angle = curr_creature.body.angle;
                            forceX = Math.cos(angle) * x_creature_vel * forceMultiplier * 2; // Stronger forward thrust
                            forceY = Math.sin(angle) * y_creature_vel * forceMultiplier * 2;
                            curr_creature.energy -= move_energy_loss;
                            break;
                        case 7: // Do Nothing
                            // Conserve energy
                            break;
                    }

                    Matter.Body.applyForce(curr_creature.body, curr_creature.body.position, {
                        x: forceX,
                        y: forceY
                    });

                    const maxVelocity = 3;
                    const velocity = curr_creature.body.velocity;
                    const speed = Matter.Vector.magnitude(velocity);
                    if (speed > maxVelocity) {
                        const limitedVelocity = Matter.Vector.mult(Matter.Vector.normalise(velocity), maxVelocity);
                        Matter.Body.setVelocity(curr_creature.body, limitedVelocity);
                    }

                if (curr_creature.energy <= 0 && !curr_creature.timeOfDeath) {
                    curr_creature.timeOfDeath = Date.now();
                    this.World.remove(this.engine.world, curr_creature.body);
                    this.World.remove(this.engine.world, curr_creature.leftArm);
                    this.World.remove(this.engine.world, curr_creature.rightArm);
                }
                } else {
                    // If the creature has no energy, ensure it stops moving.
                    Matter.Body.setVelocity(curr_creature.body, { x: 0, y: 0 });
                    Matter.Body.setAngularVelocity(curr_creature.body, 0);
                    Matter.Body.setAngularVelocity(curr_creature.leftArm, 0);
                    Matter.Body.setAngularVelocity(curr_creature.rightArm, 0);
                }
    
                // --- Soft Wall Implementation ---
                const boundaryPadding = 50; // How far from the edge the force starts
                const maxBoundaryForce = 0.005; // The max force applied at the very edge
                const pos = curr_creature.body.position;
                let boundaryForce = { x: 0, y: 0 };
    
                if (pos.x < boundaryPadding) {
                    boundaryForce.x = (1 - pos.x / boundaryPadding) * maxBoundaryForce;
                } else if (pos.x > this.canvas.width - boundaryPadding) {
                    boundaryForce.x = - (1 - (this.canvas.width - pos.x) / boundaryPadding) * maxBoundaryForce;
                }
    
                if (pos.y < boundaryPadding) {
                    boundaryForce.y = (1 - pos.y / boundaryPadding) * maxBoundaryForce;
                } else if (pos.y > this.canvas.height - boundaryPadding) {
                    boundaryForce.y = - (1 - (this.canvas.height - pos.y) / boundaryPadding) * maxBoundaryForce;
                }
    
                Matter.Body.applyForce(curr_creature.body, pos, boundaryForce);
                
                curr_creature.updateExplorationScore();

                // Apply water drag if the creature is in water
                if (curr_creature.isInWater) {
                    const dragCoefficient = curr_creature.isInDeepWater ? 0.05 : 0.02;
                    const velocity = curr_creature.body.velocity;
                    const speed = Matter.Vector.magnitude(velocity);

                    if (speed > 0) {
                        const dragForce = Matter.Vector.mult(Matter.Vector.normalise(velocity), -dragCoefficient * speed * speed);
                        Matter.Body.applyForce(curr_creature.body, curr_creature.body.position, dragForce);
                    }
                }
            }

            // Spatial Grid Update
            this.spatialGrid.clear();
            this.creatures.forEach(c => this.spatialGrid.insert(c.body));
            this.food_items.forEach(f => this.spatialGrid.insert(f.body));
            this.food_items_poisoned.forEach(p => this.spatialGrid.insert(p.body));
            if (this.lake) {
                this.lake.shallowWater.forEach(w => this.spatialGrid.insert(w));
                this.lake.deepWater.forEach(w => this.spatialGrid.insert(w));
            }

            // Handle drowning
            this.creatures.forEach(creature => {
                if (creature.isInWater) {
                    creature.handleDrowning();
                } else {
                    creature.timeInWater = 0; // Reset timer if not in water
                    if (creature.body.render.sprite.texture.endsWith('drowning.png')) {
                        creature.updateCreatureImage('alive');
                    }
                }
            });

            // Run the Matter.js engine update after all creature logic
            if (this.isRunning) {
                this.Engine.update(this.engine);
            }

            // Reset water flags for the next tick. Collisions will set them again if still in water.
            this.creatures.forEach(creature => {
                creature.isInWater = false;
            });

            this.averageScore = (totFoodEatenThisRound != 0 && this.NUM_CREATURES != 0) ?
                totFoodEatenThisRound / this.NUM_CREATURES : 0;
        }
        
        // Check if the generation timer has expired to start a new generation.
        // This is now checked in the main simulation loop.
        if (this.generationTimer <= 0 && this.isRunning) {
            this.resetWorld();
        }
    }

    updateTimers() {
        if (!this.isRunning) return;

        const now = performance.now();
        if (this.lastUpdateTime > 0) {
            const elapsedMilliseconds = now - this.lastUpdateTime;
            this.totalSimTime += elapsedMilliseconds / 1000;
            this.generationTimer -= elapsedMilliseconds / 1000;
        }
        this.lastUpdateTime = now;

        this._updateNetworkVisualization();
    }
}