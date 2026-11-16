class Creature {
    constructor(x, y, myBrain, Matter, engine, canvas, sightDistance, networkConfig, hue = null) {
        this.canvas = canvas;
        this.SIGHT_DISTANCE = sightDistance;
        this.NETWORK_CONFIG = networkConfig || {
            inputSize: 28, // 7 rays * 3 channels + 2 food scent + 4 self + 1 bias = 28
            hiddenLayers: [14, 8],
            outputSize: 4,
            activation: 'leaky-relu',
            learningRate: 0.01,
            errorThresh: 0.001
        };

        // State
        this.energy = 80;
        this.thirst = 100;
        this.foodCount = 0;
        this.poisonCount = 0;

        this.visitedCells = new Set();
        this.explorationScore = 0;
        this.timeOfDeath = null;
        this.deathAlpha = 0.6;
        this._bodyRemoved = false;
        this.isInWater = false;
        this.isInDeepWater = false;
        this.timeInWater = 0;

        // Action tracking for passivity penalty & animation
        this.totalActions = 0;
        this.actionsTaken = [0, 0, 0, 0];
        this.isThrusting = false;
        this.eatFlash = 0;
        this.poisonFlash = 0;

        // Visual identity (woodland pastel hues: teal, mint, sky, lavender, amber)
        this.hue = hue !== null ? hue : Math.floor(Math.random() * 360);
        this.wingPhase = Math.random() * Math.PI * 2;

        this.net = null;
        this._fastLayers = null;
        this._fastBuffers = null;
        this._lastOutputs = [0, 0, 0, 0];

        // Energy - Tuned for selection pressure
        this.baseEnergyDepletionRate = 2.6;
        this.baseThirstDepletionRate = 0.5;
        this.metabolismTimer = 0;

        // Raycasting State (7 rays, 153° FOV)
        this.RAY_COUNT = 7;
        this.RAY_FOV = Math.PI * 0.85;
        this.rayResults = new Array(this.RAY_COUNT);
        for (let i = 0; i < this.RAY_COUNT; i++) {
            this.rayResults[i] = { distance: 1, type: null };
        }
        this._inputsBuffer = new Array(this.NETWORK_CONFIG.inputSize).fill(0);

        // Highlighting
        this.highlight = false;
        this.highlight2 = false;

        // Single circular physics body (no separate arm bodies/constraints for 3x better performance)
        this.body = Matter.Bodies.circle(x, y, 12, {
            label: 'creature_body',
            frictionAir: 0.08,
            restitution: 0.4,
            render: { visible: false },
            isStatic: false
        });
        this.body.rayRadius = 12;

        // Keep null references for backward compatibility
        this.leftArm = null;
        this.rightArm = null;
        this.leftArmConstraint = null;
        this.rightArmConstraint = null;

        Matter.World.add(engine.world, this.body);

        // Brain
        if (myBrain) {
            this.net = new brain.NeuralNetwork(this.NETWORK_CONFIG);
            this.net.fromJSON(myBrain);
        } else {
            this.net = new brain.NeuralNetwork(this.NETWORK_CONFIG);
            this.net.initialize();
            this.heInitializeWeights();
        }

        this.compileFastNet();
    }

    compileFastNet() {
        const netJSON = this.net.toJSON();
        this._fastLayers = [];
        this._fastBuffers = [];

        for (let l = 1; l < netJSON.layers.length; l++) {
            const layer = netJSON.layers[l];
            const numNeurons = layer.weights.length;
            const numInputs = layer.weights[0].length;
            const flatWeights = new Float64Array(numNeurons * numInputs);
            const biases = new Float64Array(numNeurons);

            for (let i = 0; i < numNeurons; i++) {
                biases[i] = layer.biases[i];
                const row = layer.weights[i];
                const offset = i * numInputs;
                for (let j = 0; j < numInputs; j++) {
                    flatWeights[offset + j] = row[j];
                }
            }

            this._fastLayers.push({
                numNeurons,
                numInputs,
                weights: flatWeights,
                biases
            });
            this._fastBuffers.push(new Float64Array(numNeurons));
        }
    }

    fastRun(inputs) {
        let current = inputs;
        const layers = this._fastLayers;
        const buffers = this._fastBuffers;
        const lastIdx = layers.length - 1;

        for (let l = 0; l <= lastIdx; l++) {
            const layer = layers[l];
            const out = buffers[l];
            const { numNeurons, numInputs, weights, biases } = layer;
            const isOutput = (l === lastIdx);

            for (let i = 0; i < numNeurons; i++) {
                let sum = biases[i];
                const offset = i * numInputs;
                for (let j = 0; j < numInputs; j++) {
                    sum += weights[offset + j] * current[j];
                }
                if (isOutput) {
                    // Sigmoid output for smooth [0, 1] control signals
                    out[i] = 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, sum))));
                } else {
                    // Leaky ReLU hidden activation
                    out[i] = sum > 0 ? sum : 0.01 * sum;
                }
            }
            current = out;
        }

        this._lastOutputs[0] = current[0];
        this._lastOutputs[1] = current[1];
        this._lastOutputs[2] = current[2];
        this._lastOutputs[3] = current[3];
        return this._lastOutputs;
    }

    updateMetabolism(dt) {
        if (this.energy <= 0) {
            if (this.deathAlpha > 0) {
                this.deathAlpha = Math.max(0, this.deathAlpha - dt * 0.0004);
            }
            return;
        }

        if (this.eatFlash > 0) this.eatFlash = Math.max(0, this.eatFlash - dt * 0.004);
        if (this.poisonFlash > 0) this.poisonFlash = Math.max(0, this.poisonFlash - dt * 0.004);

        this.metabolismTimer += dt;
        while (this.metabolismTimer >= 250) {
            this.decrementEnergy(this.baseEnergyDepletionRate);
            this.decrementThirst(this.baseThirstDepletionRate);
            this.metabolismTimer -= 250;
        }
    }

    heInitializeWeights() {
        const randomGaussian = () => {
            let u = 0, v = 0;
            while (u === 0) u = Math.random();
            while (v === 0) v = Math.random();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        };

        const netJSON = this.net.toJSON();

        netJSON.layers.forEach((layer, layerIndex) => {
            if (layerIndex === 0) return;

            const fanIn = netJSON.sizes[layerIndex - 1];
            const stdDev = Math.sqrt(2 / fanIn);

            if (layer.weights) {
                for (let i = 0; i < layer.weights.length; i++) {
                    for (let j = 0; j < layer.weights[i].length; j++) {
                        layer.weights[i][j] = randomGaussian() * stdDev;
                    }
                    if (layer.biases) {
                        layer.biases[i] = 0.01;
                    }
                }
            }
        });

        this.net.fromJSON(netJSON);
    }

    updateExplorationScore() {
        const gridSize = 10;
        const cellWidth = this.canvas.width / gridSize;
        const cellHeight = this.canvas.height / gridSize;
        const cellX = Math.floor(this.body.position.x / cellWidth);
        const cellY = Math.floor(this.body.position.y / cellHeight);

        const cellKey = (cellX << 8) ^ cellY;
        this.visitedCells.add(cellKey);
        this.explorationScore = this.visitedCells.size;
    }

    handleDrowning() {
        this.timeInWater++;
        const drowningThreshold = this.isInDeepWater ? 35 : 160;
        if (this.timeInWater > drowningThreshold) {
            const damage = this.isInDeepWater ? 1.8 : 0.4;
            this.decrementEnergy(damage);
        }
    }

    draw(ctx, timeSeconds, isVisualized) {
        const pos = this.body.position;
        const angle = this.body.angle;
        const isDead = this.energy <= 0;
        const isDrowning = !isDead && this.isInWater && this.timeInWater > (this.isInDeepWater ? 35 : 160);

        ctx.save();
        ctx.translate(pos.x, pos.y);

        // Soft ground shadow
        if (!isDead) {
            ctx.beginPath();
            ctx.ellipse(2, 5, 13, 9, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(15, 35, 20, 0.25)';
            ctx.fill();
        }

        ctx.rotate(angle);

        if (isDead) {
            if (this.deathAlpha <= 0) {
                ctx.restore();
                return;
            }
            // Gentle fading sleeping spirit that disappears over time
            ctx.globalAlpha = this.deathAlpha;
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.fillStyle = '#B0BEC5';
            ctx.fill();
            ctx.strokeStyle = '#607D8B';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Closed sleeping eyes (X_X or -_-)
            ctx.strokeStyle = '#37474F';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(2, -5); ctx.lineTo(5, -3);
            ctx.moveTo(2, 5); ctx.lineTo(5, 3);
            ctx.stroke();
            ctx.restore();
            return;
        }

        // Eat / Poison / Drowning aura
        if (this.eatFlash > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, 16 + (1 - this.eatFlash) * 8, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 215, 64, ${this.eatFlash * 0.9})`;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        } else if (this.poisonFlash > 0) {
            ctx.beginPath();
            ctx.arc(0, 0, 16 + (1 - this.poisonFlash) * 8, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(224, 64, 251, ${this.poisonFlash * 0.9})`;
            ctx.lineWidth = 2.5;
            ctx.stroke();
        } else if (isDrowning) {
            ctx.beginPath();
            ctx.arc(0, 0, 17 + Math.sin(timeSeconds * 10) * 2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(128, 222, 234, 0.75)';
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Fluttering Fairy Wings
        const flapSpeed = this.isThrusting ? 22 : 9;
        const flap = Math.sin(timeSeconds * flapSpeed + this.wingPhase) * 0.45;
        ctx.fillStyle = 'rgba(235, 252, 255, 0.65)';
        ctx.strokeStyle = 'rgba(178, 235, 242, 0.85)';
        ctx.lineWidth = 1;

        // Left wing
        ctx.save();
        ctx.translate(-3, -8);
        ctx.rotate(-0.5 + flap);
        ctx.beginPath();
        ctx.ellipse(0, -6, 4.5, 8, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Right wing
        ctx.save();
        ctx.translate(-3, 8);
        ctx.rotate(0.5 - flap);
        ctx.beginPath();
        ctx.ellipse(0, 6, 4.5, 8, 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Cute Woodland Sprite Body (facing +X)
        const bodyColor = isDrowning
            ? 'hsl(200, 70%, 60%)'
            : `hsl(${this.hue}, 72%, 62%)`;
        const borderColor = isDrowning
            ? '#0277BD'
            : `hsl(${this.hue}, 65%, 35%)`;

        // Pointed fairy-fox ears
        ctx.fillStyle = bodyColor;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.4;

        ctx.beginPath();
        ctx.moveTo(-2, -9);
        ctx.lineTo(-9, -15);
        ctx.lineTo(3, -10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-2, 9);
        ctx.lineTo(-9, 15);
        ctx.lineTo(3, 10);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Main rounded body
        ctx.beginPath();
        ctx.ellipse(0, 0, 12.5, 10.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = bodyColor;
        ctx.fill();
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // Soft belly/cheek highlight
        ctx.beginPath();
        ctx.ellipse(2, 0, 7, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.fill();

        // Expressive eyes looking forward (+X)
        ctx.fillStyle = '#1A237E';
        ctx.beginPath();
        ctx.arc(6.5, -4, 2.3, 0, Math.PI * 2);
        ctx.arc(6.5, 4, 2.3, 0, Math.PI * 2);
        ctx.fill();

        // Eye catchlights
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(7.3, -4.6, 0.9, 0, Math.PI * 2);
        ctx.arc(7.3, 3.4, 0.9, 0, Math.PI * 2);
        ctx.fill();

        // Golden halo/crown for top leader or visualized creature
        if (this.highlight || isVisualized) {
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.strokeStyle = isVisualized ? '#FFD54F' : 'rgba(255, 213, 79, 0.65)';
            ctx.lineWidth = isVisualized ? 2.5 : 1.5;
            if (isVisualized) ctx.setLineDash([4, 4]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.restore();
    }

    drawInfoBox(ctx, shouldDraw) {
        if (!shouldDraw) return;
        const helmetWidth = 52;
        const helmetHeight = 28;
        const helmetOffset = 30;

        ctx.save();
        ctx.translate(this.body.position.x, this.body.position.y);

        // Storybook parchment tag above creature (unrotated for readability!)
        ctx.beginPath();
        ctx.roundRect(-helmetWidth / 2, -helmetOffset - helmetHeight / 2, helmetWidth, helmetHeight, 6);
        ctx.fillStyle = 'rgba(24, 38, 28, 0.82)';
        ctx.fill();

        let strokeStyle = 'rgba(255, 235, 179, 0.7)';
        let lineWidth = 1.2;
        if (this.highlight) {
            strokeStyle = '#FFD54F';
            lineWidth = 2.5;
        } else if (this.highlight2) {
            strokeStyle = '#81D4FA';
            lineWidth = 2;
        }
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.stroke();

        ctx.font = 'bold 14px Georgia, serif';
        ctx.fillStyle = '#FFF8E1';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.foodCount.toString(), -8, -helmetOffset);

        const meterWidth = 10;
        const meterHeight = helmetHeight - 6;
        const meterX = helmetWidth / 2 - meterWidth - 4;
        const meterY = -helmetOffset - helmetHeight / 2 + 3;
        const totalBars = 4;
        const barHeight = meterHeight / totalBars;

        for (let i = 0; i < totalBars; i++) {
            const barY = meterY + (totalBars - 1 - i) * barHeight;
            const energyPercentage = this.energy / 250;
            const barFillPercentage = Math.min(1, Math.max(0, (energyPercentage * totalBars) - (totalBars - 1 - i)));

            if (barFillPercentage > 0) {
                ctx.fillStyle = this.energy > 125 ? '#66BB6A' : this.energy > 50 ? '#FFCA28' : '#EF5350';
                ctx.fillRect(meterX, barY, meterWidth, barHeight * barFillPercentage);
            }
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.lineWidth = 0.8;
            ctx.strokeRect(meterX, barY, meterWidth, barHeight);
        }

        ctx.restore();
    }

    incrementEnergy(num) {
        this.energy += num;
        if (this.energy > 250) this.energy = 250;
        if (num > 0) this.eatFlash = 1;
        else if (num < 0) this.poisonFlash = 1;
    }

    drink(amount) {
        this.thirst += amount;
        if (this.thirst > 100) this.thirst = 100;
    }

    decrementEnergy(num) {
        this.energy -= num;
        if (this.energy <= 0) {
            this.energy = 0;
            if (!this.timeOfDeath) {
                this.timeOfDeath = Date.now();
            }
        }
    }

    decrementThirst(num) {
        this.thirst -= num;
        if (this.thirst <= 0) {
            this.thirst = 0;
            this.decrementEnergy(0.5);
        }
    }

    incrementFoodCount(num) {
        this.foodCount += num;
    }

    incrementPoisonCount(num) {
        this.poisonCount += num;
    }

    decrementFoodCount(num) {
        this.foodCount -= num;
        if (this.foodCount < 0) this.foodCount = 0;
    }

    // Fast analytical raycasting (15x faster than Matter.Query.ray)
    castRays(nearbyObjects) {
        const startX = this.body.position.x;
        const startY = this.body.position.y;
        const baseAngle = this.body.angle;
        const angleStep = this.RAY_FOV / (this.RAY_COUNT - 1);
        const startAngle = baseAngle - (this.RAY_FOV * 0.5);
        const sightDist = this.SIGHT_DISTANCE;
        const w = this.canvas.width;
        const h = this.canvas.height;
        const selfBody = this.body;

        for (let i = 0; i < this.RAY_COUNT; i++) {
            const angle = startAngle + (i * angleStep);
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);

            let closestDist = sightDist;
            let closestType = null;

            // 1. Check 4 canvas walls analytically
            if (dx < -1e-6) {
                const t = -startX / dx;
                if (t > 0 && t < closestDist) { closestDist = t; closestType = 'wall'; }
            } else if (dx > 1e-6) {
                const t = (w - startX) / dx;
                if (t > 0 && t < closestDist) { closestDist = t; closestType = 'wall'; }
            }
            if (dy < -1e-6) {
                const t = -startY / dy;
                if (t > 0 && t < closestDist) { closestDist = t; closestType = 'wall'; }
            } else if (dy > 1e-6) {
                const t = (h - startY) / dy;
                if (t > 0 && t < closestDist) { closestDist = t; closestType = 'wall'; }
            }

            // 2. Check nearby circles (food, poison, creatures, water)
            for (let k = 0; k < nearbyObjects.length; k++) {
                const obj = nearbyObjects[k];
                if (obj === selfBody) continue;

                const ox = obj.position.x - startX;
                const oy = obj.position.y - startY;
                const r = (obj.label === 'food' || obj.label === 'poison') ? 16 : (obj.rayRadius || 10);

                // If we're already inside shallow_water, don't let it occlude food
                if (obj.label === 'shallow_water' && (ox * ox + oy * oy) < r * r) {
                    continue;
                }

                // Project center onto ray
                const proj = ox * dx + oy * dy;
                if (proj < 0 || proj - r > closestDist) continue;

                const perpSq = (ox * ox + oy * oy) - (proj * proj);
                const rSq = r * r;
                if (perpSq <= rSq) {
                    const hitDist = proj - Math.sqrt(rSq - perpSq);
                    if (hitDist > 0 && hitDist < closestDist) {
                        closestDist = hitDist;
                        closestType = obj.label;
                    }
                }
            }

            this.rayResults[i].distance = closestDist / sightDist;
            this.rayResults[i].type = closestType;
        }
    }

    getNetworkInputs(nearbyObjects = []) {
        this.castRays(nearbyObjects);
        const inputs = this._inputsBuffer;
        let idx = 0;

        // 1. Gated ray inputs (closeness * object type) so 0 = nothing, 1 = touching
        for (let i = 0; i < this.RAY_COUNT; i++) {
            const ray = this.rayResults[i];
            const closeness = ray.type ? (1 - ray.distance) : 0;
            const type = ray.type;
            inputs[idx++] = type === 'food' ? closeness : 0;
            inputs[idx++] = type === 'poison' ? closeness : 0;
            inputs[idx++] = (type === 'wall' || type === 'deep_water') ? closeness : 0;
        }

        // 2. Nearest Sunberry "scent" (relative angle sin/cos weighted by proximity)
        const startX = this.body.position.x;
        const startY = this.body.position.y;
        let nearestFoodDistSq = this.SIGHT_DISTANCE * this.SIGHT_DISTANCE;
        let nearestFoodDx = 0;
        let nearestFoodDy = 0;
        let foundFood = false;

        for (let k = 0; k < nearbyObjects.length; k++) {
            const obj = nearbyObjects[k];
            if (obj.label !== 'food') continue;
            const dx = obj.position.x - startX;
            const dy = obj.position.y - startY;
            const dSq = dx * dx + dy * dy;
            if (dSq < nearestFoodDistSq) {
                nearestFoodDistSq = dSq;
                nearestFoodDx = dx;
                nearestFoodDy = dy;
                foundFood = true;
            }
        }

        if (foundFood) {
            const dist = Math.sqrt(nearestFoodDistSq);
            const relAngle = Math.atan2(nearestFoodDy, nearestFoodDx) - this.body.angle;
            const scentStrength = 1 - (dist / this.SIGHT_DISTANCE);
            inputs[idx++] = Math.sin(relAngle) * scentStrength; // + = food to right, - = food to left
            inputs[idx++] = Math.cos(relAngle) * scentStrength; // + = food ahead, - = food behind
        } else {
            inputs[idx++] = 0;
            inputs[idx++] = 0;
        }

        // 3. Self-awareness inputs
        inputs[idx++] = this.energy / 250;
        inputs[idx++] = this.thirst / 100;
        const vel = this.body.velocity;
        const speed = Math.hypot(vel.x, vel.y);
        inputs[idx++] = Math.min(speed / 3.2, 1);
        inputs[idx++] = this.isInWater ? 1 : 0;
        inputs[idx++] = 1; // Bias

        return inputs;
    }

    getNetworkOutputs(inputs) {
        if (inputs === undefined) {
            inputs = this.getNetworkInputs([]);
        }
        return this.fastRun(inputs);
    }

    getNetworkOutput(inputs) {
        const output = this.getNetworkOutputs(inputs);
        let bestIdx = 0;
        let bestVal = output[0];
        for (let i = 1; i < output.length; i++) {
            if (output[i] > bestVal) {
                bestVal = output[i];
                bestIdx = i;
            }
        }
        return bestIdx;
    }
}
