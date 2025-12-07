class Creature {
    constructor(x, y, myBrain, Matter, engine, canvas, sightDistance, networkConfig) {
        this.canvas = canvas;
        this.SIGHT_DISTANCE = sightDistance;
        this.NETWORK_CONFIG = networkConfig;

        // State
        this.energy = 50;
        this.thirst = 100;
        this.foodCount = 0;

        this.visitedCells = new Set();
        this.explorationScore = 0;
        this.timeOfDeath = null;
        this.isInWater = false;
        this.timeInWater = 0;

        // Action tracking for passivity penalty
        this.totalActions = 0;
        this.actionsTaken = [0, 0, 0, 0]; // 4 actions now

        this.net = null;

        // Energy - Tuned for selection pressure
        this.baseEnergyDepletionRate = 3.0; // Forces eating every ~20s
        this.baseThirstDepletionRate = 0.5;
        this.energyInterval = null;

        // Raycasting State
        this.rayResults = [];
        this.RAY_COUNT = 5;
        this.RAY_FOV = Math.PI / 2;

        // Highlighting
        this.highlight = false;
        this.highlight2 = false;

        // Body
        this.body = Matter.Bodies.rectangle(x, y, 20, 20, {
            label: 'creature_body',
            render: {
                sprite: {
                    texture: './images/creature-alive.png',
                    xScale: 1,
                    yScale: 1
                }
            },
            isStatic: false,
        });

        // Arms
        this.leftArm = Matter.Bodies.rectangle(x - 10, y, 5, 20, {
            label: 'creature_arm',
            render: { fillStyle: 'red' },
            isStatic: false
        });
        this.rightArm = Matter.Bodies.rectangle(x + 10, y, 5, 20, {
            label: 'creature_arm',
            render: { fillStyle: 'red' },
            isStatic: false
        });

        // Add to world
        Matter.World.add(engine.world, [this.body, this.leftArm, this.rightArm]);

        // Constraints
        this.leftArmConstraint = Matter.Constraint.create({
            bodyA: this.body,
            pointA: { x: -20, y: 0 },
            bodyB: this.leftArm,
            pointB: { x: 0, y: -10 },
            stiffness: 1,
            length: 0,
        });

        this.rightArmConstraint = Matter.Constraint.create({
            bodyA: this.body,
            pointA: { x: 20, y: 0 },
            bodyB: this.rightArm,
            pointB: { x: 0, y: -10 },
            stiffness: 1,
            length: 0
        });

        Matter.World.add(engine.world, [this.leftArmConstraint, this.rightArmConstraint]);

        // Brain
        if (myBrain) {
            this.net = new brain.NeuralNetwork(this.NETWORK_CONFIG);
            this.net.fromJSON(myBrain);
        }
        else {
            this.net = new brain.NeuralNetwork(this.NETWORK_CONFIG);
            this.net.initialize();
            this.heInitializeWeights();
        }

        // Start metabolism
        this.metabolismTimer = 0;
    }

    updateMetabolism(dt) {
        if (this.energy <= 0) return;

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

        const cellKey = `${cellX},${cellY}`;
        this.visitedCells.add(cellKey);

        this.explorationScore = this.visitedCells.size;
    }

    handleDrowning() {
        this.timeInWater++;
        const drowningThreshold = this.isInDeepWater ? 30 : 150;
        if (this.timeInWater > drowningThreshold) {
            const damage = this.isInDeepWater ? 2 : 0.5;
            this.decrementEnergy(damage);
            this.updateCreatureImage('drowning');
        }
    }

    updateCreatureImage(imageName) {
        this.body.render.sprite.texture = `./images/creature-${imageName}.png`;

        if (imageName === 'drowning') {
            this.body.render.sprite.xScale = 1.2;
            this.body.render.sprite.yScale = 1.2;
        }
    }

    drawInfoBox(ctx, shouldDraw) {
        if (shouldDraw) {
            const helmetWidth = 50;
            const helmetHeight = 35;
            const helmetOffset = 40;

            ctx.save();
            ctx.translate(this.body.position.x, this.body.position.y);
            ctx.rotate(this.body.angle);

            ctx.beginPath();
            ctx.rect(-helmetWidth / 2, -helmetOffset - helmetHeight / 2, helmetWidth, helmetHeight);
            ctx.fillStyle = 'rgba(150, 150, 150, 1)';
            ctx.fill();

            let strokeStyle = 'white';
            let lineWidth = 1;
            if (this.highlight) {
                strokeStyle = 'gold';
                lineWidth = 3;
            } else if (this.highlight2) {
                strokeStyle = 'blue';
                lineWidth = 3;
            }
            ctx.strokeStyle = strokeStyle;
            ctx.lineWidth = lineWidth;
            ctx.stroke();

            ctx.font = '20px Arial';
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.foodCount.toString(), -6, -helmetOffset);

            const meterWidth = 12;
            const meterHeight = helmetHeight - 4;
            const meterX = helmetWidth / 2 - meterWidth - 2;
            const meterY = -helmetOffset - helmetHeight / 2 + 2;
            const totalBars = 4;
            const barHeight = meterHeight / totalBars;

            for (let i = 0; i < totalBars; i++) {
                const barY = meterY + (totalBars - 1 - i) * barHeight;
                const energyPercentage = this.energy / 250;
                const barFillPercentage = Math.min(1, Math.max(0, (energyPercentage * totalBars) - (totalBars - 1 - i)));

                if (barFillPercentage > 0) {
                    ctx.fillStyle = this.energy > 125 ? 'green' : this.energy > 50 ? 'yellow' : 'red';
                    ctx.fillRect(meterX, barY, meterWidth, barHeight * barFillPercentage);
                }
            }

            for (let i = 0; i < totalBars; i++) {
                const barY = meterY + (totalBars - 1 - i) * barHeight;
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1;
                ctx.strokeRect(meterX, barY, meterWidth, barHeight);
            }

            ctx.restore();
        }
    }

    incrementEnergy(num) {
        this.energy += num;
        if (this.energy > 250) this.energy = 250;
    }

    drink(amount) {
        this.thirst += amount;
        if (this.thirst > 100) this.thirst = 100;
    }

    decrementEnergy(num) {
        this.energy -= num;
        if (this.energy <= 0) {
            this.energy = 0;
            this.timeOfDeath = Date.now();
            this.updateCreatureImage('dead');
        }
    }

    decrementThirst(num) {
        this.thirst -= num;
        if (this.thirst <= 0) {
            this.decrementEnergy(0.5);
        }
    }

    incrementFoodCount(num) {
        this.foodCount += num;
    }

    decrementFoodCount(num) {
        this.foodCount -= num;
        if (this.foodCount < 0) this.foodCount = 0;
    }

    castRays(nearbyObjects) {
        this.rayResults = [];
        const startPoint = this.body.position;
        const baseAngle = this.body.angle;
        const angleStep = this.RAY_FOV / (this.RAY_COUNT - 1);
        const startAngle = baseAngle - (this.RAY_FOV / 2);

        const walls = [
            { p1: { x: 0, y: 0 }, p2: { x: this.canvas.width, y: 0 }, label: 'wall' },
            { p1: { x: 0, y: this.canvas.height }, p2: { x: this.canvas.width, y: this.canvas.height }, label: 'wall' },
            { p1: { x: 0, y: 0 }, p2: { x: 0, y: this.canvas.height }, label: 'wall' },
            { p1: { x: this.canvas.width, y: 0 }, p2: { x: this.canvas.width, y: this.canvas.height }, label: 'wall' }
        ];

        for (let i = 0; i < this.RAY_COUNT; i++) {
            const angle = startAngle + (i * angleStep);
            const rayDir = { x: Math.cos(angle), y: Math.sin(angle) };
            const endPoint = {
                x: startPoint.x + rayDir.x * this.SIGHT_DISTANCE,
                y: startPoint.y + rayDir.y * this.SIGHT_DISTANCE
            };

            let closestDist = this.SIGHT_DISTANCE;
            let closestType = null;

            const candidates = nearbyObjects.filter(o =>
                o !== this.body && o !== this.leftArm && o !== this.rightArm
            );

            const collisions = Matter.Query.ray(candidates, startPoint, endPoint);

            for (const collision of collisions) {
                const d = Matter.Vector.magnitude(Matter.Vector.sub(collision.bodyA.position, startPoint));
                if (d < closestDist) {
                    closestDist = d;
                    closestType = collision.bodyA.label;
                }
            }

            for (const wall of walls) {
                const intersection = this.getLineIntersection(startPoint, endPoint, wall.p1, wall.p2);
                if (intersection) {
                    const d = Math.hypot(intersection.x - startPoint.x, intersection.y - startPoint.y);
                    if (d < closestDist) {
                        closestDist = d;
                        closestType = 'wall';
                    }
                }
            }

            this.rayResults.push({
                distance: closestDist / this.SIGHT_DISTANCE,
                type: closestType
            });
        }
    }

    getLineIntersection(p1, p2, p3, p4) {
        const x1 = p1.x, y1 = p1.y, x2 = p2.x, y2 = p2.y;
        const x3 = p3.x, y3 = p3.y, x4 = p4.x, y4 = p4.y;

        const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
        if (denom === 0) return null;

        const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
        const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

        if (ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1) {
            return {
                x: x1 + ua * (x2 - x1),
                y: y1 + ua * (y2 - y1)
            };
        }
        return null;
    }

    getNetworkInputs(nearbyObjects = []) {
        this.castRays(nearbyObjects);
        const inputs = [];

        for (const ray of this.rayResults) {
            inputs.push(1 - ray.distance);
            inputs.push(ray.type === 'food' ? 1 : 0);
            inputs.push(ray.type === 'poison' ? 1 : 0);
            inputs.push((ray.type === 'wall' || ray.type === 'soft_wall') ? 1 : 0);
            inputs.push((ray.type === 'creature' || ray.type === 'creature_body' || ray.type === 'creature_arm') ? 1 : 0);
        }

        inputs.push(this.energy / 250);
        inputs.push(this.thirst / 100);

        const speed = Matter.Vector.magnitude(this.body.velocity);
        inputs.push(Math.min(speed / 3, 1));
        inputs.push(this.body.angularVelocity);

        inputs.push(1); // Bias

        return inputs;
    }

    getNetworkOutput(inputs) {
        // inputs should be passed from simulation loop to avoid re-casting rays
        if (inputs === undefined) {
            inputs = this.getNetworkInputs([]);
        }

        let pred = 0;

        const output = this.net.run(inputs);
        const maxConfidence = Math.max(...output);

        // The action is simply the index of the output neuron with the highest activation.
        pred = output.indexOf(maxConfidence);

        return pred;
    }
}
