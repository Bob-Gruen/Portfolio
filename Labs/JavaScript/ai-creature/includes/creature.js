class Creature 
{
	constructor(x, y, myBrain)  
	{
		this.foodCount = 0;
		this.energy = 125;
		this.baseEnergyDepletionRate = .1
		this.energyInterval = null;
		this.highlight = true;
		this.nearestObjectType = '';
		this.nearestObjectXPos = 0;
		this.nearestObjectYPos = 0;
		this.visitedCells = new Set();

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
				inputSize: 7,
				hiddenLayers: [24, 18, 12],
				outputSize: 8,
				activation: 'leaky-relu',
				learningRate: 0.25,
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
			ctx.strokeStyle = this.highlight ? 'gold' : 'white';
			ctx.lineWidth = this.highlight ? 3 : 1;
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

	incrementFoodCount(num) {
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

	normalizeInputs(x, y, energy, foodCount, leftArmAngle, rightArmAngle, nearestFoodDistance) {
		return [
			x / canvas.width,
			y / canvas.height,
			energy / 100,  // Assuming max energy is 100
			foodCount / 10,  // Normalize based on expected max
			(leftArmAngle + Math.PI) / (2 * Math.PI),
			(rightArmAngle + Math.PI) / (2 * Math.PI),
			nearestFoodDistance / Math.sqrt(canvas.width * canvas.width + canvas.height * canvas.height)
		];
	}
	// Function to get the neural network's output
	// Function to get the neural network's output
	getNetworkOutput(canvas, x, y, nearestObjectType, nearestObjectXPos, nearestObjectYPos, energy, foodCnt) {
		let nearestObjectTypeNum = 0.0; // 0 for no object, .1 for food, .2 for poison, .3 for robot_body, .4 for robot_arm

		if (nearestObjectType === 'food')
			nearestObjectTypeNum = .1;
		else if (nearestObjectType === 'poison')
			nearestObjectTypeNum = .2;
		else if (nearestObjectType === 'robot_body')
			nearestObjectTypeNum = .3;
		else if (nearestObjectType === 'robot_arm')
			nearestObjectTypeNum = .4;

		// Calculate leftArmAngle and rightArmAngle
		const leftArmAngle = Matter.Vector.angle(this.body.position, this.leftArm.position);
		const rightArmAngle = Matter.Vector.angle(this.body.position, this.rightArm.position);

		// Calculate nearestFoodDistance (you may need to adjust this based on how you're tracking food)
		const nearestFoodDistance = Math.sqrt(
			Math.pow(x - nearestObjectXPos, 2) + Math.pow(y - nearestObjectYPos, 2)
		);

		let input = this.normalizeInputs(
			x,
			y,
			energy,
			foodCnt,
			leftArmAngle,
			rightArmAngle,
			nearestFoodDistance
		);

		let pred = 0;

		if (Math.random() < 0.1) {  // 10% chance of random action
			pred = Math.floor(Math.random() * 8);
		} else {
			pred = this.net.run(input);
		    
			// const actionIndex = pred.indexOf(Math.max(...pred));

			// console.log(`Creature chose action ${actionIndex} with confidence ${pred[actionIndex]}%`);

		}

		return pred;
	}
}
