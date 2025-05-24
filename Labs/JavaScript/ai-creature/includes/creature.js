class Creature 
{
	constructor(x, y, myBrain)  
	{
		this.foodCount = 0;
		this.energy = 125;
		this.baseEnergyDepletionRate = .1
		this.energyInterval = null;
		this.highlight = false;     // Highlight this creature as 1st place or 2nd place
        this.highlight2 = false;    // Highlight this creature as 2nd place or 3rd place
		this.nearestObjectType = '';
		this.nearestObjectXPos = 0;
		this.nearestObjectYPos = 0;
		this.visitedCells = new Set();
		this.explorationScore = 0;

		this.net = null;

		// -- Blue Box Body --> this.body = Bodies.rectangle(x, y, 20, 20, { render: { fillStyle: 'blue' }, isStatic: false });
		this.body = Bodies.rectangle(x, y, 20, 20, {
			render: {
				sprite: {
					texture: './images/creature-alive.png',
					xScale: 1,
					yScale: 1
				}
			},
			isStatic: false,
		});

		this.leftArm = Bodies.rectangle(x - 10, y, 5, 20, { render: { fillStyle: 'red' }, isStatic: false });
		this.rightArm = Bodies.rectangle(x + 10, y, 5, 20, { render: { fillStyle: 'red' }, isStatic: false });

		// Add all of the bodies to the world
		World.add(engine.world, [this.body, this.leftArm, this.rightArm]);

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
		World.add(engine.world, [this.leftArmConstraint, this.rightArmConstraint]);

		// Create a neural network with the specified architecture
		let whichBrainUsed = '';

		if (myBrain == '') 
		{
			this.net = new brain.NeuralNetwork();
			this.net.fromJSON(myBrain);

			whichBrainUsed = 'Combined';			
		}
		else 
		{
			this.net = new brain.NeuralNetwork({
				inputSize: 12, // Updated inputSize
                hiddenLayers: [128, 64, 32, 24, 16, 8, 8],
				outputSize: 8,
				activation: 'leaky-relu',
				learningRate: 0.01 + Math.random() * 0.009, // Random learning rate between 0.01 and 0.1
				errorThresh: 0.001 });

			this.net.initialize();

			whichBrainUsed = 'New';
		}

		// Start energy depletion
		this.energyInterval = setInterval(() => 
		{
			this.energy = Math.max(0, this.energy - this.baseEnergyDepletionRate);

			if(this.energy <= 0) 
				this.energy = 0;

			if(this.energy === 0)
			{
				// Handle creature death or reset
				this.updateCreatureImage('dead');

				// Remove the creatures energy depletion timer
				clearInterval(this.energyInterval);
			}
		}, 250);
	}

	updateExplorationScore()
	{
		const gridSize = 10;
		const cellWidth = canvas.width / gridSize;
		const cellHeight = canvas.height / gridSize;
		const cellX = Math.floor(this.body.position.x / cellWidth);
		const cellY = Math.floor(this.body.position.y / cellHeight);

		const cellKey = `${cellX},${cellY}`;
		this.visitedCells.add(cellKey);

		this.explorationScore = this.visitedCells.size;
	}


	updateCreatureImage(imageName) 
	{
		this.body.render.sprite.texture = `./images/creature-${imageName}.png`;
	}

	// Add this method to the Creature class
	updateCreatures()
	{
		let sortedCreatures = creatures.slice().sort((a, b) => b.foodCount - a.foodCount);

		// Set highlight to false for all creatures and check for dead creatures (energy <= 0)
		creatures.forEach(c => {
			c.highlight = false;
            c.highlight2 = false;

			if(c.energy <= 0){
				// Handle creature death or reset
                c.updateCreatureImage('dead');				
			}
		});

        if (sortedCreatures.length > 0) {
            sortedCreatures[0].highlight = true;
        }
        if (sortedCreatures.length > 1) {
            sortedCreatures[1].highlight = true;
        }
        if (sortedCreatures.length > 0) {
            sortedCreatures[2].highlight2 = true;
        }
        if (sortedCreatures.length > 1) {
            sortedCreatures[3].highlight2 = true;
        }

		creatures.forEach(creature => creature.drawInfoBox(ctx));
	}

	drawInfoBox(ctx) 
	{
		if (drawInfoBox) 
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
            
            if (this.highlight) {
                ctx.strokeStyle = 'gold';
                ctx.lineWidth = 3;
            } else if (this.highlight2) {
                ctx.strokeStyle = 'blue';
                ctx.lineWidth = 3;
            } else {
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1;
            }
            
            ctx.stroke();

			// Draw creature food count
			ctx.font = '20px Arial';
			ctx.fillStyle = 'white';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(this.foodCount.toString(), -6, -helmetOffset);

			/* WHEN THERE IS A HIGHLIGHT, THE ENERGY LEVEL BARS ARE NOT COLORED IN */

			// Draw energy meter
			const meterWidth = 12;
			const meterHeight = helmetHeight - 4;
			const meterX = helmetWidth / 2 - meterWidth - 2;
			const meterY = -helmetOffset - helmetHeight / 2 + 2;
			const totalBars = 4;
			const barHeight = meterHeight / totalBars;

			for (let i = 0; i < totalBars; i++) 
			{
				const barY = meterY + (totalBars - 1 - i) * barHeight;
				const energyPercentage = this.energy / 100;
				const barFillPercentage = Math.min(1, Math.max(0, (energyPercentage * totalBars) - (totalBars - 1 - i)));

				if (barFillPercentage > 0) 
				{
					if (this.energy > 50) 
					{
						ctx.fillStyle = 'green';
					} 
					else if (this.energy > 20) 
					{
						ctx.fillStyle = 'yellow';
					} 
					else
					{
						ctx.fillStyle = 'red';
					}

					ctx.fillRect(meterX, barY, meterWidth, barHeight * barFillPercentage);
				}

				ctx.strokeStyle = 'white';
				ctx.strokeRect(meterX, barY, meterWidth, barHeight);
			}

			ctx.restore();
		}
	}

	incrementEnergy(num) {
		this.energy += num;

		if(this.energy >= 250)
			this.energy = 250;

		this.updateCreatures();
	}

	decrementEnergy(num) {

		this.energy -= num;

		if (this.energy <= 0)
		{
			this.energy = 0;
			this.updateCreatureImage('dead');
		}

		this.updateCreatures();
	}

	incrementFoodCount(num) 
    {
		this.foodCount += num;
		this.energy += 10;

		if(this.foodCount > bestScoreRound)
		{
			bestScoreRound = this.foodCount;
			this.highlight = true;
		}

		if (this.foodCount > bestScoreEver) {
			bestScoreEver = this.foodCount;
		}
		else
			this.highlight = false;

		this.updateCreatures();
	}

	decrementFoodCount(num) {
		this.foodCount -= num;

		if (this.foodCount < 0)
			this.foodCount = 0;

		this.updateCreatures();
	}

	// normalizeInputs now takes creature's current position for relative calculations
	// and nearestObjectType as a string for one-hot encoding.
	normalizeInputs(creatureX, creatureY, energy, foodCount, leftArmAngle, rightArmAngle, nearestObjectType, objectX, objectY)
	{
		// One-hot encoding for nearestObjectType
		const isFood = nearestObjectType === 'food' ? 1 : 0;
		const isPoison = nearestObjectType === 'poison' ? 1 : 0;
		const isRobotBody = nearestObjectType === 'robot_body' ? 1 : 0;
		const isRobotArm = nearestObjectType === 'robot_arm' ? 1 : 0;

		// Calculate relative positions
		const relativeX = objectX - creatureX;
		const relativeY = objectY - creatureY;

		// Normalize relative positions
		// SIGHT_DISTANCE is defined in sketch.js (usually 200).
		// Ensure it's accessible here or pass it. Using a default if not defined.
		const sightDistance = typeof SIGHT_DISTANCE !== 'undefined' ? SIGHT_DISTANCE : 200; 
		const normalizedRelativeX = relativeX / sightDistance;
		const normalizedRelativeY = relativeY / sightDistance;

		return [
			creatureX / canvas.width, // creature's own X position normalized
			creatureY / canvas.height, // creature's own Y position normalized
			energy / 100,  // Assuming max energy is 100
			foodCount / 10,  // Normalize based on expected max food count
			(leftArmAngle + Math.PI) / (2 * Math.PI), // Normalize angle to 0-1 range
			(rightArmAngle + Math.PI) / (2 * Math.PI), // Normalize angle to 0-1 range
			isFood,
			isPoison,
			isRobotBody,
			isRobotArm,
			normalizedRelativeX,
			normalizedRelativeY
		];
	}
	
	// Function to get the neural network's output
	// Parameters currentCreatureX and currentCreatureY are the creature's current x and y, needed for normalizeInputs
	getNetworkOutput(canvas, currentCreatureX, currentCreatureY, nearestObjectType, nearestObjectXPos, nearestObjectYPos, energy, foodCnt) 
	{
		// nearestObjectType (string) is passed directly to normalizeInputs for one-hot encoding.
		// The old nearestObjectTypeNum logic is removed.

		// Calculate leftArmAngle and rightArmAngle
		const leftArmAngle = Matter.Vector.angle(this.body.position, this.leftArm.position);
		const rightArmAngle = Matter.Vector.angle(this.body.position, this.rightArm.position);

		// Call normalizeInputs with the creature's current position
		let input = this.normalizeInputs(
			currentCreatureX, // creature's current X
			currentCreatureY, // creature's current Y
			energy,
			foodCnt,
			leftArmAngle,
			rightArmAngle,
			nearestObjectType, // Pass the string type directly
			nearestObjectXPos,
			nearestObjectYPos
		);

		let pred = 0;

		pred = this.net.run(input); // Always use the network output
		    
		// const actionIndex = pred.indexOf(Math.max(...pred));
		// console.log(`Creature chose action ${actionIndex} with confidence ${pred[actionIndex]}%`);

		return pred;
	}
}
