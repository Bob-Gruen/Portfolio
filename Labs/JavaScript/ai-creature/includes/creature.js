class Creature 
{
	constructor(x, y, myBrain, Matter, engine, canvas, sightDistance, networkConfig) 
	{
		this.canvas = canvas;
		this.SIGHT_DISTANCE = sightDistance;
		this.NETWORK_CONFIG = networkConfig;
		
		// State
		this.energy = 100;
		this.thirst = 100;
		this.foodCount = 0;
		this.nearestObjects = []; // To store the nearest 3 objects
		this.visitedCells = new Set();
		this.explorationScore = 0;
		this.timeOfDeath = null;
		this.isInWater = false;
		this.timeInWater = 0;

		this.net = null;

		// Energy
		this.baseEnergyDepletionRate = .1
		this.baseThirstDepletionRate = .15
		this.energyInterval = null;

		// Highlighting
		this.highlight = false;     // Highlight this creature as 1st place or 2nd place
        this.highlight2 = false;    // Highlight this creature as 2nd place or 3rd place

		// -- Blue Box Body --> this.body = Bodies.rectangle(x, y, 20, 20, { render: { fillStyle: 'blue' }, isStatic: false });
		this.body = Matter.Bodies.rectangle(x, y, 20, 20, {
			render: {
				sprite: {
					texture: './images/creature-alive.png',
					xScale: 1,
					yScale: 1
				}
			},
			isStatic: false,
		});

		this.leftArm = Matter.Bodies.rectangle(x - 10, y, 5, 20, { render: { fillStyle: 'red' }, isStatic: false });
		this.rightArm = Matter.Bodies.rectangle(x + 10, y, 5, 20, { render: { fillStyle: 'red' }, isStatic: false });

		// Add all of the bodies to the world
		Matter.World.add(engine.world, [this.body, this.leftArm, this.rightArm]);

		// Create constraints to attach the arms to the body
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

		// Add the constraints to the world
		Matter.World.add(engine.world, [this.leftArmConstraint, this.rightArmConstraint]);

		// Create a neural network with the specified architecture
		if (myBrain) 
		{
			this.net = new brain.NeuralNetwork(this.NETWORK_CONFIG);
			this.net.fromJSON(myBrain); // Expects a JSON object, not an instance
		}
		else 
		{
			this.net = new brain.NeuralNetwork(this.NETWORK_CONFIG);
			this.net.initialize();
			this.heInitializeWeights();
		}

		// Start energy depletion
		this.energyInterval = setInterval(() => 
		{
			this.decrementEnergy(this.baseEnergyDepletionRate);
			this.decrementThirst(this.baseThirstDepletionRate);

			if (this.energy <= 0) {
				clearInterval(this.energyInterval); // Stop the timer when energy is gone
			} else if (this.body.render.sprite.texture.endsWith('drowning.png')) {
				// If it was drowning but now has energy, revert image
				this.updateCreatureImage('alive');
			}
		}, 250);
	}

	heInitializeWeights() {
        const randomGaussian = () => {
            let u = 0, v = 0;
            while (u === 0) u = Math.random(); //Converting [0,1) to (0,1)
            while (v === 0) v = Math.random();
            return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
        };

        const netJSON = this.net.toJSON();

        netJSON.layers.forEach((layer, layerIndex) => {
            if (layerIndex === 0) return; // Skip input layer

            // Correctly calculate fanIn using the 'sizes' array from the JSON.
            const fanIn = netJSON.sizes[layerIndex - 1];
            const stdDev = Math.sqrt(2 / fanIn);

            if (layer.weights) {
                for (let i = 0; i < layer.weights.length; i++) {
                    for (let j = 0; j < layer.weights[i].length; j++) {
                        layer.weights[i][j] = randomGaussian() * stdDev;
                    }
                    // Initialize biases to a small positive value to encourage activation
                    if (layer.biases) {
                        layer.biases[i] = 0.01;
                    }
                }
            }
        });

        this.net.fromJSON(netJSON);
    }

	updateExplorationScore()
	{
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
		// Start drowning immediately in deep water, more gradually in shallow
		const drowningThreshold = this.isInDeepWater ? 30 : 150; // ~0.5s in deep, ~2.5s in shallow
        if (this.timeInWater > drowningThreshold) {
            const damage = this.isInDeepWater ? 2 : 0.5; // More damage in deep water
            this.decrementEnergy(damage);
			this.updateCreatureImage('drowning');
        }
    }

	updateCreatureImage(imageName) 
	{
		this.body.render.sprite.texture = `./images/creature-${imageName}.png`;

		if (imageName === 'drowning') {
			this.body.render.sprite.xScale = 1.2;
			this.body.render.sprite.yScale = 1.2;
		}
	}

	drawInfoBox(ctx, shouldDraw) 
	{
		if (shouldDraw) 
		{
			const helmetWidth = 50;
			const helmetHeight = 35;
			const helmetOffset = 40;

			ctx.save();
			ctx.translate(this.body.position.x, this.body.position.y);
			ctx.rotate(this.body.angle);

			// Add a highlight to the info box
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

			// Draw creature food count on top of the box
			ctx.font = '20px Arial';
			ctx.fillStyle = 'white';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(this.foodCount.toString(), -6, -helmetOffset);

			/* WHEN THERE IS A HIGHLIGHT, THE ENERGY LEVEL BARS ARE NOT COLORED IN */
			const meterWidth = 12;
			const meterHeight = helmetHeight - 4;
			const meterX = helmetWidth / 2 - meterWidth - 2;
			const meterY = -helmetOffset - helmetHeight / 2 + 2;
			const totalBars = 4;
			const barHeight = meterHeight / totalBars;

			// Draw energy meter bars
			for (let i = 0; i < totalBars; i++) 
			{
				const barY = meterY + (totalBars - 1 - i) * barHeight;
				const energyPercentage = this.energy / 250; // Max energy is 250
				const barFillPercentage = Math.min(1, Math.max(0, (energyPercentage * totalBars) - (totalBars - 1 - i)));

				if (barFillPercentage > 0) 
				{
					ctx.fillStyle = this.energy > 125 ? 'green' : this.energy > 50 ? 'yellow' : 'red';
					ctx.fillRect(meterX, barY, meterWidth, barHeight * barFillPercentage);
				}
			}

			// Draw energy meter borders on top
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
			this.decrementEnergy(0.5); // Start taking damage if dehydrated
		}
	}

	incrementFoodCount(num) 
    {
		this.foodCount += num;
	}

	decrementFoodCount(num) {
		this.foodCount -= num;

		if (this.foodCount < 0)
			this.foodCount = 0;
	}

	// Function to get the neural network's inputs
	getNetworkInputs()
	{
		// This function implements the input system for the neural network.
		const inputs = [];
		for (let i = 0; i < 3; i++) {
			const nearest = this.nearestObjects[i];
			if (nearest) {
				const distance = Matter.Vector.magnitude(Matter.Vector.sub(nearest.position, this.body.position));
				inputs.push(distance / this.SIGHT_DISTANCE); // 1. Normalized distance

				// 2, 3, 4, 5. One-hot encoding for type
				inputs.push(nearest.label === 'food' ? 1 : 0);
				inputs.push(nearest.label === 'poison' ? 1 : 0);
				// Note: Creature bodies and arms are both considered 'creature' type for simplicity.
				const isCreature = nearest.label === 'creature' || nearest.label === 'creature_body' || nearest.label === 'creature_arm';
				inputs.push(isCreature ? 1 : 0);
				inputs.push(nearest.label.includes('water') ? 1 : 0);

				// 6. Relative angle
				const objAngle = Matter.Vector.angle(this.body.position, nearest.position);
				let relativeAngle = objAngle - this.body.angle;
				// Normalize angle to [-1, 1]
				while (relativeAngle > Math.PI) relativeAngle -= 2 * Math.PI;
				while (relativeAngle < -Math.PI) relativeAngle += 2 * Math.PI;
				inputs.push(relativeAngle / Math.PI);

				// 7. Relative Velocity
				const relativeVelocity = Matter.Vector.sub(nearest.velocity || { x: 0, y: 0 }, this.body.velocity);
				const maxVel = 5; // A reasonable maximum relative velocity
				inputs.push(Math.max(-1, Math.min(1, relativeVelocity.x / maxVel)));
				inputs.push(Math.max(-1, Math.min(1, relativeVelocity.y / maxVel)));

			} else {
				// If no object is in this sensor slot, push default "far away" values.
				// dist, food, poison, creature, water, relAngle, relVelX, relVelY
				inputs.push(1, 0, 0, 0, 0, 0, 0, 0);
			}
		}

		// Add self-awareness inputs
		// 25. Normalized Energy
		inputs.push(this.energy / 250); // Max energy is 250
		// 26. Normalized Speed
		const speed = Matter.Vector.magnitude(this.body.velocity);
		inputs.push(Math.min(speed / 3, 1)); // Max velocity is 3
		// 27. Normalized Thirst
		inputs.push(this.thirst / 100);
		// 28 & 29. Normalized Velocity Components
		inputs.push(this.body.velocity.x / 3); // Normalized x-velocity
		inputs.push(this.body.velocity.y / 3); // Normalized y-velocity

        return inputs;
	}

	// Function to get the neural network's output
	getNetworkOutput() 
	{
		const input = this.getNetworkInputs();

		let pred = 0;
		
		const output = this.net.run(input);
		const maxConfidence = Math.max(...output);

		// The action is simply the index of the output neuron with the highest activation.
		pred = output.indexOf(maxConfidence);
		
		return pred;
	}
}
